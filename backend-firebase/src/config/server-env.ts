import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const serverEnvPath = resolve(process.cwd(), '.env.server');
if (existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
}
