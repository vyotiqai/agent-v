import { optional } from './config.ts';
import { createLogger, type Logger, type ProcessName } from './log.ts';

/**
 * What every server process shares: its logger, a crash that is logged (by kind and frames, never
 * by message) before the process exits, and an orderly stop when Cloud Run sends SIGTERM, which
 * gives a process 10 seconds before it is killed.
 */
export function startProcess(
  name: ProcessName,
  env: Record<string, string | undefined> = process.env,
): { logger: Logger; onStop: (stop: () => Promise<void>) => void } {
  const project = optional(env, 'GOOGLE_CLOUD_PROJECT');
  const logger = createLogger(project ? { project } : {});
  const crash = (err: unknown): void => {
    logger.error('process.crash', 'internal', err, { process: name });
    process.exit(1);
  };
  process.on('uncaughtException', crash);
  process.on('unhandledRejection', crash);
  logger.log('process.start', { process: name });

  const stops: (() => Promise<void>)[] = [];
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 8_000);
    deadline.unref();
    for (const s of stops) await s();
    logger.log('process.stop', { process: name });
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
  return { logger, onStop: (s) => stops.push(s) };
}
