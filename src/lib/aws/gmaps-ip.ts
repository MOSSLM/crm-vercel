import {
  ECSClient,
  DescribeServicesCommand,
  UpdateServiceCommand,
  ListTasksCommand,
  DescribeTasksCommand,
  waitUntilServicesStable,
  KeyValuePair,
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
  GMAPS_PORT,
} from "@/env";

// Mode "machine fixe" : pas de Fargate, un ordinateur tourne en continu avec
// Docker dessus, joint via GMAPS_BASE_URL. ensureServiceRunning()/scaleDown()
// deviennent des no-op — il n'y a pas de service ECS à réveiller ou éteindre,
// et les clients AWS ne sont même pas construits (créer un ECSClient sans
// région valide lève déjà à la construction).
const modeMachineFixe = !GMAPS_AWS_REGION || !GMAPS_AWS_CLUSTER || !GMAPS_AWS_SERVICE;

const ecs = modeMachineFixe ? null : new ECSClient({ region: GMAPS_AWS_REGION });
const ec2 = modeMachineFixe ? null : new EC2Client({ region: GMAPS_AWS_REGION });

let cachedBase: string | null = null;
let cachedAt = 0;
let clairDejaSignale = false;

/**
 * ⚠️ TRANSPORT EN CLAIR. La tâche ECS n'a qu'une IP publique brute et pas de
 * certificat : la base résolue est donc en `http://`, et le jeton d'API (ainsi
 * que le JWT de l'utilisateur) transitent sans chiffrement sur l'Internet public.
 * Le code seul ne peut pas régler ça — il faut mettre un terminateur TLS devant
 * le conteneur (tunnel Cloudflare, ALB avec certificat ACM, ou Tailscale) puis
 * renseigner `GMAPS_BASE_URL` en `https://…`. En attendant, on le crie au log
 * une fois par processus plutôt que de le laisser passer inaperçu.
 */
const avertirSiTransportEnClair = (base: string) => {
  if (clairDejaSignale || base.startsWith("https://")) return;
  clairDejaSignale = true;
  console.warn(
    `[gmaps] Le scraper est joint en clair (${base}) : le jeton d'API et le JWT ` +
      "utilisateur voyagent non chiffrés. Placer un terminateur TLS devant la " +
      "tâche ECS et renseigner GMAPS_BASE_URL en https://.",
  );
};

export async function ensureServiceRunning() {
  if (modeMachineFixe) return;
  const describe = await ecs!.send(
    new DescribeServicesCommand({
      cluster: GMAPS_AWS_CLUSTER,
      services: [GMAPS_AWS_SERVICE],
    })
  );
  const service = describe.services?.[0];
  if (!service || service.desiredCount === 0) {
    await ecs!.send(
      new UpdateServiceCommand({
        cluster: GMAPS_AWS_CLUSTER,
        service: GMAPS_AWS_SERVICE,
        desiredCount: 1,
      })
    );
    await waitUntilServicesStable(
      { client: ecs!, maxWaitTime: 60 },
      { cluster: GMAPS_AWS_CLUSTER, services: [GMAPS_AWS_SERVICE] }
    );
    cachedBase = null;
  }
}

export async function getCurrentIP(): Promise<string> {
  if (GMAPS_BASE_URL) {
    avertirSiTransportEnClair(GMAPS_BASE_URL);
    return GMAPS_BASE_URL;
  }
  if (modeMachineFixe) {
    // Erreur explicite plutôt qu'un TypeError sur `ecs` null : sans Fargate
    // configuré, GMAPS_BASE_URL est la SEULE façon de joindre le scraper.
    throw new Error(
      "GMAPS_BASE_URL est requis : ni Fargate (GMAPS_AWS_REGION/CLUSTER/SERVICE) " +
        "ni une base fixe ne sont configurés, impossible de joindre le scraper.",
    );
  }
  const now = Date.now();
  if (cachedBase && now - cachedAt < 60_000) {
    return cachedBase;
  }
  const tasksRes = await ecs!.send(
    new ListTasksCommand({
      cluster: GMAPS_AWS_CLUSTER,
      serviceName: GMAPS_AWS_SERVICE,
    })
  );
  const taskArn = tasksRes.taskArns?.[0];
  if (!taskArn) {
    throw new Error("No tasks found for GMAPS service");
  }
  const taskRes = await ecs!.send(
    new DescribeTasksCommand({
      cluster: GMAPS_AWS_CLUSTER,
      tasks: [taskArn],
    })
  );
  const eni = taskRes.tasks?.[0]?.attachments?.[0]?.details?.find(
    (d: KeyValuePair) => d.name === "networkInterfaceId"
  )?.value;
  if (!eni) {
    throw new Error("No network interface found");
  }
  const eniRes = await ec2!.send(
    new DescribeNetworkInterfacesCommand({
      NetworkInterfaceIds: [eni],
    })
  );
  const ip = eniRes.NetworkInterfaces?.[0]?.Association?.PublicIp;
  if (!ip) {
    throw new Error("No public IP found");
  }
  // Le conteneur écoute sur GMAPS_PORT (3000 par défaut) : sans le port explicite
  // on tapait sur le 80, où rien n'écoute, et chaque appel expirait.
  cachedBase = `http://${ip}:${GMAPS_PORT}`;
  cachedAt = now;
  avertirSiTransportEnClair(cachedBase);
  return cachedBase;
}

export async function scaleDown() {
  // Rien à éteindre : la machine fixe reste allumée en continu (l'utilisateur
  // l'arrête lui-même s'il le souhaite). C'est un choix assumé pour un usage
  // "très rare" — pas de coût à la minute comme sur Fargate, donc pas de
  // pression à couper automatiquement.
  if (modeMachineFixe) return;
  await ecs!.send(
    new UpdateServiceCommand({
      cluster: GMAPS_AWS_CLUSTER,
      service: GMAPS_AWS_SERVICE,
      desiredCount: 0,
    })
  );
  cachedBase = null;
}
