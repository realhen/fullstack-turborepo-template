import { describe, expect, it } from 'vitest'
import { authCookieOptions, deleteAuthCookieOptions } from './cookies'
describe('auth cookies', () => it('uses secure host-only HttpOnly cookies and matching deletion options', () => {
  expect(authCookieOptions('flow', true)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 600 })
  expect(deleteAuthCookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 0 })
}))
