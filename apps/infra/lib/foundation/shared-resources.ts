import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import type { Construct } from 'constructs'

export interface FoundationSharedResources {
  alarmTopic: sns.Topic
  workerSecret: secretsmanager.Secret
}

export function createFoundationSharedResources(
  scope: Construct,
  projectName: string,
  alarmEmail?: string,
): FoundationSharedResources {
  const workerSecret = new secretsmanager.Secret(scope, 'WorkerSecret', {
    description: 'Shared secret for worker-to-API job execution.',
    generateSecretString: {
      excludePunctuation: true,
      generateStringKey: 'secret',
      secretStringTemplate: '{}',
    },
  })
  const alarmTopic = new sns.Topic(scope, 'AlarmTopic', {
    displayName: `${projectName} production alarms`,
    topicName: `${projectName}-alarms`,
  })

  if (alarmEmail) {
    alarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(alarmEmail),
    )
  }

  return { alarmTopic, workerSecret }
}
