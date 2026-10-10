import type { Pool } from 'pg';

// Runtime credentials only need to read/write data. Schema changes belong to db:deploy.
const requiredTables = ['users', 'auth_sessions', 'invites', 'settings', 'login_attempts',
  'stored_files', 'categories', 'branches', 'locations', 'asset_groups', 'imports',
  'source_rows', 'assets', 'operations', 'audit', 'requests', 'approvals', 'stocktakes', 'stocktake_items',
  'repair_records'];

export async function ensureDatabaseReady(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM unnest($1::text[]) AS name
     WHERE to_regclass(format('public.%I', name)) IS NULL`, [requiredTables]);
  if (rows.length) throw new Error('Database schema is incomplete; run npm run db:deploy before starting the application');
}
