import { pino } from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.app.logLevel,
  base: { app: env.app.name },
  ...(env.isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,app' },
        },
      }),
});

export type Logger = typeof logger;
