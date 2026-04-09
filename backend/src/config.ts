import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('*'),
});

const parsed = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
});

export const appConfig = {
  databaseUrl: parsed.DATABASE_URL,
  port: parsed.PORT,
  corsOrigin:
    parsed.CORS_ORIGIN === '*'
      ? true
      : parsed.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean),
};
