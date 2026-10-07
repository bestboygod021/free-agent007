// Non-React translation surface for library code (api.ts countdowns, anything
// outside the component tree). The provider keeps React state; this module keeps
// a module-level mirror of the ACTIVE locale and dictionary so lib code can
// render the same words the UI would. English is always present as the fallback,
// exactly like the provider's own lookup.
import en from './locales/en.json'
import { DEFAULT_LOCALE, type Locale } from './locale-config'

type Dictionary = Record<string, unknown>

const enDictionary = en as Dictionary
let currentLocale: Locale = DEFAULT_LOCALE
let currentDictionary: Dictionary = enDictionary

/** Called by I18nProvider whenever the active locale/dictionary changes. */
export function syncRuntimeLocale(locale: Locale, dictionary: Dictionary): void {
  currentLocale = locale
  currentDictionary = dictionary
}

export function getCurrentLocale(): Locale {
  return currentLocale
}

function lookup(dictionary: Dictionary, key: string): unknown {
  const segments = key.split('.')
  let current: unknown = dictionary
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in (current as Dictionary)) {
      current = (current as Dictionary)[segment]
    } else {
      return undefined
    }
  }
  return current
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = vars[name]
    return value === undefined || value === null ? `{${name}}` : String(value)
  })
}

/** Same contract as the context's `t`: active dictionary, English fallback, key last. */
export function translate(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(currentDictionary, key)
  if (typeof raw === 'string') return interpolate(raw, vars)
  const fallback = lookup(enDictionary, key)
  if (typeof fallback === 'string') return interpolate(fallback, vars)
  return key
}

/**
 * Format a bare number for the active locale — this is what puts Persian digits
 * (۷) into the countdown label when the dashboard runs in `fa`.
 */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(currentLocale).format(value)
}

/** Test hook: back to the default locale with the English dictionary. */
export function resetRuntimeLocaleForTests(): void {
  currentLocale = DEFAULT_LOCALE
  currentDictionary = enDictionary
}
