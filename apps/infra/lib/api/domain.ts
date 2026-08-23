import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import type * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import type { Construct } from 'constructs'

export function createApiCertificate(
  scope: Construct,
  domainName: string,
  hostedZone: route53.IHostedZone,
): acm.Certificate {
  return new acm.Certificate(scope, 'ApiCertificate', {
    domainName,
    validation: acm.CertificateValidation.fromDns(hostedZone),
  })
}

export function createApiAlias(
  scope: Construct,
  domainName: string,
  hostedZone: route53.IHostedZone,
  loadBalancer: elbv2.IApplicationLoadBalancer,
): void {
  new route53.ARecord(scope, 'ApiAliasRecord', {
    recordName: `${domainName}.`,
    target: route53.RecordTarget.fromAlias(
      new route53Targets.LoadBalancerTarget(loadBalancer),
    ),
    zone: hostedZone,
  })

  new cdk.CfnOutput(scope, 'ApiUrl', {
    description: 'The public HTTPS API URL.',
    value: `https://${domainName}`,
  })
  new cdk.CfnOutput(scope, 'ApiLoadBalancerDnsName', {
    description:
      'The API load balancer DNS name. Its certificate covers only the configured API domain.',
    value: loadBalancer.loadBalancerDnsName,
  })
}
