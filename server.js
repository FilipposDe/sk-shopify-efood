import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'
import basicAuth from 'basic-auth'
import getFinalCSV from './get-csv.js'
import { generateAndPrintOrder } from './services/print.js'

dotenv.config()

const app = express()
app.use(helmet())

app.use(express.json())

const auth = (req, res, next) => {
	const user = basicAuth(req)

	if (
		!user ||
		user.name !== process.env.AUTH_USERNAME ||
		user.pass !== process.env.AUTH_PASSWORD
	) {
		res.set('WWW-Authenticate', 'Basic realm="example"')
		return res.status(401).send('Authentication required.')
	}
	next()
}

app.get('/initial-catalog', auth, (req, res) => {
	res.send(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Initial Catalog</title>
            </head>
            <body>
                <form action="/initial-catalog" method="post" enctype="multipart/form-data">
                    <button onclick="this.disabled = 'disabled'" type="submit">Δημιουργία αρχικού καταλόγου</button>
                </form>
            </body>
        </html>
    `)
})

app.post('/initial-catalog', auth, async (req, res) => {
	try {
		const str = await getFinalCSV()
		res.setHeader(
			'Content-Disposition',
			'attachment; filename="output.csv"'
		)
		res.setHeader('Content-Type', 'text/csv')
		console.log('Created initial catalog')
		res.send(str)
	} catch (error) {
		console.error(error)
		res.sendStatus(500)
	}
})

app.post('/webhooks/order-created', async (req, res) => {
	generateAndPrintOrder(req.body)
	res.sendStatus(200)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
