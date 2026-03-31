import crypto from 'node:crypto';

export function generateApiKey() {
  return `bf_${crypto.randomBytes(32).toString('hex')}`;
}
