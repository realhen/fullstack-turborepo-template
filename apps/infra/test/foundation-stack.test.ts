import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { MAX_PROJECT_NAME_LENGTH, validateProjectName } from '../lib/config.js'
import { FoundationStack } from '../lib/foundation/stack.js'

function createFoundation(): FoundationStack {
  const app = new cdk.App()

  return new FoundationStack(app, 'foundation-stack', {
    domainName: 'api.example.com',
    env: { account: '123456789012', region: 'us-east-1' },
    projectName: 'fullstack-app',
  })
}

describe('FoundationStack', () => {
  it('owns shared backend infrastructure without deploying a service', () => {
    const template = Template.fromStack(createFoundation())

    template.resourceCountIs('AWS::EC2::VPC', 1)
    template.resourceCountIs('AWS::ECS::Cluster', 1)
    for (const description of [
      'Network access for the API Fargate service.',
      'Network access for the worker Fargate service.',
      'PostgreSQL access from backend services.',
    ]) {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: description,
      })
    }
    template.resourceCountIs('AWS::RDS::DBInstance', 1)
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 14,
      DeletionProtection: true,
      MultiAZ: true,
      PubliclyAccessible: false,
      StorageEncrypted: true,
    })
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: 'Shared secret for worker-to-API job execution.',
    })
    template.resourceCountIs('AWS::SNS::Topic', 1)
    template.hasResourceProperties('AWS::Route53::HostedZone', {
      Name: 'api.example.com.',
    })

    template.resourceCountIs('AWS::ECS::Service', 0)
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0)
  })

  it('publishes the operational identifiers needed during bootstrap', () => {
    const template = Template.fromStack(createFoundation())

    for (const output of [
      'ApiHostedZoneNameServers',
      'ApiSecurityGroupId',
      'DatabaseSecretArn',
      'EcsClusterName',
      'PrivateSubnetIds',
      'WorkerSecurityGroupId',
    ]) {
      template.hasOutput(output, {})
    }
  })
})

describe('validateProjectName', () => {
  it('accepts a lowercase DNS-safe project name', () => {
    expect(() => validateProjectName('fullstack-app')).not.toThrow()
  })

  it('rejects names that cannot safely identify AWS and DNS resources', () => {
    expect(() =>
      validateProjectName('A'.repeat(MAX_PROJECT_NAME_LENGTH + 1)),
    ).toThrow(/projectName must be 63 characters or fewer/)
  })
})
