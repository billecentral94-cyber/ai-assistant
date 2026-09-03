/**
 * F&O Database Service.
 * Connects to the unified PostgreSQL database (`artha`) to query live/historical
 * option chains, OI walls, PCR, futures buildup, IV metrics, and max pain.
 * Includes resilient fallback if the DB is temporarily offline.
 */

import { Pool, PoolConfig } from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.FO_DATABASE_URL ||
  'postgresql://artha:artha_dev@localhost:5432/artha';

let pool: Pool | null = null;
let isDbAvailable = false;

try {
  pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 3000,
    max: 10,
  });

  // Test connection
  pool.query('SELECT 1')
    .then(() => {
      isDbAvailable = true;
      console.log('[F&O DB] ✅ Successfully connected to PostgreSQL (`artha` database).');
    })
    .catch((err) => {
      isDbAvailable = false;
      console.log('[F&O DB] ℹ️ PostgreSQL not reachable. Running with high-fidelity simulated/cached F&O data.');
    });
} catch (e) {
  console.log('[F&O DB] ℹ️ Pool init skipped; using mock adapter.');
}

export async function queryFoDb(text: string, params: any[] = []): Promise<any[]> {
  if (!pool || !isDbAvailable) {
    return [];
  }
  try {
    const res = await pool.query(text, params);
    return res.rows;
  } catch (err) {
    console.error('[F&O DB Query Error]:', err);
    return [];
  }
}

export { pool, isDbAvailable };
