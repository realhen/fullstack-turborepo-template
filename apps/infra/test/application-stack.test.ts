import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ApplicationStack,
  MAX_PROJECT_NAME_LENGTH,
} from '../lib/application-stack.js'

const certificateArn =
  'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000'

type TaskDefinitionResource = {
  Properties: {
    ContainerDefinitions: Array<{
      Command?: string[]
      DependsOn?: Array<{ Condition: string; ContainerName: string }>
      Environment?: Array<{ Name: string; Value: string }>
      Name: string
    }>
    RuntimePlatform: {
      CpuArchitecture: string
      OperatingSystemFamily: string
    }
  }
}

type ServiceResource = { Properties: { DesiredCount: number } }
type ScalableTargetResource = { Properties: { MinCapacity: number } }

function createStack(
  hostedZoneId?: string,
  hostedZoneName?: string,
): {
  app: cdk.App
  stack: ApplicationStack
} {
  const app = new cdk.App()

  return {
    app,
    stack: new ApplicationStack(app, 'ProductionStack', {
      certificateArn,
      domainName: 'app.example.com',
      env: { account: '123456789012', region: 'us-east-1' },
      hostedZoneId,
      hostedZoneName,
      projectName: 'fullstack-app',
    }),
  }
}

describe('ApplicationStack', () => {
  it('synthesises the production HTTPS service with x86_64 Fargate tasks', () => {
    const { stack } = createStack('Z0123456789ABCDEF', 'example.com')
    const template = Template.fromStack(stack)
    const taskDefinitions = template.findResources(
      'AWS::ECS::TaskDefinition',
    ) as Record<string, TaskDefinitionResource>

    expect(Object.values(taskDefinitions)).toHaveLength(4)
    expect(
      Object.values(taskDefinitions).every(
        (taskDefinition) =>
          taskDefinition.Properties.RuntimePlatform.CpuArchitecture ===
            'X86_64' &&
          taskDefinition.Properties.RuntimePlatform.OperatingSystemFamily ===
            'LINUX',
      ),
    ).toBe(true)

    const services = template.findResources('AWS::ECS::Service') as Record<
      string,
      ServiceResource
    >
    expect(Object.values(services)).toHaveLength(3)
    expect(
      Object.values(services)
        .map((service) => service.Properties.DesiredCount)
        .sort(),
    ).toEqual([1, 2, 2])

    const scalableTargets = template.findResources(
      'AWS::ApplicationAutoScaling::ScalableTarget',
    ) as Record<string, ScalableTargetResource>
    expect(Object.values(scalableTargets)).toHaveLength(3)
    expect(
      Object.values(scalableTargets)
        .map((target) => target.Properties.MinCapacity)
        .sort(),
    ).toEqual([1, 2, 2])

    template.resourceCountIs('AWS::RDS::DBInstance', 1)
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 14,
      DeletionProtection: true,
      MultiAZ: true,
      PubliclyAccessible: false,
      StorageEncrypted: true,
    })
    template.resourceCountIs('AWS::SQS::Queue', 0)
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1)
    template.resourceCountIs('AWS::CloudWatch::Alarm', 2)

    const workerTask = Object.values(taskDefinitions).find((taskDefinition) =>
      taskDefinition.Properties.ContainerDefinitions.some((container) =>
        container.Environment?.some(
          (variable) => variable.Name === 'BILLING_JOB_POLL_MS',
        ),
      ),
    )
    const workerEnvironment =
      workerTask?.Properties.ContainerDefinitions[0]?.Environment
    expect(workerEnvironment).toEqual(
      expect.arrayContaining([
        { Name: 'BILLING_JOB_POLL_MS', Value: '1000' },
        { Name: 'DATABASE_POOL_MAX', Value: '2' },
        { Name: 'PGDATABASE', Value: 'app' },
        { Name: 'PGSSLMODE', Value: 'verify-full' },
        {
          Name: 'PGSSLROOTCERT',
          Value: '/etc/ssl/certs/rds-global-bundle.pem',
        },
      ]),
    )
    expect(workerEnvironment).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Name: ['BILLING', 'SQS', 'QUEUE', 'URL'].join('_'),
        }),
        expect.objectContaining({ Name: ['AWS', 'REGION'].join('_') }),
        expect.objectContaining({
          Name: ['ASYNC', 'QUEUE', 'URL'].join('_'),
        }),
      ]),
    )
    const allContainers = Object.values(taskDefinitions).flatMap(
      (taskDefinition) => taskDefinition.Properties.ContainerDefinitions,
    )
    const apiEnvironment = allContainers.find((container) =>
      container.Environment?.some(
        (variable) => variable.Name === 'PORT' && variable.Value === '3001',
      ),
    )?.Environment
    expect(apiEnvironment).toEqual(
      expect.arrayContaining([
        { Name: 'DATABASE_POOL_MAX', Value: '4' },
        { Name: 'PGSSLMODE', Value: 'verify-full' },
        {
          Name: 'PGSSLROOTCERT',
          Value: '/etc/ssl/certs/rds-global-bundle.pem',
        },
      ]),
    )
    const migrationEnvironment = allContainers.find((container) =>
      container.Environment?.some(
        (variable) =>
          variable.Name === 'DATABASE_POOL_MAX' && variable.Value === '1',
      ),
    )?.Environment
    expect(migrationEnvironment).toEqual(
      expect.arrayContaining([
        { Name: 'DATABASE_POOL_MAX', Value: '1' },
        { Name: 'PGSSLMODE', Value: 'verify-full' },
        {
          Name: 'PGSSLROOTCERT',
          Value: '/etc/ssl/certs/rds-global-bundle.pem',
        },
      ]),
    )
    const apiTask = Object.values(taskDefinitions).find((taskDefinition) =>
      taskDefinition.Properties.ContainerDefinitions.some(
        (container) => container.Name === 'ApiContainer',
      ),
    )
    const apiContainers = apiTask?.Properties.ContainerDefinitions ?? []
    expect(apiContainers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Command: ['node', 'node_modules/@repo/database/dist/migrate.js'],
          Name: 'MigrationInitContainer',
        }),
        expect.objectContaining({
          DependsOn: [
            { Condition: 'SUCCESS', ContainerName: 'MigrationInitContainer' },
          ],
          Name: 'ApiContainer',
        }),
      ]),
    )

    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::Listener',
      Match.objectLike({
        Certificates: Match.anyValue(),
        Port: 443,
        Protocol: 'HTTPS',
      }),
    )
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::Listener',
      Match.objectLike({ Port: 80, Protocol: 'HTTP' }),
    )
    template.hasOutput('ApplicationUrl', {
      Value: 'https://app.example.com',
    })
    template.hasResourceProperties(
      'AWS::Route53::RecordSet',
      Match.objectLike({
        AliasTarget: Match.objectLike({ DNSName: Match.anyValue() }),
        HostedZoneId: 'Z0123456789ABCDEF',
        Name: 'app.example.com.',
        Type: 'A',
      }),
    )
    template.hasResourceProperties(
      'AWS::WAFv2::WebACL',
      Match.objectLike({
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'AWSManagedRulesCommonRuleSet',
            Priority: 1,
            Statement: {
              ManagedRuleGroupStatement: {
                Name: 'AWSManagedRulesCommonRuleSet',
                VendorName: 'AWS',
              },
            },
          }),
        ]),
      }),
    )
  })

  it('does not manage DNS when the hosted zone is external', () => {
    const { stack } = createStack()
    const template = Template.fromStack(stack)

    template.resourceCountIs('AWS::Route53::RecordSet', 0)
  })

  it('requires both hosted zone attributes when managing DNS', () => {
    const app = new cdk.App()

    expect(
      () =>
        new ApplicationStack(app, 'IncompleteHostedZoneStack', {
          certificateArn,
          domainName: 'app.example.com',
          hostedZoneId: 'Z0123456789ABCDEF',
          projectName: 'fullstack-app',
        }),
    ).toThrow(/hostedZoneId and hostedZoneName must be provided together/)
  })

  it('rejects incomplete OIDC configuration', () => {
    const app = new cdk.App()

    expect(
      () =>
        new ApplicationStack(app, 'IncompleteAuthStack', {
          authIssuer: 'https://identity.example.com',
          certificateArn,
          domainName: 'app.example.com',
          projectName: 'fullstack-app',
        }),
    ).toThrow(/OIDC authentication requires/)
  })

  it('builds Docker assets for the Fargate x86_64 platform', () => {
    const { app } = createStack()
    const assembly = app.synth()
    const assetManifests = assembly.artifacts.filter(
      (artifact): artifact is cdk.cx_api.AssetManifestArtifact =>
        cdk.cx_api.AssetManifestArtifact.isAssetManifestArtifact(artifact),
    )
    const dockerImages = assetManifests.flatMap((artifact) =>
      Object.values(artifact.contents.dockerImages ?? {}),
    )

    expect(dockerImages).toHaveLength(3)
    expect(
      dockerImages.every((image) => image.source.platform === 'linux/amd64'),
    ).toBe(true)
    expect(
      dockerImages.filter(
        (image) => image.source.dockerBuildTarget === 'aws-runner',
      ),
    ).toHaveLength(2)
  })

  it('keeps generic container targets cloud neutral while reserving the RDS bundle for aws-runner', () => {
    const apiDockerfile = readFileSync(
      path.join(process.cwd(), '..', 'api', 'Dockerfile'),
      'utf8',
    )
    const workerDockerfile = readFileSync(
      path.join(process.cwd(), '..', 'worker', 'Dockerfile'),
      'utf8',
    )

    for (const dockerfile of [apiDockerfile, workerDockerfile]) {
      expect(dockerfile).toContain('AS runner')
      expect(dockerfile).toContain('AS aws-runner')
      expect(dockerfile.trimEnd()).toMatch(/FROM runner-base AS runner$/)
      const runner = dockerfile.split('FROM runner-base AS runner')[1]
      expect(runner).not.toContain('truststore.pki.rds.amazonaws.com')
      expect(runner).not.toContain('rds-global-bundle.pem')
    }
  })

  it('rejects names that cannot safely be used as AWS and DNS identifiers', () => {
    const app = new cdk.App()

    expect(
      () =>
        new ApplicationStack(app, 'InvalidNameStack', {
          certificateArn,
          domainName: 'app.example.com',
          projectName: 'A'.repeat(MAX_PROJECT_NAME_LENGTH + 1),
        }),
    ).toThrow(/projectName must be 63 characters or fewer/)
  })
})
