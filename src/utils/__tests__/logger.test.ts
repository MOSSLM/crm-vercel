/**
 * `logger` reads NODE_ENV at module load, so each case re-imports it inside an
 * isolated module registry with the env pinned.
 */
const loadLogger = async (nodeEnv: string) => {
  let logger!: typeof import('../logger').default;
  // NODE_ENV is readonly in @types/node — assign through the record type.
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = nodeEnv;
  try {
    await jest.isolateModulesAsync(async () => {
      logger = (await import('../logger')).default;
    });
  } finally {
    env.NODE_ENV = previous;
  }
  return logger;
};

describe('logger', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('outside production', () => {
    it('forwards log, warn and error', async () => {
      const logger = await loadLogger('development');
      logger.log('a');
      logger.warn('b');
      logger.error('c');
      expect(log).toHaveBeenCalledWith('a');
      expect(warn).toHaveBeenCalledWith('b');
      expect(error).toHaveBeenCalledWith('c');
    });
  });

  describe('in production', () => {
    it('silences log and warn', async () => {
      const logger = await loadLogger('production');
      logger.log('a');
      logger.warn('b');
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    // Regression guard: errors used to be swallowed in prod, which meant server
    // incidents left no trace in the platform logs.
    it('still emits errors, with every argument', async () => {
      const logger = await loadLogger('production');
      const cause = new Error('boom');
      logger.error('context:', cause);
      expect(error).toHaveBeenCalledWith('context:', cause);
    });
  });
});
