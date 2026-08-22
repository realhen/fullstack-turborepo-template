import path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import type { Construct } from 'constructs'

interface ApplicationStackProps extends cdk.StackProps {
  projectName: string
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props)

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
      desiredCount: 1,
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
        cluster,
        desiredCount: 1,
        enableExecuteCommand: true,
        healthCheckGracePeriod: cdk.Duration.seconds(60),
        maxHealthyPercent: 200,
        minHealthyPercent: 100,
        publicLoadBalancer: true,
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
          }),
          logDriver: ecs.LogDrivers.awsLogs({
            logRetention: logs.RetentionDays.ONE_MONTH,
            streamPrefix: 'web',
          }),
        },
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    )

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
      .autoScaleTaskCount({ maxCapacity: 4, minCapacity: 1 })
      .scaleOnCpuUtilization('ApiCpuScaling', { targetUtilizationPercent: 70 })

    webService.service
      .autoScaleTaskCount({ maxCapacity: 4, minCapacity: 1 })
      .scaleOnCpuUtilization('WebCpuScaling', { targetUtilizationPercent: 70 })

    new cdk.CfnOutput(this, 'ApplicationUrl', {
      value: `http://${webService.loadBalancer.loadBalancerDnsName}`,
    })
  }
}
