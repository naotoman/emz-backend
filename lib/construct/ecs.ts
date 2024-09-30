import { Duration, aws_lambda as lambda, aws_logs as logs } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface EcsProps {
  chromiumLayerArn: string;
}

export class Ecs extends Construct {
  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

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
  }
}
