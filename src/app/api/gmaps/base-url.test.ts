/**
 * @jest-environment node
 *
 * Teste la construction de la base URL du scraper (`src/lib/aws/gmaps-ip.ts`).
 * Le test vit ici, avec les routes qui consomment cette base, parce que c'est
 * la seule chose qui rendait TOUS les appels /api/gmaps/* injoignables : le CRM
 * tapait sur `http://<ip>` (port 80) alors que le conteneur écoute sur 3000
 * (Dockerfile PORT=3000 / EXPOSE 3000, containerPort 3000 en réseau awsvpc,
 * donc aucun remappage possible).
 */

const mockEcsSend = jest.fn();
const mockEc2Send = jest.fn();

jest.mock('@aws-sdk/client-ecs', () => ({
  ECSClient: jest.fn(() => ({ send: (...a: unknown[]) => mockEcsSend(...a) })),
  DescribeServicesCommand: jest.fn(() => ({ type: 'DescribeServices' })),
  UpdateServiceCommand: jest.fn(() => ({ type: 'UpdateService' })),
  ListTasksCommand: jest.fn(() => ({ type: 'ListTasks' })),
  DescribeTasksCommand: jest.fn(() => ({ type: 'DescribeTasks' })),
  waitUntilServicesStable: jest.fn(),
}));

jest.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: jest.fn(() => ({ send: (...a: unknown[]) => mockEc2Send(...a) })),
  DescribeNetworkInterfacesCommand: jest.fn(() => ({ type: 'DescribeNetworkInterfaces' })),
}));

const ENV_BASE = {
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  GMAPS_AWS_REGION: 'eu-west-3',
  GMAPS_AWS_CLUSTER: 'cluster',
  GMAPS_AWS_SERVICE: 'gmaps',
  GMAPS_API_TOKEN: 'gmaps-token',
  GMAPS_PORT: 3000,
  GMAPS_BASE_URL: undefined as string | undefined,
};

/** Recharge `gmaps-ip` avec l'environnement voulu (le cache de base est module-level). */
const chargerGmapsIp = async (env: Partial<typeof ENV_BASE> = {}) => {
  jest.resetModules();
  jest.doMock('@/env', () => ({ ...ENV_BASE, ...env }));
  return import('@/lib/aws/gmaps-ip');
};

describe('base URL du scraper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEcsSend.mockImplementation((cmd: { type: string }) => {
      if (cmd.type === 'ListTasks') return Promise.resolve({ taskArns: ['arn:task/1'] });
      if (cmd.type === 'DescribeTasks')
        return Promise.resolve({
          tasks: [
            { attachments: [{ details: [{ name: 'networkInterfaceId', value: 'eni-1' }] }] },
          ],
        });
      return Promise.resolve({});
    });
    mockEc2Send.mockResolvedValue({
      NetworkInterfaces: [{ Association: { PublicIp: '203.0.113.7' } }],
    });
  });

  it('cible le port du conteneur (3000 par défaut), pas le port 80', async () => {
    const { getCurrentIP } = await chargerGmapsIp();
    const base = await getCurrentIP();
    expect(base).toBe('http://203.0.113.7:3000');
    expect(new URL(base).port).toBe('3000');
    // Le piège d'origine : `new URL('/crawl', 'http://ip')` visait le port 80.
    expect(new URL('/crawl', base).toString()).toBe('http://203.0.113.7:3000/crawl');
  });

  it('respecte un port surchargé par GMAPS_PORT', async () => {
    const { getCurrentIP } = await chargerGmapsIp({ GMAPS_PORT: 8080 });
    await expect(getCurrentIP()).resolves.toBe('http://203.0.113.7:8080');
  });

  it('court-circuite la résolution ECS quand GMAPS_BASE_URL est renseignée', async () => {
    const { getCurrentIP } = await chargerGmapsIp({
      GMAPS_BASE_URL: 'https://scraper.exemple.fr',
    });
    await expect(getCurrentIP()).resolves.toBe('https://scraper.exemple.fr');
    expect(mockEcsSend).not.toHaveBeenCalled();
  });

  it('avertit une seule fois quand le scraper est joint en clair', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { getCurrentIP } = await chargerGmapsIp();
    await getCurrentIP();
    await getCurrentIP();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('en clair');
    warn.mockRestore();
  });

  it("n'avertit pas quand la base est en https", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { getCurrentIP } = await chargerGmapsIp({
      GMAPS_BASE_URL: 'https://scraper.exemple.fr',
    });
    await getCurrentIP();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
