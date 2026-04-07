const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-forwarded-for',
]);
const SENSITIVE_LOG_FIELD_NAMES = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'clientsecret',
  'cookie',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'sessiontoken',
  'setcookie',
  'signature',
  'token',
]);

interface LoggingSanitizationOptions {
  depthLimit?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
}

const defaultLoggingOptions: Required<LoggingSanitizationOptions> = {
  depthLimit: 6,
  maxArrayItems: 50,
  maxObjectKeys: 50,
  maxStringLength: 4000,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function truncateString(value: string, maxStringLength: number) {
  if (value.length <= maxStringLength) {
    return value;
  }

  return `${value.slice(0, maxStringLength)}...[truncated]`;
}

function normalizeKeyName(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitiveLogField(key: string) {
  const normalizedKey = normalizeKeyName(key);

  if (!normalizedKey) {
    return false;
  }

  if (SENSITIVE_LOG_FIELD_NAMES.has(normalizedKey)) {
    return true;
  }

  return normalizedKey.endsWith('token')
    || normalizedKey.endsWith('secret')
    || normalizedKey.endsWith('password')
    || normalizedKey.endsWith('apikey')
    || normalizedKey.endsWith('cookie');
}

function sanitizeObject(
  value: Record<string, unknown>,
  sanitizer: (entry: unknown, depth: number) => unknown,
  depth: number,
  maxObjectKeys?: number
) {
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value).filter(([key]) => !DANGEROUS_KEYS.has(key));
  const limitedEntries = typeof maxObjectKeys === 'number' ? entries.slice(0, maxObjectKeys) : entries;

  for (const [key, entryValue] of limitedEntries) {
    result[key] = sanitizer(entryValue, depth + 1);
  }

  if (typeof maxObjectKeys === 'number' && entries.length > maxObjectKeys) {
    result._truncatedKeys = entries.length - maxObjectKeys;
  }

  return result;
}

function sanitizeInputValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeInputValue(entry, depth + 1));
  }

  if (isPlainObject(value)) {
    return sanitizeObject(value, sanitizeInputValue, depth);
  }

  return value;
}

function sanitizeLoggingObject(
  value: Record<string, unknown>,
  depth: number,
  options: Required<LoggingSanitizationOptions>
) {
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value).filter(([key]) => !DANGEROUS_KEYS.has(key));
  const limitedEntries = entries.slice(0, options.maxObjectKeys);

  for (const [key, entryValue] of limitedEntries) {
    if (isSensitiveLogField(key)) {
      result[key] = '[redacted]';
      continue;
    }

    result[key] = sanitizeLoggingValueInternal(entryValue, depth + 1, options);
  }

  if (entries.length > options.maxObjectKeys) {
    result._truncatedKeys = entries.length - options.maxObjectKeys;
  }

  return result;
}

function sanitizeLoggingValueInternal(
  value: unknown,
  depth: number,
  options: Required<LoggingSanitizationOptions>
): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (depth >= options.depthLimit) {
    return '[depth-limited]';
  }

  if (typeof value === 'string') {
    return truncateString(value, options.maxStringLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `[binary:${value.byteLength} bytes]`;
  }

  if (Array.isArray(value)) {
    const limitedItems = value.slice(0, options.maxArrayItems).map((entry) =>
      sanitizeLoggingValueInternal(entry, depth + 1, options)
    );

    if (value.length > options.maxArrayItems) {
      limitedItems.push(`[+${value.length - options.maxArrayItems} more items]`);
    }

    return limitedItems;
  }

  if (isPlainObject(value)) {
    return sanitizeLoggingObject(value, depth, options);
  }

  return truncateString(String(value), options.maxStringLength);
}

export function sanitizeInput<T>(value: T): T {
  return sanitizeInputValue(value, 0) as T;
}

export function sanitizeForLogging(value: unknown, options: LoggingSanitizationOptions = {}) {
  return sanitizeLoggingValueInternal(value, 0, {
    ...defaultLoggingOptions,
    ...options,
  });
}

export function sanitizeHeadersForLogging(headers: Record<string, unknown>) {
  const sanitizedHeaders: Record<string, unknown> = {};

  for (const [rawHeaderName, rawValue] of Object.entries(headers)) {
    const headerName = rawHeaderName.toLowerCase();

    if (DANGEROUS_KEYS.has(headerName)) {
      continue;
    }

    if (SENSITIVE_HEADERS.has(headerName)) {
      sanitizedHeaders[headerName] = '[redacted]';
      continue;
    }

    sanitizedHeaders[headerName] = sanitizeForLogging(rawValue, {
      depthLimit: 2,
      maxArrayItems: 10,
      maxObjectKeys: 10,
      maxStringLength: 512,
    });
  }

  return sanitizedHeaders;
}

export function parsePayloadForLogging(payload: unknown) {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (Buffer.isBuffer(payload)) {
    return `[binary:${payload.byteLength} bytes]`;
  }

  if (typeof payload === 'string') {
    try {
      return sanitizeForLogging(JSON.parse(payload));
    } catch {
      return sanitizeForLogging(payload);
    }
  }

  return sanitizeForLogging(payload);
}
