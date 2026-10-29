import { z } from 'zod';
export function config() {
  return z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    JWT_SECRET: z.string().min(32),
    CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    LOG_LEVEL: z.string().default('info'),
  }).parse(process.env);
}
