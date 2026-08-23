import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { FargateService } from '../lib/constructs/fargate-service.js'

type TaskDefinitionResource = {
  Properties: {
    RuntimePlatform: {
      CpuArchitecture: string
      OperatingSystemFamily: string
    }
  }
}

describe('FargateService', () => {
  it('applies production defaults to internal and public services', () => {
    const app = new cdk.App()
    const stack = new cdk.Stack(app, 'ServiceStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    })
    const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 2, natGateways: 1 })
    const cluster = new ecs.Cluster(stack, 'Cluster', { vpc })
    const internalSecurityGroup = new ec2.SecurityGroup(
      stack,
      'InternalSecurityGroup',
      { vpc },
    )
    const publicSecurityGroup = new ec2.SecurityGroup(
      stack,
      'PublicSecurityGroup',
      { vpc },
    )
    const image = ecs.ContainerImage.fromRegistry(
      'public.ecr.aws/docker/library/node:24',
    )
    const certificate = acm.Certificate.fromCertificateArn(
      stack,
      'Certificate',
      'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000',
    )

    new FargateService(stack, 'InternalService', {
      cluster,
      container: { image },
      containerName: 'InternalContainer',
      desiredCount: 1,
      logStreamPrefix: 'internal',
      maxCapacity: 2,
      minCapacity: 1,
      securityGroup: internalSecurityGroup,
      serviceName: 'internal-service',
    })
    new FargateService(stack, 'PublicService', {
      cluster,
      container: { image },
      containerName: 'PublicContainer',
      containerPort: 3001,
      desiredCount: 2,
      logStreamPrefix: 'public',
      maxCapacity: 4,
      minCapacity: 2,
      publicLoadBalancer: {
        certificate,
        healthCheckPath: '/health',
      },
      securityGroup: publicSecurityGroup,
      serviceName: 'public-service',
    })

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
    template.resourceCountIs('AWS::ECS::Service', 2)
    template.hasResourceProperties('AWS::ECS::Service', {
      DeploymentConfiguration: Match.objectLike({
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      }),
      EnableExecuteCommand: true,
    })
    template.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 2)
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1)
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2)
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
      Match.objectLike({
        HealthCheckPath: '/health',
        Port: 3001,
        Protocol: 'HTTP',
      }),
    )
  })
})
