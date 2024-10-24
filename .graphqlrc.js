import { shopifyApiProject, ApiType } from '@shopify/api-codegen-preset'

export default {
	schema: 'https://shopify.dev/admin-graphql-direct-proxy/2024-10',
	documents: ['./*.{js,ts,jsx,tsx}'],
	projects: {
		default: shopifyApiProject({
			apiType: ApiType.Admin,
			apiVersion: '2024-10',
			documents: ['./*.{js,ts,jsx,tsx}'],
			outputDir: './types',
		}),
	},
}
