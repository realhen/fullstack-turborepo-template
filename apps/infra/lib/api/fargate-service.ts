import * as cdk from 'aws-cdk-lib'
import type * as acm from 'aws-cdk-lib/aws-certificatemanager'
import type * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type { Construct } from 'constructs'
import type { AuthConfiguration } from '../config.js'
import { createRepositoryImage } from '../constructs/container-image.js'
import { FargateService } from '../constructs/fargate-service.js'
import {
  API_POOL_MAX,
  createDatabaseBindings,
  createMigrationInitContainer,
  createStandaloneMigrationTask,
} from './database.js'

export interface ApiServiceOptions extends AuthConfiguration {
  applicationSecrets?: secretsmanager.ISecret
  certificate: acm.ICertificate
  cluster: ecs.ICluster
  database: rds.DatabaseInstance
  domainName: string
  projectName: string
  securityGroup: ec2.ISecurityGroup
  webOrigin: string
  workerSecret: secretsmanager.ISecret
}

export interface ApiServiceResources {
  deployment: FargateService
  migrationTask: ecs.FargateTaskDefinition
}

export function createApiService(
  scope: Construct,
  options: ApiServiceOptions,
): ApiServiceResources {
  const bindings = createDatabaseBindings(options.database)
  const image = createRepositoryImage({
    dockerfile: 'apps/api/Dockerfile',
    target: 'aws-runner',
  })
  const authConfigured = Boolean(
    options.authIssuer &&
    options.authJwksUri &&
    (options.authAudience || options.authClientId),
  )
  const deployment = new FargateService(scope, 'ApiService', {
    cloudMapName: 'api',
    cluster: options.cluster,
    container: {
      environment: {
        AUTH_MODE: authConfigured ? 'oidc' : 'disabled',
        ...(options.authAudience
          ? { AUTH_AUDIENCE: options.authAudience }
          : {}),
        ...(options.authClientId
          ? { AUTH_CLIENT_ID: options.authClientId }
          : {}),
        ...(options.authIssuer ? { AUTH_ISSUER: options.authIssuer } : {}),
        ...(options.authJwksUri ? { AUTH_JWKS_URI: options.authJwksUri } : {}),
        BILLING_PROVIDER: options.applicationSecrets ? 'stripe' : 'disabled',
        CORS_ORIGIN: options.webOrigin,
        DATABASE_POOL_MAX: API_POOL_MAX,
        NODE_ENV: 'production',
        PORT: '3001',
        ...bindings.environment,
      },
      healthCheck: {
        command: [
          'CMD-SHELL',
          'wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/v1/health || exit 1',
        ],
        interval: cdk.Duration.seconds(30),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(5),
      },
      image,
      secrets: {
        WORKER_SECRET: ecs.Secret.fromSecretsManager(
          options.workerSecret,
          'secret',
        ),
        ...bindings.secrets,
        ...(options.applicationSecrets
          ? {
              STRIPE_PRICE_PRO_MONTHLY: ecs.Secret.fromSecretsManager(
                options.applicationSecrets,
                'STRIPE_PRICE_PRO_MONTHLY',
              ),
              STRIPE_PRICE_STARTER_MONTHLY: ecs.Secret.fromSecretsManager(
                options.applicationSecrets,
                'STRIPE_PRICE_STARTER_MONTHLY',
              ),
              STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(
                options.applicationSecrets,
                'STRIPE_SECRET_KEY',
              ),
              STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(
                options.applicationSecrets,
                'STRIPE_WEBHOOK_SECRET',
              ),
            }
          : {}),
      },
    },
    containerName: 'ApiContainer',
    containerPort: 3001,
    dependencyContainers: [createMigrationInitContainer(image, bindings)],
    desiredCount: 2,
    logStreamPrefix: 'api',
    maxCapacity: 4,
    minCapacity: 2,
    publicLoadBalancer: {
      certificate: options.certificate,
      healthCheckPath: '/api/v1/health',
    },
    securityGroup: options.securityGroup,
    serviceName: `${options.projectName}-api`,
  })
  const migrationTask = createStandaloneMigrationTask(scope, image, bindings)

  return { deployment, migrationTask }
}
