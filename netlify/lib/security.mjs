import crypto from 'node:crypto';
import { env } from './config.mjs';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function sign(payload, secret = env('FORM_SECRET')) {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify(token, secret = env('FORM_SECRET')) {
  if (typeof token !== 'string' || token.length > 600 || !secret) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(mac, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Pseudonimiza o IP (não guardamos o endereço bruto).
export function hashIp(ip) {
  return crypto.createHmac('sha256', env('FORM_SECRET') || 'dev').update(String(ip)).digest('hex').slice(0, 20);
}

export function newFormToken() {
  return sign({ t: Date.now(), n: crypto.randomBytes(8).toString('hex') });
}

// Token emitido pela página: precisa existir há pelo menos minAgeMs (robôs enviam instantaneamente).
export function checkFormToken(token, { minAgeMs = 3000, maxAgeMs = 6 * 60 * 60 * 1000 } = {}) {
  const data = verify(token);
  if (!data || typeof data.t !== 'number') return 'invalid';
  const age = Date.now() - data.t;
  if (age < minAgeMs) return 'too_fast';
  if (age > maxAgeMs) return 'expired';
  return 'ok';
}

export async function rateLimit(meta, scope, ipHash, limit, windowSec) {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl/${scope}/${ipHash}/${bucket}`;
  const current = (await meta.get(key)) || { c: 0 };
  if (current.c >= limit) return false;
  await meta.set(key, { c: current.c + 1, exp: (bucket + 2) * windowSec * 1000 });
  return true;
}

export function newLeadId() {
  return `ld_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

export const SESSION_COOKIE = 'aia_admin';
const SESSION_SECONDS = 8 * 60 * 60;

export function sessionCookie(req) {
  const token = sign({ role: 'admin', exp: Date.now() + SESSION_SECONDS * 1000 }, adminSecret());
  const secure = new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0`;
}

function adminSecret() {
  return `${env('FORM_SECRET')}:admin:${sha256(env('ADMIN_PASSWORD')).slice(0, 16)}`;
}

export function isAdmin(req) {
  const header = req.headers.get('cookie') || '';
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return false;
  const data = verify(match.slice(SESSION_COOKIE.length + 1), adminSecret());
  return Boolean(data && data.role === 'admin' && typeof data.exp === 'number' && data.exp > Date.now());
}
