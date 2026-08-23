import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { FoundationStack } from '../lib/foundation/stack.js'
import { WorkerStack } from '../lib/worker/stack.js'

type TaskDefinitionResource = {
  Properties: {
    ContainerDefinitions: Array<{
      Environment?: Array<{ Name: string; Value: string }>
      Name: string
    }>
  }
}

function createWorkerStack(): { app: cdk.App; stack: WorkerStack } {
  const app = new cdk.App()
  const env = { account: '123456789012', region: 'us-east-1' }
  const foundation = new FoundationStack(app, 'foundation-stack', {
    domainName: 'api.example.com',
    env,
    projectName: 'fullstack-app',
  })
  const stack = new WorkerStack(app, 'worker-stack', {
    cluster: foundation.cluster,
    database: foundation.database,
    env,
    projectName: 'fullstack-app',
    workerSecret: foundation.workerSecret,
    workerSecurityGroup: foundation.workerSecurityGroup,
  })

  return { app, stack }
}

describe('WorkerStack', () => {
  it('deploys one private worker service with its existing runtime contract', () => {
    const template = Template.fromStack(createWorkerStack().stack)
    const taskDefinitions = template.findResources(
      'AWS::ECS::TaskDefinition',
    ) as Record<string, TaskDefinitionResource>

    expect(Object.values(taskDefinitions)).toHaveLength(1)
    template.resourceCountIs('AWS::ECS::Service', 1)
    template.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 1 })
    template.hasResourceProperties(
      'AWS::ApplicationAutoScaling::ScalableTarget',
      { MaxCapacity: 4, MinCapacity: 1 },
    )

    const workerContainer =
      Object.values(taskDefinitions)[0]?.Properties.ContainerDefinitions[0]
    expect(workerContainer?.Name).toBe('WorkerContainer')
    expect(workerContainer?.Environment).toEqual(
      expect.arrayContaining([
        {
          Name: 'BILLING_PROCESSOR_URL',
          Value:
            'http://api.fullstack-app.local:3001/api/v1/internal/billing/jobs',
        },
        { Name: 'BILLING_JOB_BATCH_SIZE', Value: '10' },
        { Name: 'BILLING_JOB_LEASE_MS', Value: '60000' },
        { Name: 'BILLING_JOB_MAX_ATTEMPTS', Value: '5' },
        { Name: 'BILLING_JOB_POLL_MS', Value: '1000' },
        { Name: 'BILLING_JOB_RETRY_MS', Value: '30000' },
        { Name: 'DATABASE_POOL_MAX', Value: '2' },
        { Name: 'PGDATABASE', Value: 'app' },
        { Name: 'PGSSLMODE', Value: 'verify-full' },
        {
          Name: 'PGSSLROOTCERT',
          Value: '/etc/ssl/certs/rds-global-bundle.pem',
        },
      ]),
    )
  })

  it('has monitoring but no public or data-plane resources', () => {
    const template = Template.fromStack(createWorkerStack().stack)

    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1)
    template.resourceCountIs('AWS::CloudWatch::Alarm', 0)
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0)
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 0)
    template.resourceCountIs('AWS::WAFv2::WebACL', 0)
    template.resourceCountIs('AWS::CertificateManager::Certificate', 0)
    template.resourceCountIs('AWS::Route53::HostedZone', 0)
    template.resourceCountIs('AWS::Route53::RecordSet', 0)
    template.resourceCountIs('AWS::RDS::DBInstance', 0)
  })

  it('builds one worker image asset for the aws-runner target', () => {
    const { app } = createWorkerStack()
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
})
