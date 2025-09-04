import {
  ECSClient,
  DescribeServicesCommand,
  UpdateServiceCommand,
  ListTasksCommand,
  DescribeTasksCommand,
  waitUntilServicesStable,
} from "@aws-sdk/client-ecs";
import {
  EC2Client,
  DescribeNetworkInterfacesCommand,
} from "@aws-sdk/client-ec2";
import {
  GMAPS_AWS_REGION,
  GMAPS_AWS_CLUSTER,
  GMAPS_AWS_SERVICE,
  GMAPS_BASE_URL,
} from "@/env";

const ecs = new ECSClient({ region: GMAPS_AWS_REGION });
const ec2 = new EC2Client({ region: GMAPS_AWS_REGION });

let cachedBase: string | null = null;
let cachedAt = 0;

export async function ensureServiceRunning() {
  const describe = await ecs.send(
    new DescribeServicesCommand({
      cluster: GMAPS_AWS_CLUSTER,
      services: [GMAPS_AWS_SERVICE],
    })
  );
  const service = describe.services?.[0];
  if (!service || service.desiredCount === 0) {
    await ecs.send(
      new UpdateServiceCommand({
        cluster: GMAPS_AWS_CLUSTER,
        service: GMAPS_AWS_SERVICE,
        desiredCount: 1,
      })
    );
    await waitUntilServicesStable(
      { client: ecs, maxWaitTime: 60 },
      { cluster: GMAPS_AWS_CLUSTER, services: [GMAPS_AWS_SERVICE] }
    );
    cachedBase = null;
  }
}

export async function getCurrentIP(): Promise<string> {
  if (GMAPS_BASE_URL) {
    return GMAPS_BASE_URL;
  }
  const now = Date.now();
  if (cachedBase && now - cachedAt < 60_000) {
    return cachedBase;
  }
  const tasksRes = await ecs.send(
    new ListTasksCommand({
      cluster: GMAPS_AWS_CLUSTER,
      serviceName: GMAPS_AWS_SERVICE,
    })
  );
  const taskArn = tasksRes.taskArns?.[0];
  if (!taskArn) {
    throw new Error("No tasks found for GMAPS service");
  }
  const taskRes = await ecs.send(
    new DescribeTasksCommand({
      cluster: GMAPS_AWS_CLUSTER,
      tasks: [taskArn],
    })
  );
  const eni = taskRes.tasks?.[0]?.attachments?.[0]?.details?.find(
    (d) => d.name === "networkInterfaceId"
  )?.value;
  if (!eni) {
    throw new Error("No network interface found");
  }
  const eniRes = await ec2.send(
    new DescribeNetworkInterfacesCommand({
      NetworkInterfaceIds: [eni],
    })
  );
  const ip = eniRes.NetworkInterfaces?.[0]?.Association?.PublicIp;
  if (!ip) {
    throw new Error("No public IP found");
  }
  cachedBase = `http://${ip}`;
  cachedAt = now;
  return cachedBase;
}

export async function scaleDown() {
  await ecs.send(
    new UpdateServiceCommand({
      cluster: GMAPS_AWS_CLUSTER,
      service: GMAPS_AWS_SERVICE,
      desiredCount: 0,
    })
  );
  cachedBase = null;
}
