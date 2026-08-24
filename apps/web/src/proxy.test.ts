import { describe, expect, it } from 'vitest'
import {
  requiresAuthentication,
  temporaryAuthenticationResponse,
} from './proxy'
describe('route policy', () =>
  it('protects only /app and its descendants', () => {
    expect(requiresAuthentication('/app')).toBe(true)
    expect(requiresAuthentication('/app/members')).toBe(true)
    expect(requiresAuthentication('/')).toBe(false)
    expect(requiresAuthentication('/sign-in')).toBe(false)
  }))

it('returns a retryable 503 without clearing cookies', () => {
  const response = temporaryAuthenticationResponse()
  expect(response.status).toBe(503)
  expect(response.headers.get('retry-after')).toBe('5')
  expect(response.headers.get('set-cookie')).toBeNull()
})
