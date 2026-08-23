import * as cdk from 'aws-cdk-lib'
import type * as ec2 from 'aws-cdk-lib/aws-ec2'
import type * as ecs from 'aws-cdk-lib/aws-ecs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type { Construct } from 'constructs'
import { validateProjectName } from '../config.js'
import { importWorkerSecurityGroup } from './access-control.js'
import { createWorkerService } from './fargate-service.js'
import { createWorkerMonitoring } from './monitoring.js'

export interface WorkerStackProps extends cdk.StackProps {
  cluster: ecs.ICluster
  database: rds.DatabaseInstance
  projectName: string
  workerSecret: secretsmanager.ISecret
  workerSecurityGroup: ec2.ISecurityGroup
}

export class WorkerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WorkerStackProps) {
    super(scope, id, props)

    validateProjectName(props.projectName)

    const securityGroup = importWorkerSecurityGroup(
      this,
      props.workerSecurityGroup,
    )
    const deployment = createWorkerService(this, {
      cluster: props.cluster,
      database: props.database,
      projectName: props.projectName,
      securityGroup,
      workerSecret: props.workerSecret,
    })

    createWorkerMonitoring(this, {
      database: props.database,
      projectName: props.projectName,
      service: deployment.service,
    })
  }
}
