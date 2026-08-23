import * as ec2 from 'aws-cdk-lib/aws-ec2'
import type { Construct } from 'constructs'

export interface FoundationAccessControl {
  apiSecurityGroup: ec2.SecurityGroup
  databaseSecurityGroup: ec2.SecurityGroup
  workerSecurityGroup: ec2.SecurityGroup
}

export function createFoundationAccessControl(
  scope: Construct,
  vpc: ec2.IVpc,
): FoundationAccessControl {
  const apiSecurityGroup = new ec2.SecurityGroup(scope, 'ApiSecurityGroup', {
    description: 'Network access for the API Fargate service.',
    vpc,
  })
  const workerSecurityGroup = new ec2.SecurityGroup(
    scope,
    'WorkerSecurityGroup',
    {
      description: 'Network access for the worker Fargate service.',
      vpc,
    },
  )
  const databaseSecurityGroup = new ec2.SecurityGroup(
    scope,
    'DatabaseSecurityGroup',
    {
      description: 'PostgreSQL access from backend services.',
      vpc,
    },
  )

  databaseSecurityGroup.addIngressRule(
    apiSecurityGroup,
    ec2.Port.tcp(5432),
    'Allow API tasks to connect to PostgreSQL.',
  )
  databaseSecurityGroup.addIngressRule(
    workerSecurityGroup,
    ec2.Port.tcp(5432),
    'Allow worker tasks to connect to PostgreSQL.',
  )
  apiSecurityGroup.addIngressRule(
    workerSecurityGroup,
    ec2.Port.tcp(3001),
    'Allow worker tasks to call the internal API endpoint.',
  )

  return { apiSecurityGroup, databaseSecurityGroup, workerSecurityGroup }
}
