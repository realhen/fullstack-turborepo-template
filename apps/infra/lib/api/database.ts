import * as cdk from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as logs from 'aws-cdk-lib/aws-logs'
import type { Construct } from 'constructs'
import type { DatabaseBindings } from '../constructs/database-bindings.js'
import type { DependencyContainerOptions } from '../constructs/fargate-service.js'

export const API_POOL_MAX = '4'
export const MIGRATION_POOL_MAX = '1'

export function createMigrationInitContainer(
  image: ecs.ContainerImage,
  bindings: DatabaseBindings,
): DependencyContainerOptions {
  return {
    command: ['node', 'node_modules/@repo/database/dist/migrate.js'],
    condition: ecs.ContainerDependencyCondition.SUCCESS,
    containerName: 'MigrationInitContainer',
    environment: {
      DATABASE_POOL_MAX: MIGRATION_POOL_MAX,
      NODE_ENV: 'production',
      ...bindings.environment,
    },
    essential: false,
    id: 'MigrationInitContainer',
    image,
    logStreamPrefix: 'migration-init',
    secrets: bindings.secrets,
  }
}

export function createStandaloneMigrationTask(
  scope: Construct,
  image: ecs.ContainerImage,
  bindings: DatabaseBindings,
): ecs.FargateTaskDefinition {
  const taskDefinition = new ecs.FargateTaskDefinition(scope, 'MigrationTask', {
    cpu: 256,
    memoryLimitMiB: 512,
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    },
  })

  taskDefinition.addContainer('MigrationContainer', {
    command: ['node', 'node_modules/@repo/database/dist/migrate.js'],
    environment: {
      DATABASE_POOL_MAX: MIGRATION_POOL_MAX,
      NODE_ENV: 'production',
      ...bindings.environment,
    },
    image,
    logging: ecs.LogDrivers.awsLogs({
      logRetention: logs.RetentionDays.ONE_MONTH,
      streamPrefix: 'migration',
    }),
    secrets: bindings.secrets,
  })

  new cdk.CfnOutput(scope, 'MigrationTaskDefinitionArn', {
    description:
      'Standalone migration task for diagnostics or manual recovery; API tasks run the normal init gate.',
    value: taskDefinition.taskDefinitionArn,
  })

  return taskDefinition
}
