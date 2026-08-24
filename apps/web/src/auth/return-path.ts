export function safeReturnPath(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/app') || (value !== '/app' && !value.startsWith('/app/')) || value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) return '/app'
  try { const decoded = decodeURIComponent(value); if (decoded !== value || decoded.startsWith('//') || /[\\\x00-\x1f]/.test(decoded)) return '/app'; return value } catch { return '/app' }
}
