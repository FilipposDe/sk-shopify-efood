import SftpClient from 'ssh2-sftp-client'
import dotenv from 'dotenv'
import getFTPCSV from './get-ftp-csv.js'

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

	await client.put(csvStr, 'catalog/siakos_7531684.csv')
} catch (error) {
	console.error('SFTP connection error:', error)
} finally {
	client.end()
}
