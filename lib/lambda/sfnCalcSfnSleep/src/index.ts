import { ListExecutionsCommand, SFNClient } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient({});

export const handler = async (event: {
  stateMachineArn: string;
}): Promise<number> => {
  const { stateMachineArn } = event;

  try {
    // Get running executions
    const response = await sfnClient.send(
      new ListExecutionsCommand({
        stateMachineArn,
        statusFilter: "RUNNING",
      })
    );

    const runningExecutions = response.executions?.length ?? 0;

    // Calculate sleep time based on running executions
    // Base delay of 10 seconds per running execution
    const sleepSeconds = Math.max((runningExecutions - 1) * 10, 0);

    return sleepSeconds;
  } catch (error) {
    console.error("Error getting executions:", error);
    return 0;
  }
};
