import { env, formsEnabled } from './config.mjs';
import { formatDate } from './email.mjs';

export const NETLIFY_FORM_NAME = 'orcamento';

// Campos do envio ao Netlify Forms. Os nomes aparecem como rótulos no e-mail de aviso do Netlify.
export function buildFormFields(lead) {
  const fields = {
    'form-name': NETLIFY_FORM_NAME,
    nome: lead.name,
    email: lead.email,
    telefone: lead.phone.display,
    whatsapp: `https://wa.me/${lead.phone.whatsapp}`,
    interesse: lead.interest.label,
    empresa: lead.company || '',
    prazo: lead.deadline ? lead.deadline.label : '',
    investimento: lead.budget ? lead.budget.label : '',
    site_atual: lead.currentSite || '',
    mensagem: lead.message || '',
    data_do_contato: formatDate(lead.createdAt),
    id_do_registro: lead.id
  };
  return fields;
}

// Resultado: { status: 'sent' | 'failed' | 'skipped', error?: string }
// O Netlify captura envios POST feitos ao próprio site para o formulário declarado no HTML (name="orcamento").
export async function forwardToNetlifyForms(lead, { timeoutMs = 8000 } = {}) {
  if (!formsEnabled()) return { status: 'skipped' };
  let url = env('FORMS_SUBMIT_URL');
  if (!url) {
    if (!lead.origin || !lead.origin.startsWith('https://')) return { status: 'skipped' };
    url = new URL('/', lead.origin).href;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AraujoIA-Site/1.0' },
      body: new URLSearchParams(buildFormFields(lead)).toString()
    });
    if (res.status >= 400) return { status: 'failed', error: `http_${res.status}` };
    return { status: 'sent' };
  } catch (err) {
    return { status: 'failed', error: err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
