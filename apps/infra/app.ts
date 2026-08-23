#!/usr/bin/env node
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as cdk from 'aws-cdk-lib'
import { ApiStack } from './lib/api/stack.js'
import {
  readInfrastructureConfiguration,
  type InfrastructureConfiguration,
} from './lib/config.js'
import { FoundationStack } from './lib/foundation/stack.js'
import { WorkerStack } from './lib/worker/stack.js'

export interface InfrastructureApp {
  apiStack: ApiStack
  app: cdk.App
  configuration: InfrastructureConfiguration
  foundationStack: FoundationStack
  workerStack: WorkerStack
}

export function createInfrastructureApp(
  app = new cdk.App(),
): InfrastructureApp {
  const configuration = readInfrastructureConfiguration(app)
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  }
  const foundationStack = new FoundationStack(app, 'foundation-stack', {
    alarmEmail: configuration.alarmEmail,
    domainName: configuration.domainName,
    env,
    projectName: configuration.projectName,
    stackName: `${configuration.projectName}-foundation`,
  })
  const apiStack = new ApiStack(app, 'api-stack', {
    alarmTopic: foundationStack.alarmTopic,
    apiSecurityGroup: foundationStack.apiSecurityGroup,
    applicationSecretsArn: configuration.applicationSecretsArn,
    authAudience: configuration.authAudience,
    authClientId: configuration.authClientId,
    authIssuer: configuration.authIssuer,
    authJwksUri: configuration.authJwksUri,
    cluster: foundationStack.cluster,
    database: foundationStack.database,
    domainName: configuration.domainName,
    env,
    hostedZone: foundationStack.hostedZone,
    projectName: configuration.projectName,
    stackName: `${configuration.projectName}-api`,
    vpc: foundationStack.vpc,
    webOrigin: configuration.webOrigin,
    workerSecret: foundationStack.workerSecret,
  })
  const workerStack = new WorkerStack(app, 'worker-stack', {
    cluster: foundationStack.cluster,
    database: foundationStack.database,
    env,
    projectName: configuration.projectName,
    stackName: `${configuration.projectName}-worker`,
    workerSecret: foundationStack.workerSecret,
    workerSecurityGroup: foundationStack.workerSecurityGroup,
  })

  apiStack.addStackDependency(foundationStack)
  workerStack.addStackDependency(foundationStack)

  return { apiStack, app, configuration, foundationStack, workerStack }
}

const entrypoint = process.argv[1]
if (
  entrypoint &&
  import.meta.url === pathToFileURL(path.resolve(entrypoint)).href
) {
  createInfrastructureApp().app.synth()
}
