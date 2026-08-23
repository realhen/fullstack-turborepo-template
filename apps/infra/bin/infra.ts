#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { ApplicationStack } from '../lib/application-stack.js'

const app = new cdk.App()
const projectName = app.node.tryGetContext('projectName') as string | undefined
const certificateArn = app.node.tryGetContext('certificateArn') as
  string | undefined
const domainName = app.node.tryGetContext('domainName') as string | undefined
const hostedZoneId = app.node.tryGetContext('hostedZoneId') as string | undefined
const hostedZoneName = app.node.tryGetContext('hostedZoneName') as
  | string
  | undefined

if (!certificateArn) {
  throw new Error(
    'CDK deployment requires -c certificateArn=<regional ACM certificate ARN>.',
  )
}

if (!domainName) {
  throw new Error(
    'CDK deployment requires -c domainName=<custom-domain-covered-by-the-certificate>.',
  )
}

if (Boolean(hostedZoneId) !== Boolean(hostedZoneName)) {
  throw new Error(
    'CDK deployment requires both -c hostedZoneId=<route53-zone-id> and -c hostedZoneName=<route53-zone-name> when managing the DNS alias.',
  )
}

new ApplicationStack(app, `${projectName ?? 'fullstack-app'}-application`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  certificateArn,
  domainName,
  hostedZoneId,
  hostedZoneName,
  projectName: projectName ?? 'fullstack-app',
})

app.synth()
