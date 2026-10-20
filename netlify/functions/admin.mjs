import { anyNotificationChannel, env, STATUSES } from '../lib/config.mjs';
import { HttpError, clientIp, json, originAllowed, readJson } from '../lib/http.mjs';
import { clearSessionCookie, getSecret, hashIp, isAdmin, rateLimit, safeEqual, sessionCookie } from '../lib/security.mjs';
import { deleteLead, getLead, listLeads, notifyLead, setStatus, stores } from '../lib/leads.mjs';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default async (req, context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  const parts = route.split('/').filter(Boolean);

  try {
    if (!env('ADMIN_PASSWORD')) return json({ ok: false, error: 'unavailable' }, 503);
    if (req.method !== 'GET' && !originAllowed(req)) return json({ ok: false, error: 'forbidden' }, 403);

    const db = await stores();
    const secret = await getSecret(db.meta);

    if (route === 'login' && req.method === 'POST') {
      const ipHash = hashIp(clientIp(req, context), secret);
      if (!(await rateLimit(db.meta, 'login', ipHash, 8, 900))) {
        return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '900' });
      }
      const body = await readJson(req, 2000);
      const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
      if (!password || !safeEqual(password, env('ADMIN_PASSWORD'))) {
        return json({ ok: false, error: 'invalid_credentials' }, 401);
      }
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, secret) });
    }

    if (route === 'logout' && req.method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }

    if (!isAdmin(req, secret)) return json({ ok: false, error: 'unauthorized' }, 401);

    if (route === 'session' && req.method === 'GET') {
      return json({ ok: true, emailConfigured: anyNotificationChannel(), statuses: STATUSES });
    }

    if (route === 'leads' && req.method === 'GET') {
      const q = fold(url.searchParams.get('q')).trim();
      const status = url.searchParams.get('status') || '';
      const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
      let items = await listLeads(db);
      if (STATUSES.includes(status)) items = items.filter((l) => l.status === status);
      if (q) {
        const digits = q.replace(/\D/g, '');
        items = items.filter(
          (l) =>
            fold(l.name).includes(q) ||
            fold(l.email).includes(q) ||
            (digits.length >= 4 && l.phone.e164.includes(digits))
        );
      }
      items.sort((a, b) => (order === 'asc' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
      return json({ ok: true, total: items.length, leads: items });
    }

    if (parts[0] === 'leads' && parts[1]) {
      const lead = await getLead(db, parts[1]);
      if (!lead) return json({ ok: false, error: 'not_found' }, 404);

      if (parts.length === 2 && req.method === 'PATCH') {
        const body = await readJson(req, 1000);
        const updated = await setStatus(db, lead, body.status);
        if (!updated) return json({ ok: false, error: 'invalid_status' }, 422);
        return json({ ok: true, lead: updated });
      }

      if (parts.length === 2 && req.method === 'DELETE') {
        await deleteLead(db, lead);
        return json({ ok: true });
      }

      if (parts.length === 3 && parts[2] === 'notify' && req.method === 'POST') {
        const notification = await notifyLead(db, lead);
        return json({ ok: true, notification });
      }
    }

    return json({ ok: false, error: 'not_found' }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ ok: false, error: err.code }, err.status);
    console.error(`[admin] error ${err?.name || 'Error'}`);
    return json({ ok: false, error: 'server_error' }, 500);
  }
};

export const config = { path: '/api/admin/*' };
