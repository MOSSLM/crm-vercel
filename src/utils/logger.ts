declare const Deno: { env: { get(key: string): string | undefined } };

const isProd =
  (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') ||
  (typeof Deno !== 'undefined' && Deno.env.get('NODE_ENV') === 'production');

/**
 * `log` and `warn` are development aids and stay silent in production.
 *
 * `error` always emits. Silencing it in production is exactly backwards: on the
 * server these lines are what Vercel captures, and a swallowed error means an
 * incident with no trace. Anything routed through `logger.error` is expected to
 * be a genuine failure, so it must survive the production build.
 */
const logger = {
  log: (...args: unknown[]) => {
    if (!isProd) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (!isProd) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

export default logger;
