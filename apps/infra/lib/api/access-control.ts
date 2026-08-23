import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import type * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import type { Construct } from 'constructs'

export function createApiAccessControl(
  scope: Construct,
  projectName: string,
  loadBalancer: elbv2.IApplicationLoadBalancer,
): void {
  const webAcl = new wafv2.CfnWebACL(scope, 'ApiWebAcl', {
    defaultAction: { allow: {} },
    rules: [
      {
        action: { block: {} },
        name: 'IpRateLimit',
        priority: 0,
        statement: {
          rateBasedStatement: { aggregateKeyType: 'IP', limit: 500 },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${projectName}-api-ip-rate-limit`,
          sampledRequestsEnabled: true,
        },
      },
      {
        name: 'AWSManagedRulesCommonRuleSet',
        overrideAction: { none: {} },
        priority: 1,
        statement: {
          managedRuleGroupStatement: {
            name: 'AWSManagedRulesCommonRuleSet',
            vendorName: 'AWS',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${projectName}-api-aws-managed-common`,
          sampledRequestsEnabled: true,
        },
      },
    ],
    scope: 'REGIONAL',
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: `${projectName}-api-acl`,
      sampledRequestsEnabled: true,
    },
  })

  new wafv2.CfnWebACLAssociation(scope, 'ApiWebAclAssociation', {
    resourceArn: loadBalancer.loadBalancerArn,
    webAclArn: webAcl.attrArn,
  })
}
