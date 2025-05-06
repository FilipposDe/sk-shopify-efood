import fs from 'fs'
import getFTPCSV from './get-ftp-csv.js'

const csvStr = await getFTPCSV()
fs.writeFileSync('temp/manual-ftp.csv', csvStr, 'utf8')
