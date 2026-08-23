import { describe, expect, it } from 'vitest'
import { ApiClientError, unwrap } from './index.js'

describe('unwrap', () => {
  it('returns successful response data', () => {
    expect(unwrap({ data: { ok: true }, response: new Response() })).toEqual({ ok: true })
  })

  it('normalizes API errors', () => {
    expect(() => unwrap({ error: { message: 'nope' }, response: new Response(null, { status: 403 }) })).toThrow(ApiClientError)
  })
})
