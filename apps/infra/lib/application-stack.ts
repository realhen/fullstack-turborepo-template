import path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import type { Construct } from 'constructs'

export const MAX_PROJECT_NAME_LENGTH = 63

export interface ApplicationStackProps extends cdk.StackProps {
  alarmEmail?: string
  applicationSecretsArn?: string
  authAudience?: string
  authClientId?: string
  authIssuer?: string
  authJwksUri?: string
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

    const authConfigured = Boolean(
      props.authIssuer &&
      props.authJwksUri &&
      (props.authAudience || props.authClientId),
    )
    const hasPartialAuthConfiguration = Boolean(
      props.authIssuer ||
      props.authJwksUri ||
      props.authAudience ||
      props.authClientId,
    )
    if (hasPartialAuthConfiguration && !authConfigured) {
      throw new Error(
        'OIDC authentication requires authIssuer, authJwksUri, and either authAudience or authClientId.',
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

    const database = new rds.DatabaseInstance(this, 'Database', {
      allocatedStorage: 20,
      backupRetention: cdk.Duration.days(14),
      credentials: rds.Credentials.fromGeneratedSecret('app'),
      databaseName: 'app',
      deletionProtection: true,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      maxAllocatedStorage: 100,
      monitoringInterval: cdk.Duration.seconds(60),
      multiAz: true,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      storageEncrypted: true,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    })
    database.addRotationSingleUser({
      automaticallyAfter: cdk.Duration.days(30),
    })

    const applicationSecrets = props.applicationSecretsArn
      ? secretsmanager.Secret.fromSecretCompleteArn(
          this,
          'ApplicationSecrets',
          props.applicationSecretsArn,
        )
      : undefined
    const workerSecret = new secretsmanager.Secret(this, 'WorkerSecret', {
      description: 'Shared secret for worker-to-API job execution.',
      generateSecretString: {
        excludePunctuation: true,
        generateStringKey: 'secret',
        secretStringTemplate: '{}',
      },
    })

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${props.projectName}-cluster`,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      vpc,
    })

    cluster.addDefaultCloudMapNamespace({ name: `${props.projectName}.local` })

    const apiImage = ecs.ContainerImage.fromAsset(repoRoot, {
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
    })

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
        AUTH_MODE: authConfigured ? 'oidc' : 'disabled',
        ...(props.authAudience ? { AUTH_AUDIENCE: props.authAudience } : {}),
        ...(props.authClientId ? { AUTH_CLIENT_ID: props.authClientId } : {}),
        ...(props.authIssuer ? { AUTH_ISSUER: props.authIssuer } : {}),
        ...(props.authJwksUri ? { AUTH_JWKS_URI: props.authJwksUri } : {}),
        BILLING_PROVIDER: applicationSecrets ? 'stripe' : 'disabled',
        CORS_ORIGIN: `https://${domainName}`,
        PGDATABASE: 'app',
        PGHOST: database.dbInstanceEndpointAddress,
        PGPORT: database.dbInstanceEndpointPort,
        PGSSLMODE: 'require',
        NODE_ENV: 'production',
        PORT: '3001',
      },
      image: apiImage,
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
      secrets: {
        WORKER_SECRET: ecs.Secret.fromSecretsManager(workerSecret, 'secret'),
        PGPASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
        PGUSER: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
        ...(applicationSecrets
          ? {
              STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(
                applicationSecrets,
                'STRIPE_SECRET_KEY',
              ),
              STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(
                applicationSecrets,
                'STRIPE_WEBHOOK_SECRET',
              ),
              STRIPE_PRICE_STARTER_MONTHLY: ecs.Secret.fromSecretsManager(
                applicationSecrets,
                'STRIPE_PRICE_STARTER_MONTHLY',
              ),
              STRIPE_PRICE_PRO_MONTHLY: ecs.Secret.fromSecretsManager(
                applicationSecrets,
                'STRIPE_PRICE_PRO_MONTHLY',
              ),
            }
          : {}),
      },
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

    database.connections.allowDefaultPortFrom(apiService)

    const migrationTask = new ecs.FargateTaskDefinition(this, 'MigrationTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })
    migrationTask.addContainer('MigrationContainer', {
      command: ['node', 'node_modules/@repo/database/dist/migrate.js'],
      environment: {
        NODE_ENV: 'production',
        PGDATABASE: 'app',
        PGHOST: database.dbInstanceEndpointAddress,
        PGPORT: database.dbInstanceEndpointPort,
        PGSSLMODE: 'require',
      },
      image: apiImage,
      logging: ecs.LogDrivers.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: 'migration',
      }),
      secrets: {
        PGPASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
        PGUSER: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
      },
    })

