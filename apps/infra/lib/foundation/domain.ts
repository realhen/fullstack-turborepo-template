import * as route53 from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

export function createApiHostedZone(
  scope: Construct,
  domainName: string,
): route53.PublicHostedZone {
  return new route53.PublicHostedZone(scope, 'ApiHostedZone', {
    comment: 'Delegated public DNS zone for the AWS-hosted API.',
    zoneName: domainName,
  })
}
