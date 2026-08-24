import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './return-path'
describe('safeReturnPath', () => {
  it.each(['/app', '/app/members?tab=pending'])(
    'retains application paths',
    (value) => expect(safeReturnPath(value)).toBe(value),
  )
  it.each([
    '//evil.test',
    'https://evil.test/app',
    '/%2f%2fevil',
    '/app\\evil',
    '/app%0aevil',
    '/members',
  ])('rejects unsafe paths', (value) =>
    expect(safeReturnPath(value)).toBe('/app'),
  )
})
