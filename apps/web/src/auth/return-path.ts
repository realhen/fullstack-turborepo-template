export function safeReturnPath(
  value: FormDataEntryValue | string | null | undefined,
): string {
  const hasControl = (path: string) =>
    [...path].some((character) => character.charCodeAt(0) < 32)
  if (
    typeof value !== 'string' ||
    !value.startsWith('/app') ||
    (value !== '/app' && !value.startsWith('/app/')) ||
    value.startsWith('//') ||
    hasControl(value)
  )
    return '/app'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded !== value || decoded.startsWith('//') || hasControl(decoded))
      return '/app'
    return value
  } catch {
    return '/app'
  }
}
