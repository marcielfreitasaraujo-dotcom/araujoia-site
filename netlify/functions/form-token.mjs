import { isEnabled } from '../lib/config.mjs';
import { json, originAllowed } from '../lib/http.mjs';
import { getSecret, newFormToken } from '../lib/security.mjs';
import { stores } from '../lib/leads.mjs';

// A página consulta este endpoint: se o formulário não estiver habilitado, a seção
// permanece oculta (nenhum dado é coletado sem que o proprietário consiga recebê-lo).
export default async (req) => {
  if (req.method !== 'GET') return json({ ok: false }, 405, { Allow: 'GET' });
  if (!originAllowed(req)) return json({ ok: false }, 403);
  if (!isEnabled()) return json({ ok: false, reason: 'disabled' }, 200);
  try {
    const { meta } = await stores();
    return json({ ok: true, token: newFormToken(await getSecret(meta)) });
  } catch {
    console.error('[leads] token_error');
    return json({ ok: false, reason: 'unavailable' }, 200);
  }
};

export const config = { path: '/api/form-token' };
