import js from '@eslint/js'
import globals from 'globals'
import frontendConfig from './frontend/eslint.config.js'

// Repository-wide lint. The frontend's own rules apply unchanged to frontend/ and to the React test
// files; backend/, shared/ and the Node test files get the same recommended rules with Node globals.
const frontendRules = frontendConfig.find((entry) => entry.files)

const nodeLanguageOptions = {
  ecmaVersion: 2022,
  globals: globals.node,
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
}

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
    ],
  },
  {
    ...frontendRules,
    files: ['frontend/**/*.{js,jsx}', 'tests/**/*.jsx', 'tests/shared/firebase-double/client/**/*.js'],
  },
  {
    files: ['backend/**/*.js', 'shared/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: nodeLanguageOptions,
    rules: {
      ...js.configs.recommended.rules,
      // Express error handlers must declare all four parameters; `_next` marks the unused one.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]
