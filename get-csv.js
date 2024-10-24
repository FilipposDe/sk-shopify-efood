import gql from 'graphql-tag'
import fs from 'fs'
import dotenv from 'dotenv'
import '@shopify/shopify-api/adapters/node'
import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import { bulkQuery } from './services/bulk.js'
import { htmlToText } from 'html-to-text'

dotenv.config()

export default async function getFinalCSV() {
	const jsonlText = await storeJsonl()
	const csvStr = generateCSV(jsonlText)
	return csvStr
}

async function storeJsonl() {
	const queryStr = gql`
		{
			products(query: "status:active") {
				edges {
					node {
						id
						options {
							name
							values
						}
						featuredMedia {
							preview {
								image {
									url
								}
							}
						}
						title
						descriptionHtml
						inMeat: inCollection(
							id: "gid://shopify/Collection/605268476241"
						)
						inMeatProducts: inCollection(
							id: "gid://shopify/Collection/604542337361"
						)
						variants {
							edges {
								node {
									sku
									price
									selectedOptions {
										name
										value
									}
								}
							}
						}
					}
				}
			}
		}
	`.loc.source.body

	// Config Shopify
	const shopify = shopifyApi({
		apiSecretKey: process.env.SHOPIFY_API_SECRET,
		apiVersion: ApiVersion.October24,
		isCustomStoreApp: true,
		adminApiAccessToken: process.env.SHOPIFY_API_ACCESS_TOKEN,
		isEmbeddedApp: false,
		hostName: process.env.SHOP,
		logger: {
			level: 'info',
		},
	})

	const session = shopify.session.customAppSession(process.env.SHOP)
	const client = new shopify.clients.Graphql({ session })

	const text = await bulkQuery(queryStr.replace(/"/g, '\\"'), client)
	return text
}

function generateCSV(productsStr) {
	const products = {}
	const optionNames = new Set()

	for (const line of productsStr.split('\n')) {
		if (!line) {
			continue
		}
		const v = JSON.parse(line)

		if (v.id) {
			if (products[v.id]) {
				products[v.id] = { ...products[v.id], ...v }
			} else {
				products[v.id] = { ...v, ProductVariants: [] }
			}
			for (const o of v.options) {
				optionNames.add(o.name)
			}
		} else {
			const pId = v.__parentId
			if (!products[pId]) {
				products[pId] = { ProductVariants: [] }
			}
			products[pId].ProductVariants.push(v)
		}
	}

	for (const pId of Object.keys(products)) {
		if (!products[pId].inMeat && !products[pId].inMeatProducts) {
			delete products[pId]
		}
	}

	const items = []

	for (const v of Object.values(products)) {
		if (v.options[0].name === 'Title') {
			items.push({
				SKU: v.ProductVariants[0].sku.replace(/\s/g, '_'),
				'productTitle::el_GR': v.title,
				description: processDescription(v.descriptionHtml),
				imageUrls: v.featuredMedia.preview.image.url,
				'weightable_attributes::sold_by_weight': 'FALSE',
				'weightable_attributes::minimum_starting_weight::value': '',
				'weightable_attributes::minimum_starting_weight::unit': '',
				Price: v.ProductVariants[0].price,
				Comments: 'Τεμαχιακό προιόν / τιμή τεμαχίου',
			})
		} else if (v.options.some((o) => o.name === 'Βάρος')) {
			const variantsByWeight = v.ProductVariants.sort((a, b) => {
				return (
					Number(
						a.selectedOptions.find((o) => o.name === 'Βάρος').value
					) -
					Number(
						b.selectedOptions.find((o) => o.name === 'Βάρος').value
					)
				)
			})

			const lightestVariant = variantsByWeight[0]

			const lightestVariantWeight = Number(
				lightestVariant.selectedOptions.find((o) => o.name === 'Βάρος')
					.value
			)

			const hasCutMethod = v.options.some((o) =>
				o.name.includes('Τρόπος κοπής')
			)

			items.push({
				SKU: lightestVariant.sku.replace(/\s/g, '_'),
				'productTitle::el_GR': v.title,
				description: processDescription(v.descriptionHtml),
				imageUrls: v.featuredMedia.preview.image.url,
				'weightable_attributes::sold_by_weight': 'TRUE',
				'weightable_attributes::minimum_starting_weight::value':
					lightestVariantWeight * 1000,
				'weightable_attributes::minimum_starting_weight::unit': 'kg',
				Price: lightestVariant.price,
				Comments: `Ζυγιζόμενο προιόν με βήμα/ τιμή κιλού. ${
					hasCutMethod ? 'Προσθέστε στα σχόλια τρόπο κοπής.' : ''
				}`,
			})
		}
	}

	const csvStr = createCSV(items)

	return csvStr
}

// fs.writeFileSync('temp/initial.csv', csvStr)

function createCSV(data) {
	const header = Object.keys(data[0]).join(',')
	const rows = data.map((row) =>
		Object.values(row)
			.map((v) => `"${String(v).replace(/"/g, '""')}"`)
			.join(',')
	)
	return header + '\n' + rows.join('\n')
}

function processDescription(html) {
	if (!html) {
		return ''
	}
	let text = htmlToText(html, {
		wordwrap: false,
		preserveNewlines: true,
	})

	text = text
		.split('\n')
		.map((line) => {
			line = line.trim()
			if (line && !line.endsWith('.')) {
				return line + '.'
			}
			return line
		})
		.join(' ')

	if (text.length > 445) {
		text = text.slice(0, 445) + '...'
	}

	return text
}
