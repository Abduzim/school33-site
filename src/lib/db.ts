// PostgreSQL storage for contact-form messages.
// Optional: without DATABASE_URL the site works exactly as before (email / log only).
import pg from 'pg';
import { env } from '@/lib/server';

let pool: pg.Pool | undefined;
let schemaReady = false;

export const dbConfigured = () => Boolean(env('DATABASE_URL'));

// Cloudflare Workers cannot reuse a connection across requests, so there each query
// batch opens its own connection. On Node.js a small shared pool is used.
const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

function connectionConfig(): pg.ClientConfig {
  const connectionString = env('DATABASE_URL')!;
  // Hosted databases (Neon, Render, Supabase…) require TLS; a local server usually does not.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString) || !connectionString.includes('@');
  const ssl = env('DATABASE_SSL') ? env('DATABASE_SSL') === 'true' : !local;
  return {
    connectionString,
    ssl: ssl ? { rejectUnauthorized: env('DATABASE_SSL_INSECURE') !== 'true' } : undefined,
    connectionTimeoutMillis: 10_000,
  };
}

async function withClient<T>(fn: (q: pg.ClientBase) => Promise<T>): Promise<T> {
  if (onWorkers) {
    const client = new pg.Client(connectionConfig());
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (!pool) {
    pool = new pg.Pool({ ...connectionConfig(), max: 5, idleTimeoutMillis: 30_000 });
    pool.on('error', (err) => console.error('[db] idle client error', err));
  }
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Creates the table on first use. Never drops or alters existing data. */
async function ensureSchema(q: pg.ClientBase): Promise<void> {
  if (schemaReady) return;
  await q.query(
      `CREATE TABLE IF NOT EXISTS contact_messages (
         id          BIGSERIAL PRIMARY KEY,
         created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
         name        TEXT NOT NULL,
         email       TEXT NOT NULL,
         phone       TEXT,
         subject     TEXT NOT NULL,
         lang        TEXT NOT NULL,
         message     TEXT NOT NULL
       );
       CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx ON contact_messages (created_at DESC);`,
  );
  schemaReady = true;
}

export interface ContactMessage {
  name: string;
  email: string;
  phone: string;
  subject: string;
  lang: string;
  message: string;
}

export async function saveContactMessage(m: ContactMessage): Promise<number> {
  return withClient(async (q) => {
    await ensureSchema(q);
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO contact_messages (name, email, phone, subject, lang, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [m.name, m.email, m.phone || null, m.subject, m.lang, m.message],
    );
    return Number(rows[0].id);
  });
}

/** Quick connectivity check for /api/health. */
export async function dbStatus(): Promise<'ok' | 'not_configured' | 'error'> {
  if (!dbConfigured()) return 'not_configured';
  try {
    await withClient(async (q) => {
      await ensureSchema(q);
      await q.query('SELECT 1');
    });
    return 'ok';
  } catch (err) {
    console.error('[db] health check failed', err);
    return 'error';
  }
}
