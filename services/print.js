// shopify-to-printnode.js
import fs from 'fs'
import dotenv from 'dotenv'
import gql from 'graphql-tag'
import PDFDocument from 'pdfkit'
import { PassThrough } from 'stream'
import { shopifyApi, ApiVersion, LogSeverity } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'
dotenv.config()

const FONT_SIZE_TEXT = 9
const LINE_SPACING = 1
const PAGE_WIDTH = 165
const PAGE_HEIGHT = 150
const IMAGE_MARGIN = 8 // points of extra space after images

function getTextHeight(doc, text, type = 'text') {
	// Use the correct font for height calculation
	const prevFont = doc._font && doc._font.name
	if (type === 'boldText') {
		doc.font('RobotoSlab-Bold')
	} else {
		doc.font('RobotoSlab')
	}
	const height =
		doc.heightOfString(text, {
			width: PAGE_WIDTH - 20,
			align: 'center',
			lineGap: 0,
		}) +
		(LINE_SPACING / FONT_SIZE_TEXT) * doc.currentLineHeight()
	// Restore previous font
	if (prevFont) doc.font(prevFont)
	return height
}

async function renderPage(doc, instructions) {
	// Calculate total height
	let totalHeight = 0
	for (const instr of instructions) {
		if (instr.type === 'text' || instr.type === 'boldText') {
			totalHeight += getTextHeight(doc, instr.text, instr.type)
		} else if (instr.type === 'image') {
			totalHeight +=
				IMAGE_MARGIN + // margin above image
				instr.fitHeight +
				(LINE_SPACING / FONT_SIZE_TEXT) * doc.currentLineHeight()
		}
	}
	const startY = Math.max(
		(PAGE_HEIGHT - totalHeight) / 2,
		doc.page.margins.top
	)
	doc.y = startY
	for (const instr of instructions) {
		if (instr.type === 'text') {
			doc.font('RobotoSlab')
			doc.text(instr.text, { align: 'center', lineGap: 0 })
			doc.moveDown(LINE_SPACING / FONT_SIZE_TEXT)
		} else if (instr.type === 'boldText') {
			doc.font('RobotoSlab-Bold')
			doc.text(instr.text, { align: 'center', lineGap: 0 })
			doc.font('RobotoSlab')
			doc.moveDown(LINE_SPACING / FONT_SIZE_TEXT)
		} else if (instr.type === 'image') {
			doc.y += IMAGE_MARGIN // add margin above image
			try {
				const imgRes = await fetch(instr.url)
				const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
				doc.image(imgBuffer, (PAGE_WIDTH - instr.fitWidth) / 2, doc.y, {
					fit: [instr.fitWidth, instr.fitHeight],
					align: 'center',
					valign: 'center',
				})
				doc.y += instr.fitHeight
				doc.moveDown(LINE_SPACING / FONT_SIZE_TEXT)
			} catch {
				doc.font('RobotoSlab')
				doc.text('Barcode fetch failed', {
					align: 'center',
					lineGap: 0,
				})
				doc.moveDown(LINE_SPACING / FONT_SIZE_TEXT)
			}
		}
	}
}

/**
 * @param {Object} order - Shopify order node
 */
