import gql from 'graphql-tag'
// import fs from 'fs'
import dotenv from 'dotenv'
import '@shopify/shopify-api/adapters/node'
import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import { bulkQuery } from './services/bulk.js'
import { createCSV } from './helpers/index.js'

dotenv.config()

const PRICE_ADJUST = 1.05

function preciseMultiply(a, b) {
	return Math.round(Number(a) * Number(b) * 100) / 100
}

export default async function getFTPCSVs() {
	const jsonlText = await storeJsonl()
	const csvStrs = generateCSVs(jsonlText)
	return csvStrs
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
									compareAtPrice
									inventoryQuantity
									inventoryItem {
										tracked
									}
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

function generateCSVs(productsStr) {
	const products = {}
	const optionNames = new Set()

	const now = new Date()
	const tomorrow = new Date()
	tomorrow.setDate(now.getDate() + 1)
	const dateStr = tomorrow.toISOString().split('T')[0]
	const startDateStr = `${dateStr} 00:00:00`
	const endDateStr = `${dateStr} 23:59:59`

	const discountFields = {
		campaign_status: 1,
		start_date: startDateStr,
		end_date: endDateStr,
	}

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
	const discountItems = []

	for (const v of Object.values(products)) {
		// if (
		// 	v.ProductVariants?.[0].inventoryItem?.tracked &&
		// 	v.ProductVariants?.[0].inventoryQuantity <= 0
		// ) {
		// 	continue
		// }

		if (v.options[0].name === 'Title') {
			const sku = v.ProductVariants[0].sku.replace(/\s/g, '_')
			if (!sku) continue
			items.push({
				sku,
				price: preciseMultiply(
					Number(v.ProductVariants[0].compareAtPrice) >
						Number(v.ProductVariants[0].price)
						? v.ProductVariants[0].compareAtPrice
						: v.ProductVariants[0].price,
					PRICE_ADJUST
				),
			})
			if (
				Number(v.ProductVariants[0].compareAtPrice) >
				Number(v.ProductVariants[0].price)
			) {
				discountItems.push({
					sku,
					discounted_price: preciseMultiply(
						v.ProductVariants[0].price,
						PRICE_ADJUST
					),
					...discountFields,
				})
			}
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

			const sku = lightestVariant.sku.replace(/\s/g, '_')
			if (!sku) continue

			items.push({
				sku,
				price: preciseMultiply(
					Number(lightestVariant.compareAtPrice) >
						Number(lightestVariant.price)
						? lightestVariant.compareAtPrice
						: lightestVariant.price,
					PRICE_ADJUST
				),
			})
			if (
				Number(lightestVariant.compareAtPrice) >
				Number(lightestVariant.price)
			) {
				discountItems.push({
					sku,
					discounted_price: preciseMultiply(
						lightestVariant.price,
						PRICE_ADJUST
					),
					...discountFields,
				})
			}
		} else if (
			v.options.length === 1 &&
			v.options[0].name.includes('Τρόπος κοπής')
		) {
			const sku = v.ProductVariants[0].sku.replace(/\s/g, '_')
			if (!sku) continue
			items.push({
				sku,
				price: preciseMultiply(
					Number(v.ProductVariants[0].compareAtPrice) >
						Number(v.ProductVariants[0].price)
						? v.ProductVariants[0].compareAtPrice
						: v.ProductVariants[0].price,
					PRICE_ADJUST
				),
			})
			if (
				Number(v.ProductVariants[0].compareAtPrice) >
				Number(v.ProductVariants[0].price)
			) {
				discountItems.push({
					sku,
					discounted_price: preciseMultiply(
						v.ProductVariants[0].price,
						PRICE_ADJUST
					),
					...discountFields,
				})
			}
		}
	}

	const csvStr = createCSV(items)
	const discountCsvStr = createCSV(discountItems)

	return [csvStr, discountCsvStr]
}
