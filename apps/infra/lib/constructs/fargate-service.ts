import * as cdk from 'aws-cdk-lib'
import type * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

type ServiceContainerOptions = Omit<
  ecs.ContainerDefinitionOptions,
  'containerName' | 'logging'
>

export interface DependencyContainerOptions extends Omit<
  ecs.ContainerDefinitionOptions,
  'logging'
> {
  condition: ecs.ContainerDependencyCondition
  id: string
  logStreamPrefix: string
}

export interface PublicLoadBalancerOptions {
  certificate: acm.ICertificate
  healthCheckPath: string
}

export interface FargateServiceProps {
  cloudMapName?: string
  cluster: ecs.ICluster
  container: ServiceContainerOptions
  containerName: string
  containerPort?: number
  cpu?: number
  dependencyContainers?: DependencyContainerOptions[]
  desiredCount: number
  logStreamPrefix: string
  maxCapacity: number
  memoryLimitMiB?: number
  minCapacity: number
  publicLoadBalancer?: PublicLoadBalancerOptions
  securityGroup: ec2.ISecurityGroup
  serviceName: string
  targetCpuUtilizationPercent?: number
}

export class FargateService extends Construct {
  readonly container: ecs.ContainerDefinition
  readonly loadBalancer?: elbv2.ApplicationLoadBalancer
  readonly service: ecs.FargateService
  readonly targetGroup?: elbv2.ApplicationTargetGroup
  readonly taskDefinition: ecs.FargateTaskDefinition

  constructor(scope: Construct, id: string, props: FargateServiceProps) {
    super(scope, id)

    if (props.publicLoadBalancer && props.containerPort === undefined) {
      throw new Error('A public Fargate service requires a container port.')
    }

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {
        cpu: props.cpu ?? 256,
        memoryLimitMiB: props.memoryLimitMiB ?? 512,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      },
    )
    const dependencyContainers = (props.dependencyContainers ?? []).map(
      ({ condition, id: containerId, logStreamPrefix, ...options }) => ({
        condition,
        container: taskDefinition.addContainer(containerId, {
          ...options,
          logging: ecs.LogDrivers.awsLogs({
            logRetention: logs.RetentionDays.ONE_MONTH,
            streamPrefix: logStreamPrefix,
          }),
        }),
      }),
    )
    const container = taskDefinition.addContainer('PrimaryContainer', {
      ...props.container,
      containerName: props.containerName,
      logging: ecs.LogDrivers.awsLogs({
        logRetention: logs.RetentionDays.ONE_MONTH,
        streamPrefix: props.logStreamPrefix,
      }),
    })

    for (const dependency of dependencyContainers) {
      container.addContainerDependencies(dependency)
    }
    if (props.containerPort !== undefined) {
      container.addPortMappings({ containerPort: props.containerPort })
    }

    const service = new ecs.FargateService(this, 'Service', {
      circuitBreaker: { rollback: true },
      cloudMapOptions: props.cloudMapName
        ? { name: props.cloudMapName }
        : undefined,
      cluster: props.cluster,
      desiredCount: props.desiredCount,
      enableExecuteCommand: true,
      healthCheckGracePeriod: props.publicLoadBalancer
        ? cdk.Duration.seconds(60)
        : undefined,
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      securityGroups: [props.securityGroup],
      serviceName: props.serviceName,
      taskDefinition,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    })

    service
      .autoScaleTaskCount({
        maxCapacity: props.maxCapacity,
        minCapacity: props.minCapacity,
      })
      .scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: props.targetCpuUtilizationPercent ?? 70,
      })

    this.container = container
    this.service = service
    this.taskDefinition = taskDefinition

    if (props.publicLoadBalancer) {
      const loadBalancer = new elbv2.ApplicationLoadBalancer(
        this,
        'LoadBalancer',
        {
          internetFacing: true,
          vpc: props.cluster.vpc,
        },
      )
      const httpsListener = loadBalancer.addListener('HttpsListener', {
        certificates: [props.publicLoadBalancer.certificate],
        open: true,
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
      })
      const targetGroup = httpsListener.addTargets('ServiceTargets', {
        healthCheck: {
          healthyHttpCodes: '200',
          path: props.publicLoadBalancer.healthCheckPath,
        },
        port: props.containerPort!,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [service],
      })

      loadBalancer.addListener('HttpListener', {
        defaultAction: elbv2.ListenerAction.redirect({
          permanent: true,
          port: '443',
          protocol: 'HTTPS',
        }),
        open: true,
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
      })

      new ec2.CfnSecurityGroupIngress(this, 'LoadBalancerServiceIngress', {
        description: 'Allow the public load balancer to reach the service.',
        fromPort: props.containerPort,
        groupId: props.securityGroup.securityGroupId,
        ipProtocol: 'tcp',
        sourceSecurityGroupId:
          loadBalancer.connections.securityGroups[0]!.securityGroupId,
        toPort: props.containerPort,
      })

      this.loadBalancer = loadBalancer
      this.targetGroup = targetGroup
    }
  }
}
