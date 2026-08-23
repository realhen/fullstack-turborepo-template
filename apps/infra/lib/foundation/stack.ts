import * as cdk from 'aws-cdk-lib'
import type * as ec2 from 'aws-cdk-lib/aws-ec2'
import type * as ecs from 'aws-cdk-lib/aws-ecs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as route53 from 'aws-cdk-lib/aws-route53'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type * as sns from 'aws-cdk-lib/aws-sns'
import type { Construct } from 'constructs'
import { validateProjectName } from '../config.js'
import { createFoundationAccessControl } from './access-control.js'
import { createFoundationDatabase } from './database.js'
import { createApiHostedZone } from './domain.js'
import { createFoundationNetwork } from './network.js'
import { createFoundationSharedResources } from './shared-resources.js'

export interface FoundationStackProps extends cdk.StackProps {
  alarmEmail?: string
  domainName: string
  projectName: string
}

export class FoundationStack extends cdk.Stack {
  readonly alarmTopic: sns.ITopic
  readonly apiSecurityGroup: ec2.ISecurityGroup
  readonly cluster: ecs.ICluster
  readonly database: rds.DatabaseInstance
  readonly hostedZone: route53.IHostedZone
  readonly vpc: ec2.IVpc
  readonly workerSecurityGroup: ec2.ISecurityGroup
  readonly workerSecret: secretsmanager.ISecret

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props)

    validateProjectName(props.projectName)

    const { cluster, vpc } = createFoundationNetwork(this, props.projectName)
    const { apiSecurityGroup, databaseSecurityGroup, workerSecurityGroup } =
      createFoundationAccessControl(this, vpc)
    const database = createFoundationDatabase(this, vpc, databaseSecurityGroup)
    const hostedZone = createApiHostedZone(this, props.domainName)
    const { alarmTopic, workerSecret } = createFoundationSharedResources(
      this,
      props.projectName,
      props.alarmEmail,
    )

    this.alarmTopic = alarmTopic
    this.apiSecurityGroup = apiSecurityGroup
    this.cluster = cluster
    this.database = database
    this.hostedZone = hostedZone
    this.vpc = vpc
    this.workerSecurityGroup = workerSecurityGroup
    this.workerSecret = workerSecret

    new cdk.CfnOutput(this, 'ApiHostedZoneNameServers', {
      description:
        'Delegate the API subdomain to these Route 53 name servers at the parent DNS provider.',
      value: cdk.Fn.join(',', hostedZone.hostedZoneNameServers ?? []),
    })
    new cdk.CfnOutput(this, 'ApiSecurityGroupId', {
      value: apiSecurityGroup.securityGroupId,
    })
    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: database.secret!.secretArn,
    })
    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: cluster.clusterName,
    })
    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: vpc.privateSubnets.map((subnet) => subnet.subnetId).join(','),
    })
    new cdk.CfnOutput(this, 'WorkerSecurityGroupId', {
      value: workerSecurityGroup.securityGroupId,
    })
  }
}
