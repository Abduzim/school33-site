// PostgreSQL storage for contact-form messages.
// Optional: without DATABASE_URL the site works exactly as before (email / log only).
import pg from 'pg';
import { env } from '@/lib/server';

let pool: pg.Pool | undefined;
let schemaReady: Promise<void> | undefined;

export const dbConfigured = () => Boolean(env('DATABASE_URL'));

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = env('DATABASE_URL')!;
    // Hosted databases (Neon, Render, Supabase…) require TLS; a local server usually does not.
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString) || !connectionString.includes('@');
    const ssl = env('DATABASE_SSL') ? env('DATABASE_SSL') === 'true' : !local;
    pool = new pg.Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: env('DATABASE_SSL_INSECURE') !== 'true' } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => console.error('[db] idle client error', err));
  }
  return pool;
}

/** Creates the table on first use. Never drops or alters existing data. */
function ensureSchema(): Promise<void> {
  schemaReady ??= getPool()
    .query(
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
    )
    .then(() => undefined)
    .catch((err) => {
      schemaReady = undefined; // retry on the next request
      throw err;
    });
  return schemaReady;
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
  await ensureSchema();
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO contact_messages (name, email, phone, subject, lang, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [m.name, m.email, m.phone || null, m.subject, m.lang, m.message],
  );
  return Number(rows[0].id);
}

/** Quick connectivity check for /api/health. */
export async function dbStatus(): Promise<'ok' | 'not_configured' | 'error'> {
  if (!dbConfigured()) return 'not_configured';
  try {
    await ensureSchema();
    await getPool().query('SELECT 1');
    return 'ok';
  } catch (err) {
    console.error('[db] health check failed', err);
    return 'error';
  }
}
