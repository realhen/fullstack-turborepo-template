import type * as rds from 'aws-cdk-lib/aws-rds'
import {
  createDatabaseBindings,
  type DatabaseBindings,
} from '../constructs/database-bindings.js'

export const WORKER_POOL_MAX = '2'

export function createWorkerDatabaseBindings(
  database: rds.DatabaseInstance,
): DatabaseBindings {
  const bindings = createDatabaseBindings(database)

  return {
    environment: {
      BILLING_JOB_BATCH_SIZE: '10',
      BILLING_JOB_LEASE_MS: '60000',
      BILLING_JOB_MAX_ATTEMPTS: '5',
      BILLING_JOB_POLL_MS: '1000',
      BILLING_JOB_RETRY_MS: '30000',
      DATABASE_POOL_MAX: WORKER_POOL_MAX,
      NODE_ENV: 'production',
      ...bindings.environment,
    },
    secrets: bindings.secrets,
  }
}
