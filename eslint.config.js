import globals from 'globals'

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		languageOptions: { globals: globals.node, ecmaVersion: 'latest' },

		rules: {
			'no-unused-vars': 'warn',
			'no-undef': 'error',
		},
	},
]
