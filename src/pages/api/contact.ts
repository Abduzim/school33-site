import type { APIRoute } from 'astro';
import type { Transporter } from 'nodemailer';
import { defaultLocale, isLocale } from '@/i18n/ui';
import { dbConfigured, saveContactMessage } from '@/lib/db';
import { clientIp, env, isSameOrigin, json, rateLimiter } from '@/lib/server';

export const prerender = false;

const allow = rateLimiter(5, 10 * 60 * 1000); // 5 messages per 10 minutes per IP
const SUBJECTS = new Set(['general', 'admissions', 'employment', 'other']);
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

let transporter: Transporter | undefined;
// nodemailer is loaded only when SMTP is configured (it does not run on Cloudflare Workers).
async function getTransport() {
  if (!env('SMTP_HOST')) return undefined;
  const { default: nodemailer } = await import('nodemailer');
  transporter ??= nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT') ?? 587),
    secure: env('SMTP_SECURE') === 'true',
    auth: env('SMTP_USER') ? { user: env('SMTP_USER')!, pass: env('SMTP_PASS') ?? '' } : undefined,
  });
  return transporter;
}

const field = (form: FormData, name: string, max: number) =>
  String(form.get(name) ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);

export const POST: APIRoute = async ({ request, clientAddress, redirect }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const fail = (status: number, error: string, lang: string = defaultLocale) =>
    wantsJson ? json({ ok: false, error }, status) : redirect(`/${lang}/contact/?error=${encodeURIComponent(error)}`, 303);

  if (!isSameOrigin(request)) return fail(403, 'forbidden');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'invalid');
  }

  const langRaw = field(form, 'lang', 5);
  const lang = isLocale(langRaw) ? langRaw : defaultLocale;

  // Bots fill the hidden field; pretend success so they don't retry.
  if (field(form, 'website', 200)) {
    return wantsJson ? json({ ok: true }) : redirect(`/${lang}/contact/thanks/`, 303);
  }

  if (!allow(clientIp(request, clientAddress))) return fail(429, 'rate_limited', lang);

  const name = field(form, 'name', 120).replace(/\n/g, ' ');
  const email = field(form, 'email', 200);
  const phone = field(form, 'phone', 40).replace(/\n/g, ' ');
  const subjectKey = field(form, 'subject', 20);
  const subject = SUBJECTS.has(subjectKey) ? subjectKey : 'general';
  const message = field(form, 'message', 5000);
  const consent = field(form, 'consent', 5) === 'yes';

  if (name.length < 2 || !EMAIL_RE.test(email) || message.length < 10 || !consent) {
    return fail(422, 'validation', lang);
  }

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || '-'}`,
    `Topic: ${subject}`,
    `Language: ${lang}`,
    '',
    message,
  ].join('\n');

  // The message is delivered if at least one configured channel (database, email) succeeds.
  let delivered = false;
  let attempted = false;

  if (dbConfigured()) {
    attempted = true;
    try {
      await saveContactMessage({ name, email, phone, subject, lang, message });
      delivered = true;
    } catch (err) {
      console.error('[contact] failed to save message to the database', err);
    }
  }

  const transport = await getTransport();
  if (transport) {
    attempted = true;
    try {
      await transport.sendMail({
        from: env('CONTACT_FROM') ?? env('SMTP_USER'),
        to: env('CONTACT_TO') ?? env('SMTP_USER'),
        replyTo: { name, address: email },
        subject: `[Website] ${subject}: ${name}`,
        text,
      });
      delivered = true;
    } catch (err) {
      console.error('[contact] failed to send email', err);
    }
  }

  if (!attempted) {
    // Neither database nor SMTP configured (e.g. local development): log the message instead.
    console.info('[contact] no database or SMTP configured, message received:\n' + text);
  } else if (!delivered) {
    return fail(502, 'send_failed', lang);
  }

  return wantsJson ? json({ ok: true }) : redirect(`/${lang}/contact/thanks/`, 303);
};
