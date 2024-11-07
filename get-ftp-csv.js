import gql from 'graphql-tag'
import fs from 'fs'
import dotenv from 'dotenv'
import '@shopify/shopify-api/adapters/node'
import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import { bulkQuery } from './services/bulk.js'
import { createCSV } from './helpers/index.js'

dotenv.config()

export default async function getFTPCSV() {
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
						exclude: metafield(
							namespace: "custom"
							key: "exclude_from_e_food_gr"
						) {
							value
						}
						inMeat: inCollection(
							id: "gid://shopify/Collection/605268476241"
						)
						inMeatProducts: inCollection(
							id: "gid://shopify/Collection/604542337361"
						)
						variants {
							edges {
								node {
									id
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

	// fs.writeFileSync('temp/initial.jsonl', text)

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

		if (v.id.includes('/Product/')) {
			if (products[v.id]) {
				products[v.id] = { ...products[v.id], ...v }
			} else {
				products[v.id] = { ...v, ProductVariants: [] }
			}
			for (const o of v.options) {
				optionNames.add(o.name)
			}
		} else if (v.id.includes('/ProductVariant/')) {
			const pId = v.__parentId
			if (!products[pId]) {
				products[pId] = { ProductVariants: [] }
			}
			products[pId].ProductVariants.push(v)
		}
	}

	for (const pId of Object.keys(products)) {
		if (
			(!products[pId].inMeat && !products[pId].inMeatProducts) ||
			products[pId].exclude?.value === 'true'
		) {
			delete products[pId]
		}
	}

	const items = []

	for (const v of Object.values(products)) {
		if (v.options[0].name === 'Title') {
			items.push({
				sku: v.ProductVariants[0].sku.replace(/\s/g, '_'),
				price: v.ProductVariants[0].price,
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

			items.push({
				sku: lightestVariant.sku.replace(/\s/g, '_'),
				price: lightestVariant.price,
			})
		}
	}

	const csvStr = createCSV(items)

	// Write CSV to file
	// fs.writeFileSync('temp/price.csv', csvStr)

	return csvStr
}
