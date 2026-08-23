import * as ec2 from 'aws-cdk-lib/aws-ec2'
import type { Construct } from 'constructs'

export function importWorkerSecurityGroup(
  scope: Construct,
  securityGroup: ec2.ISecurityGroup,
): ec2.ISecurityGroup {
  return ec2.SecurityGroup.fromSecurityGroupId(
    scope,
    'WorkerServiceSecurityGroup',
    securityGroup.securityGroupId,
    { mutable: false },
  )
}
