// Tiny client-side field validators. Server-side validation stays the source
// of truth; these only power inline field feedback before submit.

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
