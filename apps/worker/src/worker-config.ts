export const MINIMUM_BILLING_JOB_LEASE_MILLISECONDS = 5_000

export type WorkerConfig = {
  batchSize: number
  heartbeatMilliseconds: number
  leaseMilliseconds: number
  maxAttempts: number
  pollMilliseconds: number
  retryDelayMilliseconds: number
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const value = environment[name]
  if (value === undefined) return fallback
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  ) {
    throw new Error(`${name} must be a positive integer`)
  }
  return Number(value)
}

/** Validates worker timing before any job can be claimed. */
export function workerConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const leaseMilliseconds = positiveInteger(
    environment,
    'BILLING_JOB_LEASE_MS',
    60_000,
  )
  if (leaseMilliseconds < MINIMUM_BILLING_JOB_LEASE_MILLISECONDS) {
    throw new Error(
      `BILLING_JOB_LEASE_MS must be at least ${MINIMUM_BILLING_JOB_LEASE_MILLISECONDS}ms`,
    )
  }
  const heartbeatMilliseconds = Math.floor(leaseMilliseconds / 2)
  if (heartbeatMilliseconds >= leaseMilliseconds) {
    throw new Error('BILLING_JOB_LEASE_MS must leave time for a heartbeat')
  }
  return {
    batchSize: positiveInteger(environment, 'BILLING_JOB_BATCH_SIZE', 10),
    heartbeatMilliseconds,
    leaseMilliseconds,
    maxAttempts: positiveInteger(environment, 'BILLING_JOB_MAX_ATTEMPTS', 5),
    pollMilliseconds: positiveInteger(
      environment,
      'BILLING_JOB_POLL_MS',
      1_000,
    ),
    retryDelayMilliseconds: positiveInteger(
      environment,
      'BILLING_JOB_RETRY_MS',
      30_000,
    ),
  }
}
