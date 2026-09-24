import { DBOSClient } from "@dbos-inc/dbos-sdk";

/**
 * Enqueue durable work from anywhere, including inside a workflow step (where DBOS forbids
 * starting workflows directly). A fixed workflow id makes each enqueue happen at most once.
 */
let client: DBOSClient | undefined;

export async function startQueueClient(systemDatabaseUrl: string, applicationName: string) {
  client = await DBOSClient.create({ systemDatabaseUrl, applicationName });
}

export async function stopQueueClient() {
  await client?.destroy();
  client = undefined;
}

export async function enqueue(
  queueName: string,
  workflowName: string,
  workflowID: string,
  ...args: unknown[]
) {
  if (!client) throw new Error("The queue client is not started");
  await client.enqueue({ queueName, workflowName, workflowID }, ...args);
}
