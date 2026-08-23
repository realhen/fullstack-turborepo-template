import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import type * as ecs from 'aws-cdk-lib/aws-ecs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type { Construct } from 'constructs'

export interface WorkerMonitoringOptions {
  database: rds.DatabaseInstance
  projectName: string
  service: ecs.FargateService
}

export function createWorkerMonitoring(
  scope: Construct,
  options: WorkerMonitoringOptions,
): void {
  new cloudwatch.Dashboard(scope, 'WorkerOperationsDashboard', {
    dashboardName: `${options.projectName}-worker-operations`,
    widgets: [
      [
        new cloudwatch.GraphWidget({
          left: [options.service.metricCpuUtilization()],
          title: 'Worker ECS CPU',
        }),
        new cloudwatch.GraphWidget({
          left: [
            options.database.metricCPUUtilization(),
            options.database.metricDatabaseConnections(),
          ],
          title: 'Worker database dependency',
        }),
      ],
    ],
  })
}
