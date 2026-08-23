import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import type * as ecs from 'aws-cdk-lib/aws-ecs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as route53 from 'aws-cdk-lib/aws-route53'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type * as sns from 'aws-cdk-lib/aws-sns'
import type { Construct } from 'constructs'
import {
  isAuthConfigured,
  requireValue,
  validateProjectName,
  type AuthConfiguration,
} from '../config.js'
import { createApiAccessControl } from './access-control.js'
import { createApiAlias, createApiCertificate } from './domain.js'
import { createApiService } from './fargate-service.js'
import { createApiMonitoring } from './monitoring.js'

export interface ApiStackProps extends cdk.StackProps, AuthConfiguration {
  alarmTopic: sns.ITopic
  apiSecurityGroup: ec2.ISecurityGroup
  applicationSecretsArn?: string
  cluster: ecs.ICluster
  database: rds.DatabaseInstance
  domainName: string
  hostedZone: route53.IHostedZone
  projectName: string
  vpc: ec2.IVpc
  webOrigin: string
  workerSecret: secretsmanager.ISecret
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    validateProjectName(props.projectName)
    isAuthConfigured(props)
    const domainName = requireValue('domainName', props.domainName).replace(
      /\.$/,
      '',
    )
    const webOrigin = requireValue('webOrigin', props.webOrigin).replace(
      /\/$/,
      '',
    )
    const certificate = createApiCertificate(this, domainName, props.hostedZone)
    const applicationSecrets = props.applicationSecretsArn
      ? secretsmanager.Secret.fromSecretCompleteArn(
          this,
          'ApplicationSecrets',
          props.applicationSecretsArn,
        )
      : undefined
    const apiSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ApiServiceSecurityGroup',
      props.apiSecurityGroup.securityGroupId,
      { mutable: false },
    )
    const { deployment } = createApiService(this, {
      applicationSecrets,
      authAudience: props.authAudience,
      authClientId: props.authClientId,
      authIssuer: props.authIssuer,
      authJwksUri: props.authJwksUri,
      certificate,
      cluster: props.cluster,
      database: props.database,
      domainName,
      projectName: props.projectName,
      securityGroup: apiSecurityGroup,
      webOrigin,
      workerSecret: props.workerSecret,
    })

    createApiAccessControl(this, props.projectName, deployment.loadBalancer!)
    createApiAlias(this, domainName, props.hostedZone, deployment.loadBalancer!)
    createApiMonitoring(this, {
      alarmTopic: props.alarmTopic,
      database: props.database,
      loadBalancer: deployment.loadBalancer!,
      projectName: props.projectName,
      service: deployment.service,
    })

    new cdk.CfnOutput(this, 'MigrationClusterName', {
      value: props.cluster.clusterName,
    })
    new cdk.CfnOutput(this, 'MigrationSecurityGroupId', {
      value: props.apiSecurityGroup.securityGroupId,
    })
    new cdk.CfnOutput(this, 'MigrationSubnetIds', {
      value: props.vpc.privateSubnets
        .map((subnet) => subnet.subnetId)
        .join(','),
    })
  }
}