export async function generateAndPrintOrder(restOrder) {
	const order = await getOrderNode(restOrder.admin_graphql_api_id)
	const shop = await getShop()

	const doc = new PDFDocument({
		size: [PAGE_WIDTH, PAGE_HEIGHT],
		margin: 10,
	})
	const bufferChunks = []
	const stream = new PassThrough()
	doc.pipe(stream)
	stream.on('data', (chunk) => bufferChunks.push(chunk))

	doc.registerFont('RobotoSlab', './assets/RobotoSlab-Regular.ttf')
	doc.registerFont('RobotoSlab-Bold', './assets/RobotoSlab-Bold.ttf')
	doc.font('RobotoSlab')
	doc.fontSize(FONT_SIZE_TEXT)

	const shipping = order.shippingAddress || {}
	const fulfillment = order.fulfillments?.[0] || {}
	const trackingNumber = fulfillment?.trackingInfo?.[0]?.number

	// First two pages: order info (centered vertically)
	for (let i = 0; i < 2; i++) {
		const instructions = []
		instructions.push({ type: 'text', text: order.name || '' })
		if (shipping.name)
			instructions.push({ type: 'text', text: shipping.name })
		if (shipping.address1)
			instructions.push({ type: 'text', text: shipping.address1 })
		if (shipping.address2)
			instructions.push({ type: 'text', text: shipping.address2 })
		if (shipping.city || shipping.zip)
			instructions.push({
				type: 'text',
				text: `${shipping.city || ''} ${shipping.zip || ''}`,
			})
		if (shipping.phone)
			instructions.push({
				type: 'text',
				text: shipping.phone.replace('+30', ''),
			})
		await renderPage(doc, instructions)
		doc.addPage()
	}

	// Barcode page (centered vertically)
	const barcodeInstructions = []
	barcodeInstructions.push({ type: 'text', text: order.name || '' })
	if (shipping.name)
		barcodeInstructions.push({ type: 'text', text: shipping.name })
	if (shipping.address1)
		barcodeInstructions.push({ type: 'text', text: shipping.address1 })
	if (shipping.address2)
		barcodeInstructions.push({ type: 'text', text: shipping.address2 })
	if (shipping.city || shipping.zip)
		barcodeInstructions.push({
			type: 'text',
			text: `${shipping.city || ''} ${shipping.zip || ''}`,
		})
	if (trackingNumber) {
		barcodeInstructions.push({
			type: 'image',
			url: `https://barcodeapi.org/api/128/${encodeURIComponent(
				trackingNumber
			)}`,
			fitWidth: 120 * 0.5,
			fitHeight: 50 * 0.5,
		})
	}
	await renderPage(doc, barcodeInstructions)
	doc.addPage()

	// Line item pages (centered vertically)
	const lineNodes = order.lineItems.edges
		.map((edge) => edge.node)
		.filter((node) => node.title !== 'Tip')

	for (const node of lineNodes) {
		doc.addPage()
		const instructions = []
		instructions.push({
			type: 'text',
			text: `${shop?.name || ''} | ${
				shop?.billingAddress?.phone?.replace('+30', '') || ''
			}`,
		})
		instructions.push({ type: 'boldText', text: node.title })
		let kg = false
		const options = node.variant?.selectedOptions || []
		const hasVaros = options.some((o) => o.name === 'Βάρος')
		if (hasVaros) {
			try {
				kg = options.find((o) => o.name === 'Βάρος')?.value
				if (kg === '' || isNaN(parseFloat(kg))) {
					kg = false
				}
			} catch {
				kg = false
			}
		}
		const total = parseFloat(node.originalTotalSet.presentmentMoney.amount)
		if (kg !== false) {
			const perKg = total / parseFloat(kg)
			instructions.push({
				type: 'text',
				text: `Τιμή κιλού: €${perKg.toFixed(2)}`,
			})
		}
		instructions.push({
			type: 'text',
			text: `Συνολικό κόστος: €${total.toFixed(2)}`,
		})
		if (kg !== false) {
			instructions.push({
				type: 'text',
				text: `Βάρος προϊόντος: ${kg} kg`,
			})
		}
		await renderPage(doc, instructions)
	}
	doc.end()
	await new Promise((resolve) => stream.on('finish', resolve))
	const buffer = Buffer.concat(bufferChunks)
	// fs.writeFileSync('order.pdf', buffer)
	// return buffer

	// Log the buffer size
	console.log(`Generated PDF size: ${buffer.length} bytes`)

	// // Send to PrintNode
	// const res = await fetch('https://api.printnode.com/printjobs', {
	// 	method: 'POST',
	// 	headers: {
	// 		Authorization:
	// 			'Basic ' +
	// 			Buffer.from(`${printNodeApiKey}:`).toString('base64'),
	// 		'Content-Type': 'application/json',
	// 	},
	// 	body: JSON.stringify({
	// 		printerId,
	// 		title: `Order ${order.name}`,
	// 		contentType: 'pdf_base64',
	// 		content: buffer.toString('base64'),
	// 		source: 'Shopify Auto Print',
	// 	}),
	// })

	// if (!res.ok) {
	// 	const text = await res.text()
	// 	throw new Error(`PrintNode error: ${res.status} ${text}`)
	// }

	// return await res.json()
}

