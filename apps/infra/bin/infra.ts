#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { ApplicationStack } from '../lib/application-stack.js'

const app = new cdk.App()
const projectName = app.node.tryGetContext('projectName') as string | undefined
const certificateArn = app.node.tryGetContext('certificateArn') as
  string | undefined

if (!certificateArn) {
  throw new Error(
    'CDK deployment requires -c certificateArn=<regional ACM certificate ARN>.',
  )
}

new ApplicationStack(app, `${projectName ?? 'fullstack-app'}-application`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  certificateArn,
  projectName: projectName ?? 'fullstack-app',
})

app.synth()
