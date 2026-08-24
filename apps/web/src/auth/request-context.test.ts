import { describe, expect, it } from 'vitest'
import { requestContextFromHeaders } from './request-context'
describe('request context', () => {
  it('uses the first valid Vercel address and ignores arbitrary headers', () => {
    expect(requestContextFromHeaders(new Headers({ 'x-vercel-forwarded-for': 'bad, 203.0.113.1', 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '192.0.2.1', 'user-agent': ' agent ' }))).toEqual({ ipAddress: '203.0.113.1', userAgent: 'agent' })
  })
  it('uses x-forwarded-for only as fallback and preserves absent values', () => expect(requestContextFromHeaders(new Headers({ 'x-forwarded-for': '2001:db8::1, bad', 'user-agent': ' ' }))).toEqual({ ipAddress: '2001:db8::1' }))
})
