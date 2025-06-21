// // shopify-to-printnode.js
// import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
// import fetch from 'node:node-fetch' // for Node 18+, this can be just 'fetch'
// import { Buffer } from 'node:buffer'

// /**
//  * @param {Object} order - Shopify order node
//  * @param {string} printNodeApiKey
//  * @param {number} printerId
//  */
// export async function generateAndPrintOrder(order, printNodeApiKey, printerId) {
// 	const pdfDoc = await PDFDocument.create()
// 	const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
// 	const mmToPt = (mm) => (mm * 72) / 25.4
// 	const width = mmToPt(58)
// 	const height = mmToPt(53)

// 	const shipping = order.shippingAddress || {}
// 	const fulfillment = order.fulfillments?.[0] || {}
// 	const trackingNumber = fulfillment?.trackingInfo?.[0]?.number

// 	async function drawAddressPage() {
// 		const page = pdfDoc.addPage([width, height])
// 		let y = height - 20

// 		page.drawText(order.name || '', { x: 10, y, size: 8, font })
// 		y -= 12

// 		if (shipping.name) {
// 			const lines = [
// 				shipping.name,
// 				shipping.company,
// 				shipping.address1,
// 				shipping.address2,
// 				[shipping.city, shipping.province, shipping.zip]
// 					.filter(Boolean)
// 					.join(', '),
// 				shipping.phone,
// 			].filter(Boolean)

// 			for (const line of lines) {
// 				page.drawText(line, { x: 10, y, size: 8, font })
// 				y -= 10
// 			}
// 		} else {
// 			page.drawText('No shipping address', { x: 10, y, size: 8, font })
// 			y -= 10
// 		}

// 		if (trackingNumber) {
// 			try {
// 				const imgRes = await fetch(
// 					`https://barcodeapi.org/api/128/${encodeURIComponent(
// 						trackingNumber
// 					)}`
// 				)
// 				const imgBuffer = await imgRes.arrayBuffer()
// 				const image = await pdfDoc.embedPng(imgBuffer)
// 				page.drawImage(image, {
// 					x: 10,
// 					y: 5,
// 					width: 100,
// 					height: 40,
// 				})
// 			} catch (e) {
// 				console.warn('Barcode fetch failed:', e.message)
// 			}
// 		}
// 	}

// 	// 3 address copies
// 	for (let i = 0; i < 3; i++) {
// 		await drawAddressPage()
// 	}

// 	// Line item pages
// 	for (const edge of order.lineItems.edges) {
// 		const node = edge.node
// 		if (node.title === 'Tip') continue

// 		const page = pdfDoc.addPage([width, height])
// 		let y = height - 20

// 		page.drawText(
// 			`${order.shop?.name || ''} | ${order.shop?.phone || ''}`,
// 			{ x: 10, y, size: 8, font }
// 		)
// 		y -= 12
// 		page.drawText(node.title, { x: 10, y, size: 8, font })
// 		y -= 12

// 		const price = parseFloat(node.originalUnitPrice.amount)
// 		const total = parseFloat(node.originalTotalSet.presentmentMoney.amount)
// 		const options = node.variant?.selectedOptions || []
// 		const weightOpt = options.find((o) => o.name === 'Βάρος')
// 		let weight = null

// 		if (weightOpt) {
// 			try {
// 				weight = parseFloat(
// 					node.title
// 						.split(' - ')
// 						.pop()
// 						.split(' / ')
// 						.pop()
// 						.replace(/[^\d.]/g, '')
// 				)
// 			} catch {}
// 		}

// 		if (weight) {
// 			const perKg = price / weight
// 			page.drawText(`Τιμή κιλού: €${perKg.toFixed(2)}`, {
// 				x: 10,
// 				y,
// 				size: 8,
// 				font,
// 			})
// 			y -= 10
// 		}

// 		page.drawText(`Συνολικό κόστος: €${total.toFixed(2)}`, {
// 			x: 10,
// 			y,
// 			size: 8,
// 			font,
// 		})
// 		y -= 10

// 		if (weight) {
// 			page.drawText(`Βάρος προϊόντος: ${weight} kg`, {
// 				x: 10,
// 				y,
// 				size: 8,
// 				font,
// 			})
// 		}
// 	}

// 	const pdfBytes = await pdfDoc.save()
// 	const buffer = Buffer.from(pdfBytes)

// 	// Send to PrintNode
// 	const res = await fetch('https://api.printnode.com/printjobs', {
// 		method: 'POST',
// 		headers: {
// 			Authorization:
// 				'Basic ' +
// 				Buffer.from(`${printNodeApiKey}:`).toString('base64'),
// 			'Content-Type': 'application/json',
// 		},
// 		body: JSON.stringify({
// 			printerId,
// 			title: `Order ${order.name}`,
// 			contentType: 'pdf_base64',
// 			content: buffer.toString('base64'),
// 			source: 'Shopify Auto Print',
// 		}),
// 	})

// 	if (!res.ok) {
// 		const text = await res.text()
// 		throw new Error(`PrintNode error: ${res.status} ${text}`)
// 	}

// 	return await res.json()
// }
