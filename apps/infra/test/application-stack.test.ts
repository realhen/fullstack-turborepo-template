import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import {
  ApplicationStack,
  MAX_PROJECT_NAME_LENGTH,
} from '../lib/application-stack.js'

const certificateArn =
  'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000'

type TaskDefinitionResource = {
  Properties: {
    RuntimePlatform: {
      CpuArchitecture: string
      OperatingSystemFamily: string
    }
  }
}

type ServiceResource = { Properties: { DesiredCount: number } }
type ScalableTargetResource = { Properties: { MinCapacity: number } }

function createStack(hostedZoneId?: string, hostedZoneName?: string): {
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

    expect(Object.values(taskDefinitions)).toHaveLength(2)
    expect(
      Object.values(taskDefinitions).every(
        (taskDefinition) =>
          taskDefinition.Properties.RuntimePlatform.CpuArchitecture === 'X86_64' &&
          taskDefinition.Properties.RuntimePlatform.OperatingSystemFamily ===
            'LINUX',
      ),
    ).toBe(true)

    const services = template.findResources('AWS::ECS::Service') as Record<
      string,
      ServiceResource
    >
    expect(Object.values(services)).toHaveLength(2)
    expect(
      Object.values(services).every(
        (service) => service.Properties.DesiredCount === 2,
      ),
    ).toBe(true)

    const scalableTargets = template.findResources(
      'AWS::ApplicationAutoScaling::ScalableTarget',
    ) as Record<string, ScalableTargetResource>
    expect(Object.values(scalableTargets)).toHaveLength(2)
    expect(
      Object.values(scalableTargets).every(
        (target) => target.Properties.MinCapacity === 2,
      ),
    ).toBe(true)

    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::Listener',
      Match.objectLike({
        Certificates: Match.arrayWith([Match.anyValue()]),
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

  it('builds Docker assets for the Fargate x86_64 platform', () => {
    const { app, stack } = createStack()
    const assembly = app.synth()
    const artifact = assembly.getStackArtifact(stack.artifactId)
    const dockerImages = artifact.assets.flatMap((asset) =>
      Object.values(asset.manifest.dockerImages ?? {}),
    )

    expect(dockerImages).toHaveLength(2)
    expect(
      dockerImages.every((image) => image.source.platform === 'linux/amd64'),
    ).toBe(true)
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
