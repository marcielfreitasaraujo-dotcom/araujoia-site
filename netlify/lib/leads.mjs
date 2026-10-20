import { NOTIFICATION_MAX_ATTEMPTS, PRIVACY_VERSION, STATUSES, emailConfigured } from './config.mjs';
import { openStore } from './store.mjs';
import { newLeadId, sha256 } from './security.mjs';
import { sendNotification } from './email.mjs';

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export async function stores() {
  const [leads, meta] = await Promise.all([openStore('leads'), openStore('meta')]);
  return { leads, meta };
}

// Cria o lead de forma idempotente. Retorna { lead, duplicate }.
export async function createLead({ leads, meta }, value, { idempotencyKey, ipHash }) {
  const idemKey = idempotencyKey ? `idem/${sha256(idempotencyKey)}` : null;
  if (idemKey) {
    const seen = await meta.get(idemKey);
    if (seen) return { lead: { id: seen.id }, duplicate: true };
  }

  const dupeKey = `dupe/${sha256(`${value.email}|${value.phone.e164}`)}`;
  const dupe = await meta.get(dupeKey);
  if (dupe && Date.now() - dupe.at < DUPLICATE_WINDOW_MS) {
    return { lead: { id: dupe.id }, duplicate: true };
  }

  const now = new Date().toISOString();
  const lead = {
    id: newLeadId(),
    createdAt: now,
    name: value.name,
    email: value.email,
    phone: { display: value.phone.display, e164: value.phone.e164, whatsapp: value.phone.whatsapp },
    interest: value.interest,
    message: value.message,
    status: 'novo',
    history: [{ at: now, status: 'novo' }],
    consent: { given: true, at: now, privacyVersion: PRIVACY_VERSION },
    notification: { status: 'pending', attempts: 0, lastAttemptAt: null, sentAt: null, lastError: null },
    ipHash
  };

  await leads.set(`lead/${lead.id}`, lead);
  const marker = { id: lead.id, at: Date.now() };
  if (idemKey) await meta.set(idemKey, marker);
  await meta.set(dupeKey, marker);
  return { lead, duplicate: false };
}

export async function notifyLead({ leads }, lead) {
  const result = await sendNotification(lead);
  const attempts = (lead.notification?.attempts || 0) + (result.status === 'not_configured' ? 0 : 1);
  lead.notification = {
    status: result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'not_configured',
    attempts,
    lastAttemptAt: new Date().toISOString(),
    sentAt: result.status === 'sent' ? new Date().toISOString() : lead.notification?.sentAt || null,
    lastError: result.error || null
  };
  await leads.set(`lead/${lead.id}`, lead);
  if (result.status === 'failed') console.error(`[leads] notification_failed id=${lead.id} reason=${result.error}`);
  return lead.notification;
}

export async function getLead({ leads }, id) {
  if (!/^ld_[a-z0-9]{6,40}$/.test(id)) return null;
  return leads.get(`lead/${id}`);
}

export async function listLeads({ leads }, limit = 1000) {
  const keys = (await leads.keys('lead/')).slice(0, limit);
  const out = [];
  for (let i = 0; i < keys.length; i += 20) {
    const batch = await Promise.all(keys.slice(i, i + 20).map((k) => leads.get(k)));
    for (const item of batch) if (item) out.push(item);
  }
  return out;
}

export async function setStatus({ leads }, lead, status) {
  if (!STATUSES.includes(status)) return null;
  if (lead.status === status) return lead;
  lead.status = status;
  lead.history = [...(lead.history || []), { at: new Date().toISOString(), status }];
  await leads.set(`lead/${lead.id}`, lead);
  return lead;
}

// Exclusão definitiva (direito de eliminação / fim do prazo de guarda).
export async function deleteLead({ leads, meta }, lead) {
  await leads.delete(`lead/${lead.id}`);
  await meta.delete(`dupe/${sha256(`${lead.email}|${lead.phone.e164}`)}`);
}

export function lastActivity(lead) {
  const stamps = [lead.createdAt, ...(lead.history || []).map((h) => h.at)].map((s) => Date.parse(s)).filter(Number.isFinite);
  return Math.max(...stamps);
}

// Remove contatos sem atividade há mais de `days` dias (padrão: 365). Retorna quantos foram removidos.
export async function purgeExpired(db, days = 365) {
  const limit = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const lead of await listLeads(db)) {
    if (lastActivity(lead) < limit) {
      await deleteLead(db, lead);
      removed += 1;
    }
  }
  return removed;
}

export function needsNotificationRetry(lead) {
  const n = lead.notification;
  if (!n) return false;
  if (n.status === 'not_configured') return emailConfigured();
  if (n.status !== 'pending' && n.status !== 'failed') return false;
  if ((n.attempts || 0) >= NOTIFICATION_MAX_ATTEMPTS) return false;
  if (n.lastAttemptAt && Date.now() - Date.parse(n.lastAttemptAt) < 10 * 60 * 1000) return false;
  return true;
}
