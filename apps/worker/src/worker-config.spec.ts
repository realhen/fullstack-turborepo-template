import { describe, expect, it } from 'vitest'
import {
  MINIMUM_BILLING_JOB_LEASE_MILLISECONDS,
  workerConfigFromEnvironment,
} from './worker-config.js'

describe('workerConfigFromEnvironment', () => {
  it('rejects a lease that cannot safely fit a heartbeat', () => {
    expect(() =>
      workerConfigFromEnvironment({
        BILLING_JOB_LEASE_MS: String(
          MINIMUM_BILLING_JOB_LEASE_MILLISECONDS - 1,
        ),
      }),
    ).toThrow(
      `BILLING_JOB_LEASE_MS must be at least ${MINIMUM_BILLING_JOB_LEASE_MILLISECONDS}ms`,
    )
  })

  it('uses a strictly earlier heartbeat for the smallest accepted lease', () => {
    const config = workerConfigFromEnvironment({
      BILLING_JOB_LEASE_MS: String(MINIMUM_BILLING_JOB_LEASE_MILLISECONDS),
    })

    expect(config.heartbeatMilliseconds).toBeLessThan(config.leaseMilliseconds)
  })
})
