export function handleize(str) {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '')
}

export function sleep(ms = 1000) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createCSV(data) {
	const header = Object.keys(data[0]).join(',')
	const rows = data.map((row) =>
		Object.values(row)
			.map((v) => `"${String(v).replace(/"/g, '""')}"`)
			.join(',')
	)
	return header + '\n' + rows.join('\n')
}
