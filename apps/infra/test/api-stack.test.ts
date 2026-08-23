import path from 'node:path'
import { readFileSync } from 'node:fs'
import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { ApiStack } from '../lib/api/stack.js'
import { FoundationStack } from '../lib/foundation/stack.js'

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

function createApiStack(
  overrides: Partial<{
    authIssuer: string
    domainName: string
    webOrigin: string
  }> = {},
): { app: cdk.App; stack: ApiStack } {
  const app = new cdk.App()
  const env = { account: '123456789012', region: 'us-east-1' }
  const foundation = new FoundationStack(app, 'foundation-stack', {
    domainName: 'api.example.com',
    env,
    projectName: 'fullstack-app',
  })
  const stack = new ApiStack(app, 'api-stack', {
    alarmTopic: foundation.alarmTopic,
    apiSecurityGroup: foundation.apiSecurityGroup,
    authIssuer: overrides.authIssuer,
    cluster: foundation.cluster,
    database: foundation.database,
    domainName: overrides.domainName ?? 'api.example.com',
    env,
    hostedZone: foundation.hostedZone,
    projectName: 'fullstack-app',
    vpc: foundation.vpc,
    webOrigin: overrides.webOrigin ?? 'https://app.example.com',
    workerSecret: foundation.workerSecret,
  })

  return { app, stack }
}

describe('ApiStack', () => {
  it('deploys only the public API and its migration tasks', () => {
    const { stack } = createApiStack()
    const template = Template.fromStack(stack)
    const taskDefinitions = template.findResources(
      'AWS::ECS::TaskDefinition',
    ) as Record<string, TaskDefinitionResource>

    expect(Object.values(taskDefinitions)).toHaveLength(2)
    expect(
      Object.values(taskDefinitions).every(
        (taskDefinition) =>
          taskDefinition.Properties.RuntimePlatform.CpuArchitecture ===
            'X86_64' &&
          taskDefinition.Properties.RuntimePlatform.OperatingSystemFamily ===
            'LINUX',
      ),
    ).toBe(true)
    template.resourceCountIs('AWS::ECS::Service', 1)
    template.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 2 })
    template.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 1)
    template.hasResourceProperties(
      'AWS::ApplicationAutoScaling::ScalableTarget',
      { MaxCapacity: 4, MinCapacity: 2 },
    )
    template.resourceCountIs('AWS::RDS::DBInstance', 0)

    const allContainers = Object.values(taskDefinitions).flatMap(
      (taskDefinition) => taskDefinition.Properties.ContainerDefinitions,
    )
    const apiContainer = allContainers.find(
      (container) => container.Name === 'ApiContainer',
    )
    expect(apiContainer?.Environment).toEqual(
      expect.arrayContaining([
        { Name: 'CORS_ORIGIN', Value: 'https://app.example.com' },
        { Name: 'DATABASE_POOL_MAX', Value: '4' },
        { Name: 'PGSSLMODE', Value: 'verify-full' },
        {
          Name: 'PGSSLROOTCERT',
          Value: '/etc/ssl/certs/rds-global-bundle.pem',
        },
        { Name: 'PORT', Value: '3001' },
      ]),
    )
    expect(apiContainer?.DependsOn).toEqual([
      { Condition: 'SUCCESS', ContainerName: 'MigrationInitContainer' },
    ])
    expect(allContainers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Command: ['node', 'node_modules/@repo/database/dist/migrate.js'],
          Name: 'MigrationInitContainer',
        }),
      ]),
    )
    expect(
      allContainers.some((container) =>
        container.Environment?.some(
          (variable) => variable.Name === 'BILLING_JOB_POLL_MS',
        ),
      ),
    ).toBe(false)
  })

  it('owns API ingress, DNS, WAF, and monitoring', () => {
    const template = Template.fromStack(createApiStack().stack)

    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1)
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::Listener',
      Match.objectLike({ Port: 443, Protocol: 'HTTPS' }),
    )
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::Listener',
      Match.objectLike({ Port: 80, Protocol: 'HTTP' }),
    )
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::TargetGroup',
      Match.objectLike({ HealthCheckPath: '/api/v1/health', Port: 3001 }),
    )
    template.resourceCountIs('AWS::WAFv2::WebACL', 1)
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1)
    template.resourceCountIs('AWS::CertificateManager::Certificate', 1)
    template.resourceCountIs('AWS::Route53::RecordSet', 1)
    template.resourceCountIs('AWS::CloudWatch::Alarm', 2)
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1)
    template.hasOutput('ApiUrl', { Value: 'https://api.example.com' })
    template.hasOutput('MigrationTaskDefinitionArn', {})
  })

  it('builds one same-image API asset for runtime and migrations', () => {
    const { app } = createApiStack()
    const assembly = app.synth()
    const dockerImages = assembly.artifacts
      .filter((artifact): artifact is cdk.cx_api.AssetManifestArtifact =>
        cdk.cx_api.AssetManifestArtifact.isAssetManifestArtifact(artifact),
      )
      .flatMap((artifact) =>
        Object.values(artifact.contents.dockerImages ?? {}),
      )

    expect(dockerImages).toHaveLength(1)
    expect(dockerImages[0]?.source.platform).toBe('linux/amd64')
    expect(dockerImages[0]?.source.dockerBuildTarget).toBe('aws-runner')
  })

  it('keeps the generic API image cloud neutral', () => {
    const dockerfile = readFileSync(
      path.join(process.cwd(), '..', 'api', 'Dockerfile'),
      'utf8',
    )

    expect(dockerfile).toContain('AS runner')
    expect(dockerfile).toContain('AS aws-runner')
    expect(dockerfile.trimEnd()).toMatch(/FROM runner-base AS runner$/)
  })

  it('rejects incomplete OIDC configuration', () => {
    expect(() =>
      createApiStack({ authIssuer: 'https://identity.example.com' }),
    ).toThrow(/OIDC authentication requires/)
  })

  it('requires distinct API domain and frontend origin values', () => {
    expect(() => createApiStack({ domainName: '' })).toThrow(
      /domainName is required/,
    )
    expect(() => createApiStack({ webOrigin: '' })).toThrow(
      /webOrigin is required/,
    )
  })
})
