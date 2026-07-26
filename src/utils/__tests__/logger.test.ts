/**
 * `logger` reads NODE_ENV at module load, so each case re-imports it inside an
 * isolated module registry with the env pinned.
 */
const loadLogger = (nodeEnv: string) => {
  let logger!: typeof import('../logger').default;
  jest.isolateModules(() => {
    const previous = process.env.NODE_ENV;
    // NODE_ENV is readonly in @types/node — assign through the record type.
    (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
    logger = require('../logger').default;
    (process.env as Record<string, string | undefined>).NODE_ENV = previous;
  });
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
    it('forwards log, warn and error', () => {
      const logger = loadLogger('development');
      logger.log('a');
      logger.warn('b');
      logger.error('c');
      expect(log).toHaveBeenCalledWith('a');
      expect(warn).toHaveBeenCalledWith('b');
      expect(error).toHaveBeenCalledWith('c');
    });
  });

  describe('in production', () => {
    it('silences log and warn', () => {
      const logger = loadLogger('production');
      logger.log('a');
      logger.warn('b');
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    // Regression guard: errors used to be swallowed in prod, which meant server
    // incidents left no trace in the platform logs.
    it('still emits errors, with every argument', () => {
      const logger = loadLogger('production');
      const cause = new Error('boom');
      logger.error('context:', cause);
      expect(error).toHaveBeenCalledWith('context:', cause);
    });
  });
});