async function getOrderNode(id) {
	console.log(id)
	const queryStr = gql`
		query getOrder($id: ID!) {
			order(id: $id) {
				name
				shippingAddress {
					name
					company
					address1
					address2
					city
					province
					zip
					phone
				}
				fulfillments {
					trackingInfo {
						number
					}
				}
				lineItems(first: 250) {
					edges {
						node {
							title
							originalTotalSet {
								presentmentMoney {
									amount
								}
							}
							variant {
								selectedOptions {
									name
									value
								}
							}
						}
					}
				}
				# shop {
				#     name
				#     phone
				# }
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
			level: LogSeverity.Error,
		},
	})

	const session = shopify.session.customAppSession(process.env.SHOP)
	const client = new shopify.clients.Graphql({ session })

	const res = await client.request(queryStr, {
		variables: { id },
	})
	console.log(res.data)
	return res.data.order
}

async function getShop() {
	const queryStr = gql`
		{
			shop {
				name
				billingAddress {
					phone
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
			level: LogSeverity.Error,
		},
	})

	const session = shopify.session.customAppSession(process.env.SHOP)
	const client = new shopify.clients.Graphql({ session })

	const res = await client.request(queryStr)
	return res.data.shop
}

// // Sample Shopify GraphQL order node data
// const sampleOrder = {
// 	name: '#80597',
// 	shippingAddress: {
// 		name: 'Παναγιώτα Καρμή',
// 		company: null,
// 		address1: '25ης Μαρτίου 70',
// 		address2: '2ος',
// 		city: 'Πειραιάς',
// 		province: null,
// 		zip: '185 42',
// 		phone: '+306946466778',
// 	},
// 	fulfillments: [
// 		{
// 			trackingInfo: [{ number: '17970222' }],
// 		},
// 	],
// 	lineItems: {
// 		edges: [
// 			{
// 				node: {
// 					title: 'Φιλέτο Κοτόπουλο βιολογικό πίνδος - Ολόκληρο / 1',
// 					originalTotalSet: { presentmentMoney: { amount: '23.90' } },
// 					variant: {
// 						selectedOptions: [
// 							{ name: 'Βάρος', value: '1' },
// 							{ name: 'Τύπος', value: 'Ολόκληρο' },
// 						],
// 					},
//
// 				},
// 			},
// 			{
// 				node: {
// 					title: 'Νουά Από Βιολογική Μοσχίδα Ελλάδος - Ολόκληρο / 0.5',
// 					originalTotalSet: { presentmentMoney: { amount: '11.50' } },
// 					variant: {
// 						selectedOptions: [
// 							{ name: 'Βάρος', value: '0.5' },
// 							{ name: 'Τύπος', value: 'Ολόκληρο' },
// 						],
// 					},
//
// 				},
// 			},
// 			{
// 				node: {
// 					title: 'Κιμάς Άπαχος Από Βιολογική Μοσχίδα Ελλάδος - 0.5',
// 					originalTotalSet: { presentmentMoney: { amount: '10.50' } },
// 					variant: {
// 						selectedOptions: [{ name: 'Βάρος', value: '0.5' }],
// 					},
// 					product: {
// 						options: ['Βάρος'],
// 					},
// 				},
// 			},
// 			{
// 				node: {
// 					title: 'Another product',
// 					originalTotalSet: { presentmentMoney: { amount: '5.00' } },
// 					variant: {
// 						selectedOptions: [],
// 					},
//
// 				},
// 			},
// 			{
// 				node: {
// 					title: 'Tip',
// 					originalTotalSet: { presentmentMoney: { amount: '2.00' } },
// 					variant: {
// 						selectedOptions: [],
// 					},
//
// 				},
// 			},
// 		],
// 	},
// 	shop: {
// 		name: 'siakos.gr',
// 		phone: '+302104123456',
// 	},
// }

// generateAndPrintOrder(sampleOrder).then((buffer) =>
// 	fs.writeFileSync('order.pdf', buffer)
// )
