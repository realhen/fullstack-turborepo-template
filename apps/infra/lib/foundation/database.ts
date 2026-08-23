import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import type { Construct } from 'constructs'

export function createFoundationDatabase(
  scope: Construct,
  vpc: ec2.IVpc,
  securityGroup: ec2.ISecurityGroup,
): rds.DatabaseInstance {
  const database = new rds.DatabaseInstance(scope, 'Database', {
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
    securityGroups: [securityGroup],
    storageEncrypted: true,
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  })

  database.addRotationSingleUser({
    automaticallyAfter: cdk.Duration.days(30),
  })

  return database
}
