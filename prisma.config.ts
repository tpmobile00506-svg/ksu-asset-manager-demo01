import { defineConfig } from 'prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: './backend/prisma/schema.prisma',
  migrations: { path: './backend/prisma/migrations', seed: 'tsx backend/prisma/seed.ts' },
  datasource: {
    url: process.env.DATABASE_URL || '',
  },
});
