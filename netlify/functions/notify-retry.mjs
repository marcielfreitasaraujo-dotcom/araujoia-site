import { isEnabled } from '../lib/config.mjs';
import { listLeads, needsNotificationRetry, notifyLead, purgeExpired, stores } from '../lib/leads.mjs';

// Roda a cada 15 minutos: reenvia notificações pendentes/falhas (sem criar novos contatos),
// elimina contatos fora do prazo de guarda (padrão 365 dias) e limpa contadores de limite expirados.
export default async () => {
  if (!isEnabled()) return;
  const db = await stores();

  const leads = await listLeads(db);
  for (const lead of leads) {
    if (!needsNotificationRetry(lead)) continue;
    try {
      await notifyLead(db, lead);
    } catch {
      console.error(`[leads] retry_error id=${lead.id}`);
    }
  }

  const days = Number(process.env.RETENTION_DAYS) > 0 ? Number(process.env.RETENTION_DAYS) : 365;
  const removed = await purgeExpired(db, days);
  if (removed) console.log(`[leads] retention_purge removed=${removed}`);

  const now = Date.now();
  for (const key of await db.meta.keys('rl/')) {
    const item = await db.meta.get(key);
    if (!item || item.exp < now) await db.meta.delete(key);
  }
};

export const config = { schedule: '*/15 * * * *' };
