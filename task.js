import fs from 'fs'
import dotenv from 'dotenv'
import SftpClient from 'ssh2-sftp-client'
import getFTPCSVs from './get-ftp-csvs.js'

// flyctl machine run . --config fly-task.toml --schedule=daily

dotenv.config()

const [csvStr, discountCsvStr] = await getFTPCSVs()

const client = new SftpClient()
try {
	await client.connect({
		host: process.env.FTP_HOST,
		port: 22,
		username: process.env.FTP_USER,
		password: process.env.FTP_PASSWORD,
	})

	const buffer = Buffer.from(csvStr)
	const discountBuffer = Buffer.from(discountCsvStr)

	// List files first
	// console.log(await client.list('./catalog'))

	// Write those two files locally with fs
	// fs.writeFileSync('./dev-out/catalog/siakos_7531684.csv', buffer)
	// fs.writeFileSync('./dev-out/promotions/siakos_7531684.csv', discountBuffer)

	await client.put(buffer, './catalog/siakos_7531684.csv')
	await client.put(discountBuffer, './promotions/siakos_7531684.csv')

	console.log('File transferred successfully')
} catch (error) {
	console.error('SFTP connection error:', error)
} finally {
	client.end()
}

process.exit(0)
