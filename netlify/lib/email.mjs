import { env, emailConfigured } from './config.mjs';

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatDate(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(iso));
}

export function buildEmail(lead) {
  const when = formatDate(lead.createdAt);
  const waLink = `https://wa.me/${lead.phone.whatsapp}`;
  const rows = [
    ['Nome', lead.name],
    ['E-mail', lead.email],
    ['Telefone', lead.phone.display],
    ['WhatsApp', waLink],
    ['Interesse', lead.interest.label],
    ...(lead.company ? [['Empresa', lead.company]] : []),
    ...(lead.deadline ? [['Prazo desejado', lead.deadline.label]] : []),
    ...(lead.budget ? [['Faixa de investimento', lead.budget.label]] : []),
    ...(lead.currentSite ? [['Site atual', lead.currentSite]] : []),
    ['Mensagem', lead.message || '—'],
    ['Data do contato', when],
    ['ID do registro', lead.id]
  ];
  const text = ['NOVO POTENCIAL CLIENTE', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px">` +
    `<h2 style="margin:0 0 14px">Novo potencial cliente</h2>` +
    `<table style="border-collapse:collapse;width:100%">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td>` +
          `<td style="padding:6px 0;white-space:pre-wrap">${
            k === 'WhatsApp' ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v)
          }</td></tr>`
      )
      .join('') +
    `</table></div>`;
  return { subject: 'Novo potencial cliente — formulário do site', text, html };
}

// Resultado: { status: 'sent' | 'failed' | 'not_configured', error?: string }
export async function sendNotification(lead, { timeoutMs = 8000 } = {}) {
  if (!emailConfigured()) return { status: 'not_configured' };
  const { subject, text, html } = buildEmail(lead);
  const url = env('RESEND_API_URL') || 'https://api.resend.com/emails';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `lead-${lead.id}`
      },
      body: JSON.stringify({
        from: env('NOTIFY_FROM') || 'Araujo.IA <onboarding@resend.dev>',
        to: [env('NOTIFY_EMAIL')],
        reply_to: lead.email,
        subject,
        text,
        html
      })
    });
    if (!res.ok) return { status: 'failed', error: `http_${res.status}` };
    return { status: 'sent' };
  } catch (err) {
    return { status: 'failed', error: err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
