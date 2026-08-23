import type * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type { Construct } from 'constructs'
import { createRepositoryImage } from '../constructs/container-image.js'
import { FargateService } from '../constructs/fargate-service.js'
import { createWorkerDatabaseBindings } from './database.js'

export interface WorkerServiceOptions {
  cluster: ecs.ICluster
  database: rds.DatabaseInstance
  projectName: string
  securityGroup: ec2.ISecurityGroup
  workerSecret: secretsmanager.ISecret
}

export function createWorkerService(
  scope: Construct,
  options: WorkerServiceOptions,
): FargateService {
  const bindings = createWorkerDatabaseBindings(options.database)

  return new FargateService(scope, 'WorkerService', {
    cluster: options.cluster,
    container: {
      environment: {
        BILLING_PROCESSOR_URL: `http://api.${options.projectName}.local:3001/api/v1/internal/billing/jobs`,
        ...bindings.environment,
      },
      image: createRepositoryImage({
        dockerfile: 'apps/worker/Dockerfile',
        target: 'aws-runner',
      }),
      secrets: {
        WORKER_SECRET: ecs.Secret.fromSecretsManager(
          options.workerSecret,
          'secret',
        ),
        ...bindings.secrets,
      },
    },
    containerName: 'WorkerContainer',
    desiredCount: 1,
    logStreamPrefix: 'worker',
    maxCapacity: 4,
    minCapacity: 1,
    securityGroup: options.securityGroup,
    serviceName: `${options.projectName}-worker`,
  })
}
