#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { ApplicationStack } from '../lib/application-stack.js'

const app = new cdk.App()
const projectName = app.node.tryGetContext('projectName') as string | undefined

new ApplicationStack(app, `${projectName ?? 'fullstack-app'}-application`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  projectName: projectName ?? 'fullstack-app',
})

app.synth()
