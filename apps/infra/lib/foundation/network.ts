import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import type { Construct } from 'constructs'

export interface FoundationNetwork {
  cluster: ecs.Cluster
  vpc: ec2.Vpc
}

export function createFoundationNetwork(
  scope: Construct,
  projectName: string,
): FoundationNetwork {
  const vpc = new ec2.Vpc(scope, 'Vpc', {
    maxAzs: 2,
    natGateways: 1,
  })
  const cluster = new ecs.Cluster(scope, 'Cluster', {
    clusterName: `${projectName}-cluster`,
    containerInsightsV2: ecs.ContainerInsights.ENABLED,
    vpc,
  })

  cluster.addDefaultCloudMapNamespace({ name: `${projectName}.local` })

  return { cluster, vpc }
}
