import type { APIRoute } from 'astro';
import { dbStatus } from '@/lib/db';
import { json } from '@/lib/server';

// Health check for the hosting platform and for quick manual checks.
export const prerender = false;

export const GET: APIRoute = async () => {
  const db = await dbStatus();
  return json({ ok: db !== 'error', db }, db === 'error' ? 503 : 200);
};
