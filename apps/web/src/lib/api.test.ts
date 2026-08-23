import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApiHealth } from './api'

describe('getApiHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a validated health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ service: 'api', status: 'ok' })),
    )

    await expect(getApiHealth()).resolves.toEqual({
      service: 'api',
      status: 'ok',
    })
  })

  it('fails closed when the API response is unsuccessful', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: 'unavailable' }, { status: 503 }),
        ),
    )

    await expect(getApiHealth()).resolves.toBeNull()
  })
})
