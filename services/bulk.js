import fs from 'fs'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { sleep } from '../helpers/index.js'

function saveToJsonl(items, file) {
	const text = items.map((item) => JSON.stringify(item)).join('\n')
	fs.writeFileSync(file, text)
}

async function createStageForUpload(client) {
	const query = `
        mutation {
            stagedUploadsCreate(input:{
                resource: BULK_MUTATION_VARIABLES,
                filename: "mutationsfile",
                mimeType: "text/jsonl",
                httpMethod: POST
            }){
                userErrors { field message }
                stagedTargets{
                    url
                    resourceUrl
                    parameters { name value }
                }
            }
        }
    `

	const response = await client.request(query)
	const target = response.data.stagedUploadsCreate.stagedTargets?.[0]
	const url = target?.url
	const parameters = target?.parameters
	if (!url || !parameters) {
		throw new Error(
			'No url or parameters returned from resource creation query'
		)
	}

	return { url, parameters }
}

async function postFile(url, params) {
	//console.log('url', url)
	//console.log('params', params)
	let keyUrl = params.find((item) => item.name === 'key').value

	const form = new FormData()
	for (const param of params) {
		form.append(param.name, param.value)
		if (param.name === 'key') {
			keyUrl = param.value
		}
	}

	const buffer = fs.readFileSync('temp/bulk.jsonl')
	form.append('file', buffer, {
		contentType: 'text/jsonl',
		name: 'file',
		filename: 'temp/bulk.jsonl',
	})

	// console.log(form)

	const response = await fetch(url, { method: 'POST', body: form })
	if (response.status !== 201 && response.status !== 200) {
		const text = await response.text()
		console.log(text)
		throw new Error(`Error uploading file: ${response.status}`)
	}

	return keyUrl
}

async function sendBulkMutation(url, mutationStr, client) {
	const wrapperQueryStr = `
        mutation {
            bulkOperationRunMutation(
                mutation: "${mutationStr}",
                stagedUploadPath: "${url}"
            ){
                bulkOperation {
                    id
                    url
                    status
                }
                userErrors {
                    message
                    field
                }
            }
        }
    `

	const response = await client.request(wrapperQueryStr)

	if (response.data.bulkOperationRunMutation.userErrors.length > 0) {
		throw new Error(
			`🚫 Error running bulk mutation: ${JSON.stringify(
				response.data.bulkOperationRunMutation.userErrors,
				null,
				2
			)}`
		)
	}

	const { id } = response.data.bulkOperationRunMutation.bulkOperation
	return id
}

async function sendBulkQuery(queryStr, client) {
	const wrapperQueryStr = `
        mutation {
            bulkOperationRunQuery(query: "${queryStr}") {
                bulkOperation {
                    id
                    status
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `

	const response = await client.request(wrapperQueryStr)

	if (response.data.bulkOperationRunQuery.userErrors.length > 0) {
		throw new Error(
			`🚫 Error running bulk query: ${JSON.stringify(
				response.data.bulkOperationRunQuery.userErrors,
				null,
				2
			)}`
		)
	}

	const { id } = response.data.bulkOperationRunQuery.bulkOperation
	console.log({ id })
	return id
}

async function pollForCurrentBulkOpUrl(currentId, isMutation, client) {
	while (true) {
		await sleep(1000)
		const pollQuery = `
                {
                    currentBulkOperation${
						isMutation ? '(type: MUTATION)' : ''
					} {
                        id
                        status
                        errorCode
                        url
                        partialDataUrl
                    }
                }
            `

		const response = await client.request(pollQuery)

		const { id, status, url, partiaDatalUrl, errorCode } =
			response.data.currentBulkOperation

		if (errorCode) {
			throw new Error(`Error returned from bulk mutation: ${errorCode}`)
		}
		if (currentId !== id) {
			throw new Error(
				`Bulk operation polled is the wrong one ${id} !== ${currentId}`
			)
		}
		if (partiaDatalUrl) {
			throw new Error(
				'Something went wrong with the bulk mutation, partially executed'
			)
		}
		if (status === 'FAILED') {
			throw new Error(
				'Something went wrong with the bulk mutation, status: FAILED'
			)
		}

		if (status === 'COMPLETED') {
			return url
		}
	}
}

export async function bulkMutation(data, mutationStr, client) {
	// 1. Store variables (inputs) into jsonl
	saveToJsonl(data, 'temp/bulk.jsonl')

	// 2. Create staging url
	const { url, parameters } = await createStageForUpload(client)

	// 3. POST the file to the URL
	const keyUrl = await postFile(url, parameters)

	// 4. Send mutation to run operation
	const updateQueryId = await sendBulkMutation(keyUrl, mutationStr, client)

	// 5. Poll for result file url
	const resultingUrl = await pollForCurrentBulkOpUrl(
		updateQueryId,
		true,
		client
	)

	// 6. Get result jsonl
	const mutationResult = await fetch(resultingUrl)
	const text = await mutationResult.text()

	// 7. Save contents
	fs.writeFileSync('temp/bulk-result.jsonl', text)

	console.log('Finished')
}

export async function bulkQuery(query, client) {
	const updateQueryId = await sendBulkQuery(query, client)

	// 5. Poll for result file url
	const resultingUrl = await pollForCurrentBulkOpUrl(
		updateQueryId,
		false,
		client
	)

	// 6. Get result jsonl
	const mutationResult = await fetch(resultingUrl)
	const text = await mutationResult.text()

	// 7. Save contents
	fs.writeFileSync('temp/bulk-q-result.jsonl', text)
}
