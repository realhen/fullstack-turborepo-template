import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions'
import type * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import type * as rds from 'aws-cdk-lib/aws-rds'
import type * as sns from 'aws-cdk-lib/aws-sns'
import type { Construct } from 'constructs'

export interface ApiMonitoringOptions {
  alarmTopic: sns.ITopic
  database: rds.DatabaseInstance
  loadBalancer: elbv2.IApplicationLoadBalancer
  projectName: string
  service: ecs.FargateService
}

export function createApiMonitoring(
  scope: Construct,
  options: ApiMonitoringOptions,
): void {
  const alarmAction = new cloudwatchActions.SnsAction(options.alarmTopic)
  const alarms = [
    new cloudwatch.Alarm(scope, 'ApiTargetErrorsAlarm', {
      alarmDescription: 'The API is returning elevated target 5xx errors.',
      evaluationPeriods: 2,
      metric: options.loadBalancer.metrics.httpCodeTarget(
        elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: cdk.Duration.minutes(5), statistic: 'sum' },
      ),
      threshold: 5,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }),
    new cloudwatch.Alarm(scope, 'DatabaseCpuAlarm', {
      alarmDescription: 'PostgreSQL CPU has remained high.',
      evaluationPeriods: 3,
      metric: options.database.metricCPUUtilization({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
    }),
  ]

  for (const alarm of alarms) alarm.addAlarmAction(alarmAction)

  new cloudwatch.Dashboard(scope, 'ApiOperationsDashboard', {
    dashboardName: `${options.projectName}-api-operations`,
    widgets: [
      [
        new cloudwatch.GraphWidget({
          left: [
            options.loadBalancer.metrics.httpCodeTarget(
              elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
            ),
            options.loadBalancer.metrics.targetResponseTime(),
          ],
          title: 'API HTTP health',
        }),
        new cloudwatch.GraphWidget({
          left: [options.service.metricCpuUtilization()],
          title: 'API ECS CPU',
        }),
      ],
      [
        new cloudwatch.GraphWidget({
          left: [
            options.database.metricCPUUtilization(),
            options.database.metricDatabaseConnections(),
            options.database.metricFreeStorageSpace(),
          ],
          title: 'PostgreSQL',
        }),
      ],
    ],
  })
}
