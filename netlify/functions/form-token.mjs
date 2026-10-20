import { isEnabled } from '../lib/config.mjs';
import { json, originAllowed } from '../lib/http.mjs';
import { newFormToken } from '../lib/security.mjs';

// A página consulta este endpoint: se o formulário não estiver configurado, a seção
// permanece oculta (nenhum dado é coletado sem que o proprietário consiga lê-lo).
export default async (req) => {
  if (req.method !== 'GET') return json({ ok: false }, 405, { Allow: 'GET' });
  if (!originAllowed(req)) return json({ ok: false }, 403);
  if (!isEnabled()) return json({ ok: false, reason: 'disabled' }, 200);
  return json({ ok: true, token: newFormToken() });
};

export const config = { path: '/api/form-token' };
