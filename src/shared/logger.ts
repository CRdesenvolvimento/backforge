import winston from 'winston';
import path from 'node:path';
import { isProductionRuntime } from './runtime.js';

const isProduction = process.env.NODE_ENV === 'production' || isProductionRuntime;

function detectProcessType() {
  if (process.env.PROCESS_TYPE) {
    return process.env.PROCESS_TYPE;
  }

  const entryPoint = process.argv[1] ?? '';

  if (entryPoint.includes(`${path.sep}queues${path.sep}worker`)) {
    return 'queue-worker';
  }

  return 'api';
}

function buildConsoleFormat() {
  if (isProduction) {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );
  }

  return winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const serializedMeta = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} ${level}: ${message}${serializedMeta}`;
    })
  );
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  defaultMeta: {
    service: 'backforge',
    processType: detectProcessType(),
  },
  transports: [
    new winston.transports.Console({
      format: buildConsoleFormat(),
    }),
  ],
});