    const workerTask = new ecs.FargateTaskDefinition(this, 'WorkerTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    })
    workerTask.addContainer('WorkerContainer', {
      environment: {
        BILLING_PROCESSOR_URL: `http://api.${props.projectName}.local:3001/api/v1/internal/billing/jobs`,
        BILLING_JOB_BATCH_SIZE: '10',
        BILLING_JOB_LEASE_MS: '60000',
        BILLING_JOB_MAX_ATTEMPTS: '5',
        BILLING_JOB_POLL_MS: '1000',
        BILLING_JOB_RETRY_MS: '30000',
        PGDATABASE: 'app',
        PGHOST: database.dbInstanceEndpointAddress,
        PGPORT: database.dbInstanceEndpointPort,
        PGSSLMODE: 'require',
        NODE_ENV: 'production',
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
        file: 'apps/worker/Dockerfile',
        ignoreMode: cdk.IgnoreMode.GLOB,
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      logging: ecs.LogDrivers.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: 'worker',
      }),
      secrets: {
        WORKER_SECRET: ecs.Secret.fromSecretsManager(workerSecret, 'secret'),
        PGPASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
        PGUSER: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
        ...(applicationSecrets
          ? {
              STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(
                applicationSecrets,
                'STRIPE_SECRET_KEY',
              ),
            }
          : {}),
      },
    })
    const workerService = new ecs.FargateService(this, 'WorkerService', {
      circuitBreaker: { rollback: true },
      cluster,
      desiredCount: 1,
      enableExecuteCommand: true,
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      serviceName: `${props.projectName}-worker`,
      taskDefinition: workerTask,
    })
    database.connections.allowDefaultPortFrom(workerService)
    apiService.connections.allowFrom(workerService, ec2.Port.tcp(3001))
    workerService
      .autoScaleTaskCount({ maxCapacity: 4, minCapacity: 1 })
      .scaleOnCpuUtilization('WorkerCpuScaling', {
        targetUtilizationPercent: 70,
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

    // Schema consumers are rolled in dependency order. Operators run the
    // migration task first, then ECS keeps API ahead of web and web ahead of
    // the worker that calls the API's internal billing endpoint.
    ;(
      webService.service.node.defaultChild as ecs.CfnService
    ).addResourceDependency(apiService.node.defaultChild as ecs.CfnService)
    ;(workerService.node.defaultChild as ecs.CfnService).addResourceDependency(
      webService.service.node.defaultChild as ecs.CfnService,
    )

    apiService
      .autoScaleTaskCount({ maxCapacity: 4, minCapacity: 2 })
      .scaleOnCpuUtilization('ApiCpuScaling', { targetUtilizationPercent: 70 })

    webService.service
      .autoScaleTaskCount({ maxCapacity: 4, minCapacity: 2 })
      .scaleOnCpuUtilization('WebCpuScaling', { targetUtilizationPercent: 70 })

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      displayName: `${props.projectName} production alarms`,
      topicName: `${props.projectName}-alarms`,
    })
    if (props.alarmEmail) {
      alarmTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alarmEmail),
      )
    }
    const alarmAction = new cloudwatchActions.SnsAction(alarmTopic)
    const alarms = [
      new cloudwatch.Alarm(this, 'ApiTargetErrorsAlarm', {
        alarmDescription: 'The API is returning elevated target 5xx errors.',
        evaluationPeriods: 2,
        metric: webService.loadBalancer.metrics.httpCodeTarget(
          elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
          { period: cdk.Duration.minutes(5), statistic: 'sum' },
        ),
        threshold: 5,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, 'DatabaseCpuAlarm', {
        alarmDescription: 'PostgreSQL CPU has remained high.',
        evaluationPeriods: 3,
        metric: database.metricCPUUtilization({
          period: cdk.Duration.minutes(5),
        }),
        threshold: 80,
      }),
    ]
    for (const alarm of alarms) alarm.addAlarmAction(alarmAction)

    new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: `${props.projectName}-operations`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            left: [
              webService.loadBalancer.metrics.httpCodeTarget(
                elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
              ),
              webService.loadBalancer.metrics.targetResponseTime(),
            ],
            title: 'HTTP health',
          }),
          new cloudwatch.GraphWidget({
            left: [
              apiService.metricCpuUtilization(),
              webService.service.metricCpuUtilization(),
              workerService.metricCpuUtilization(),
            ],
            title: 'ECS CPU',
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            left: [
              database.metricCPUUtilization(),
              database.metricDatabaseConnections(),
              database.metricFreeStorageSpace(),
            ],
            title: 'PostgreSQL',
          }),
        ],
      ],
    })

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

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: database.secret!.secretArn,
    })
    new cdk.CfnOutput(this, 'MigrationTaskDefinitionArn', {
      description: 'Run this one-off ECS task before an application rollout.',
      value: migrationTask.taskDefinitionArn,
    })
    new cdk.CfnOutput(this, 'MigrationClusterName', {
      value: cluster.clusterName,
    })
    new cdk.CfnOutput(this, 'MigrationSecurityGroupId', {
      value: apiService.connections.securityGroups[0]!.securityGroupId,
    })
    new cdk.CfnOutput(this, 'MigrationSubnetIds', {
      value: vpc.privateSubnets.map((subnet) => subnet.subnetId).join(','),
    })
  }
}
