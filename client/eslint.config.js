import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // shadcn's generated components ship with their variant factory in the
      // same file (`export { Button, buttonVariants }`) — that pairing is the
      // library's public API and is imported as such across the app. Allow
      // exactly those two names rather than splitting generated code or
      // disabling the rule; every other mixed export is still an error.
      // `allowConstantExport` is carried over from the vite preset (this
      // rules block replaces the preset's options wholesale).
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,
        allowExportNames: ['badgeVariants', 'buttonVariants'],
      }],
    },
  },
])
