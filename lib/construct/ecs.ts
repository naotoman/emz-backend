import {
  Duration,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
} from "aws-cdk-lib";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { EcsTask } from "aws-cdk-lib/aws-events-targets";

import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";

export interface EcsProps {
  chromiumLayerArn: string;
  ecsVpcId: string;
  ecsSubnetIds: string[];
  table: dynamodb.ITableV2;
}

export class Ecs extends Construct {
  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    const awsSsmExtensionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "ssmExtension",
      `arn:aws:lambda:ap-northeast-1:133490724326:layer:AWS-Parameters-and-Secrets-Lambda-Extension:12`
    );

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: props.ecsVpcId,
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc: vpc,
    });

    const scraper = new lambda.Function(this, `Scraper`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "scrapeStock" },
      }),
      memorySize: 2048,
      timeout: Duration.seconds(30),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "Chromium",
          props.chromiumLayerArn
        ),
      ],
      logGroup: new logs.LogGroup(this, `ScraperLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });

    const listingControl = new lambda.Function(this, `ListingControl`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromDockerBuild("lib/lambda", {
        buildArgs: { lambda: "ecsListingControl" },
      }),
      memorySize: 256,
      timeout: Duration.seconds(20),
      layers: [awsSsmExtensionLayer],
      logGroup: new logs.LogGroup(this, `ListingControlLog`, {
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
    });
    listingControl.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
    );

    const ecsTaskRole = new iam.Role(this, "EcsTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess"),
      ],
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
      taskRole: ecsTaskRole,
    });

    taskDef.addContainer("container", {
      image: ecs.ContainerImage.fromAsset("lib/container/ecsTask", {
        platform: Platform.LINUX_AMD64,
      }),
      environment: {
        TABLE_NAME: props.table.tableName,
        SCRAPE_LAMBDA_NAME: scraper.functionName,
        LISTING_LAMBDA_NAME: listingControl.functionName,
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "ecs",
        logRetention: logs.RetentionDays.THREE_MONTHS,
      }),
    });

    const ecsTaskTarget = new EcsTask({
      cluster,
      taskDefinition: taskDef,
      assignPublicIp: true,
      subnetSelection: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      retryAttempts: 0,
    });

    new Rule(this, "ScheduleRule", {
      schedule: Schedule.rate(Duration.hours(24)),
      targets: [ecsTaskTarget],
      enabled: true,
    });
  }
}
