import { isEnabled } from '../lib/config.mjs';
import { HttpError, clientIp, json, originAllowed, readJson } from '../lib/http.mjs';
import { checkFormToken, hashIp, rateLimit } from '../lib/security.mjs';
import { validateLead } from '../lib/validate.mjs';
import { createLead, notifyLead, stores } from '../lib/leads.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  if (!originAllowed(req)) return json({ ok: false, error: 'forbidden' }, 403);
  if (!isEnabled()) return json({ ok: false, error: 'unavailable' }, 503);

  try {
    const body = await readJson(req);
    const ipHash = hashIp(clientIp(req, context));
    const db = await stores();

    // Limite por IP: 8 tentativas a cada 10 minutos e 30 por dia.
    const allowed =
      (await rateLimit(db.meta, 'lead10m', ipHash, 8, 600)) &&
      (await rateLimit(db.meta, 'lead1d', ipHash, 30, 86400));
    if (!allowed) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '600' });

    // Honeypot: campo invisível preenchido apenas por robôs. Respondemos como se tivesse dado certo.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return json({ ok: true }, 201);
    }

    const tokenState = checkFormToken(body.token);
    if (tokenState !== 'ok') return json({ ok: false, error: 'token', reason: tokenState }, 400);

    const checked = validateLead(body);
    if (!checked.ok) return json({ ok: false, error: 'validation', errors: checked.errors }, 422);

    const key = typeof body.key === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(body.key) ? body.key : null;
    const { lead, duplicate } = await createLead(db, checked.value, { idempotencyKey: key, ipHash });
    if (duplicate) return json({ ok: true, id: lead.id, duplicate: true }, 200);

    // O cadastro já está salvo. Falha no e-mail não invalida o cadastro: fica registrada para reenvio.
    try {
      await notifyLead(db, lead);
    } catch (err) {
      console.error(`[leads] notify_error id=${lead.id}`);
    }
    return json({ ok: true, id: lead.id }, 201);
  } catch (err) {
    if (err instanceof HttpError) return json({ ok: false, error: err.code }, err.status);
    console.error(`[leads] save_error ${err?.name || 'Error'}`);
    return json({ ok: false, error: 'server_error' }, 500);
  }
};

export const config = { path: '/api/lead' };
