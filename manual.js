import fs from 'fs'
import getFTPCSVs from './get-ftp-csvs.js'

const [csvStr, discountCsvStr] = await getFTPCSVs()
fs.writeFileSync('temp/manual-ftp.csv', csvStr, 'utf8')
fs.writeFileSync('temp/manual-ftp-discount.csv', discountCsvStr, 'utf8')
