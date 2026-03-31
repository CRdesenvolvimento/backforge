import path from 'node:path';

const entryPoint = process.argv[1] ?? '';
const normalizedEntryPoint = path.normalize(entryPoint);

export const isCompiledRuntime = normalizedEntryPoint.includes(`${path.sep}dist${path.sep}server${path.sep}`)
  || normalizedEntryPoint.endsWith(`${path.sep}dist${path.sep}server.js`);
export const isSourceRuntime = normalizedEntryPoint.includes(`${path.sep}src${path.sep}server.ts`);
export const isDevelopmentRuntime = isSourceRuntime || process.env.NODE_ENV === 'development';
export const isProductionRuntime = isCompiledRuntime || (!isSourceRuntime && process.env.NODE_ENV === 'production');
