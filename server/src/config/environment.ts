import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function validateEnvironment() {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!process.env[key]?.trim()) throw new Error(`FATAL: Missing required env variable: ${key}`);
  }
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[key]!;
    if (value.length < 32 || new Set(value).size < 12 || /change|example|placeholder/i.test(value)) {
      throw new Error(`FATAL: ${key} must be a strong random secret of at least 32 characters`);
    }
  }
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) throw new Error('FATAL: JWT secrets must differ');
  if (process.env.CLIENT_URL) {
    const origin = new URL(process.env.CLIENT_URL);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== process.env.CLIENT_URL) {
      throw new Error('FATAL: CLIENT_URL must be a specific HTTP origin');
    }
  }
}

export function bootstrapPassword(key: string) {
  const value = process.env[key];
  if (!value || value.length < 16 || Buffer.byteLength(value) > 72) throw new Error(`FATAL: ${key} must contain at least 16 characters and at most 72 bytes for initial user creation`);
  return value;
}
