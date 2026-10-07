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
  {
    // API/response DTOs may not be hand-written in page modules any more: the
    // Zod contracts in shared/schemas.ts are the single source of truth and
    // pages import their inferred types from shared/types (type-only, zero
    // bundle cost). The server contract test validates those schemas against
    // live responses, so a locally re-declared shape can silently drift. UI
    // types that are not API contracts stay allowed as `type` aliases.
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'TSInterfaceDeclaration',
        message: 'API/response shapes live in shared/schemas.ts — import the type from shared/types instead of declaring a local interface. Pure UI shapes use a `type` alias.',
      }],
    },
  },
  {
    // Same policy for components/lib/hooks, with one carve-out: interfaces
    // whose names end in Props/State are React component contracts and stay
    // local. Everything else that used to be a hand-written interface is
    // either a migrated API contract (import from shared/types) or a local
    // shape expressed as a `type` alias — so a new interface here is always
    // an accident waiting to drift from the server.
    files: ['src/components/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'TSInterfaceDeclaration:not([id.name=/.*(?:Props|State)$/])',
        message: 'API/response shapes live in shared/schemas.ts — import the type from shared/types. Other local shapes use a `type` alias; only *Props/*State component contracts stay interfaces.',
      }],
    },
  },
])
