import { describe, expect, it } from 'vitest'
import { requiresAuthentication } from './proxy'
describe('route policy', () =>
  it('protects only /app and its descendants', () => {
    expect(requiresAuthentication('/app')).toBe(true)
    expect(requiresAuthentication('/app/members')).toBe(true)
    expect(requiresAuthentication('/')).toBe(false)
    expect(requiresAuthentication('/sign-in')).toBe(false)
  }))
