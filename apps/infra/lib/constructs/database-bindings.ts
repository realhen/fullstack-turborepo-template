import * as ecs from 'aws-cdk-lib/aws-ecs'
import type * as rds from 'aws-cdk-lib/aws-rds'

export const RDS_GLOBAL_BUNDLE_PATH = '/etc/ssl/certs/rds-global-bundle.pem'

export interface DatabaseBindings {
  environment: Record<string, string>
  secrets: Record<string, ecs.Secret>
}

export function createDatabaseBindings(
  database: rds.DatabaseInstance,
): DatabaseBindings {
  return {
    environment: {
      PGDATABASE: 'app',
      PGHOST: database.dbInstanceEndpointAddress,
      PGPORT: database.dbInstanceEndpointPort,
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: RDS_GLOBAL_BUNDLE_PATH,
    },
    secrets: {
      PGPASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
      PGUSER: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
    },
  }
}
