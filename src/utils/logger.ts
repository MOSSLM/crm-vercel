// @ts-expect-error - The global `Deno` variable is only available in Deno runtimes
// and is intentionally checked here to support both Node and Deno.
const isProd =
  (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') ||
  (typeof Deno !== 'undefined' && Deno.env.get('NODE_ENV') === 'production');

const logger = {
  log: (...args: unknown[]) => {
    if (!isProd) {
      console.log(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (!isProd) {
      console.error(...args);
    }
  },
};

export default logger;
