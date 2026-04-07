import { isCompiledRuntime } from './runtime.js';

const VALID_NODE_ENVS = new Set(['development', 'test', 'production']);
const DISALLOWED_SECRET_SNIPPETS = ['change-me', 'super-secret', 'replace-me', 'example-secret'];

function readEnv(name: string) {
  return process.env[name]?.trim() ?? '';
}

function readRequiredEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function assertStrongSecret(name: string, value: string) {
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters long`);
  }

  const normalizedValue = value.toLowerCase();

  if (DISALLOWED_SECRET_SNIPPETS.some((snippet) => normalizedValue.includes(snippet))) {
    throw new Error(`${name} must not use a placeholder or default value`);
  }
}

let hasValidatedRuntimeEnvironment = false;

export function getNodeEnv() {
  const nodeEnv = readRequiredEnv('NODE_ENV');

  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    throw new Error('NODE_ENV must be one of: development, test, production');
  }

  return nodeEnv as 'development' | 'test' | 'production';
}

export function isProductionEnvironment() {
  return getNodeEnv() === 'production';
}

export function getJwtSecret() {
  const jwtSecret = readRequiredEnv('JWT_SECRET');
  assertStrongSecret('JWT_SECRET', jwtSecret);
  return jwtSecret;
}

export function validateRuntimeEnvironment() {
  if (hasValidatedRuntimeEnvironment) {
    return;
  }

  if (!process.env.NODE_ENV) {
    throw new Error("NODE_ENV is required");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }

  const nodeEnv = getNodeEnv();
  getJwtSecret();
  readRequiredEnv('DATABASE_URL');

  if (nodeEnv === 'production') {
    const dbUrl = readEnv('DATABASE_URL');
    const redisUrl = readEnv('REDIS_URL');

    if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
      throw new Error('DATABASE_URL cannot use localhost in production');
    }

    if (redisUrl && (redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1'))) {
      throw new Error('REDIS_URL cannot use localhost in production');
    }

    if (!readEnv('CORS_ORIGIN')) {
      throw new Error('CORS_ORIGIN is required in production');
    }
  }

  if (isCompiledRuntime && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be "production" when running the compiled server');
  }

  hasValidatedRuntimeEnvironment = true;
}
