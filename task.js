import SftpClient from 'ssh2-sftp-client'
import dotenv from 'dotenv'
import getFTPCSV from './get-ftp-csv.js'

// flyctl machine run . --config fly-task.toml --schedule=daily

dotenv.config()

const csvStr = await getFTPCSV()

const client = new SftpClient()
try {
	await client.connect({
		host: process.env.FTP_HOST,
		port: 22,
		username: process.env.FTP_USER,
		password: process.env.FTP_PASSWORD,
	})

	const buffer = Buffer.from(csvStr)

	// List filesfirst
	console.log(await client.list('./catalog'))

	await client.put(buffer, './catalog/siakos_7531684.csv')

	console.log('File transferred successfully')
} catch (error) {
	console.error('SFTP connection error:', error)
} finally {
	client.end()
}

process.exit(0)
