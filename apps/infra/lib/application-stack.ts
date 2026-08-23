import path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import type { Construct } from 'constructs'

export const MAX_PROJECT_NAME_LENGTH = 63

export interface ApplicationStackProps extends cdk.StackProps {
  certificateArn: string
  domainName: string
  hostedZoneId?: string
  hostedZoneName?: string
  projectName: string
}

/**
 * The project name is used as a Cloud Map DNS label and as part of the stack
 * name, service names, and CloudWatch metric names.
 */
export function validateProjectName(projectName: string): void {
  if (
    !new RegExp(
      `^[a-z](?:[a-z0-9-]{0,${MAX_PROJECT_NAME_LENGTH - 2}}[a-z0-9])?$`,
    ).test(projectName)
  ) {
    throw new Error(
      `projectName must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer, start with a lowercase letter, end with a lowercase letter or digit, and contain only lowercase letters, digits, and hyphens.`,
    )
  }
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props)

    validateProjectName(props.projectName)

    if (Boolean(props.hostedZoneId) !== Boolean(props.hostedZoneName)) {
      throw new Error(
        'hostedZoneId and hostedZoneName must be provided together to create a Route 53 alias record.',
      )
    }

    const domainName = props.domainName.replace(/\.$/, '')
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      props.certificateArn,
    )
    const repoRoot = path.resolve(import.meta.dirname, '../../..')
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
    })

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${props.projectName}-cluster`,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      vpc,
    })

    cluster.addDefaultCloudMapNamespace({ name: `${props.projectName}.local` })

    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })

    const apiContainer = apiTask.addContainer('ApiContainer', {
      environment: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      image: ecs.ContainerImage.fromAsset(repoRoot, {
        exclude: [
          '**/.next/**',
          '**/.turbo/**',
          '**/cdk.out/**',
          '**/dist/**',
          '**/node_modules/**',
          '.git/**',
        ],
        file: 'apps/api/Dockerfile',
        ignoreMode: cdk.IgnoreMode.GLOB,
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      healthCheck: {
        command: [
          'CMD-SHELL',
          'wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/v1/health || exit 1',
        ],
        interval: cdk.Duration.seconds(30),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(5),
      },
      logging: ecs.LogDrivers.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: 'api',
      }),
    })

    apiContainer.addPortMappings({ containerPort: 3001 })

    const apiService = new ecs.FargateService(this, 'ApiService', {
      circuitBreaker: { rollback: true },
      cloudMapOptions: { name: 'api' },
      cluster,
      desiredCount: 2,
      enableExecuteCommand: true,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      serviceName: `${props.projectName}-api`,
      taskDefinition: apiTask,
    })

    const webService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'WebService',
      {
        assignPublicIp: false,
        circuitBreaker: { rollback: true },
        certificate,
        cluster,
        desiredCount: 2,
        enableExecuteCommand: true,
        healthCheckGracePeriod: cdk.Duration.seconds(60),
        maxHealthyPercent: 200,
        minHealthyPercent: 100,
        publicLoadBalancer: true,
        redirectHTTP: true,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        serviceName: `${props.projectName}-web`,
        taskImageOptions: {
          containerPort: 3000,
          environment: {
            API_URL: `http://api.${props.projectName}.local:3001`,
            HOSTNAME: '0.0.0.0',
            NODE_ENV: 'production',
            PORT: '3000',
          },
          image: ecs.ContainerImage.fromAsset(repoRoot, {
            exclude: [
              '**/.next/**',
              '**/.turbo/**',
              '**/cdk.out/**',
              '**/dist/**',
              '**/node_modules/**',
              '.git/**',
            ],
            file: 'apps/web/Dockerfile',
            ignoreMode: cdk.IgnoreMode.GLOB,
            platform: ecrAssets.Platform.LINUX_AMD64,
          }),
          logDriver: ecs.LogDrivers.awsLogs({
            logRetention: logs.RetentionDays.ONE_MONTH,
            streamPrefix: 'web',
          }),
        },
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    )

    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${props.projectName}-web-acl`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          action: { block: {} },
          name: 'IpRateLimit',
          priority: 0,
          statement: {
            rateBasedStatement: {
              aggregateKeyType: 'IP',
              limit: 500,
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${props.projectName}-ip-rate-limit`,
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
            metricName: `${props.projectName}-aws-managed-common`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    })

    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: webService.loadBalancer.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    })

    webService.targetGroup.configureHealthCheck({
      healthyHttpCodes: '200',
      path: '/health',
    })
    apiService.connections.allowFrom(
      webService.loadBalancer,
      ec2.Port.tcp(3001),
    )
    apiService.connections.allowFrom(webService.service, ec2.Port.tcp(3001))

    webService.listener.addTargets('ApiTargets', {
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*'])],
      healthCheck: { healthyHttpCodes: '200', path: '/api/v1/health' },
      port: 3001,
      priority: 10,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
    })

    apiService
      .autoScaleTaskCount({ maxCapacity: 4, minCapacity: 2 })
      .scaleOnCpuUtilization('ApiCpuScaling', { targetUtilizationPercent: 70 })

    webService.service
      .autoScaleTaskCount({ maxCapacity: 4, minCapacity: 2 })
      .scaleOnCpuUtilization('WebCpuScaling', { targetUtilizationPercent: 70 })

    if (props.hostedZoneId && props.hostedZoneName) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
        this,
        'HostedZone',
        {
          hostedZoneId: props.hostedZoneId,
          zoneName: props.hostedZoneName,
        },
      )

      new route53.ARecord(this, 'ApplicationAliasRecord', {
        // A trailing dot makes this a fully qualified record name. Without it,
        // CDK would append the hosted-zone name a second time for subdomains.
        recordName: `${domainName}.`,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.LoadBalancerTarget(webService.loadBalancer),
        ),
        zone: hostedZone,
      })
    }

    new cdk.CfnOutput(this, 'ApplicationUrl', {
      description: 'The HTTPS URL served by the custom domain.',
      value: `https://${domainName}`,
    })

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      description:
        'The load balancer DNS name. Use it only when creating DNS records; its certificate does not cover this name.',
      value: webService.loadBalancer.loadBalancerDnsName,
    })
  }
}
