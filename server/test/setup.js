import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const local = resolve(import.meta.dirname, '../.env');
try { process.loadEnvFile(local); } catch { /* CI supplies its environment. */ }
if (!process.env.TEST_DATABASE_URL?.includes('supportdesk_test')) throw new Error('Set TEST_DATABASE_URL to the isolated supportdesk_test database.');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
