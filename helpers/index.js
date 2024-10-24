export function handleize(str) {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '')
}

export function sleep(ms = 1000) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
