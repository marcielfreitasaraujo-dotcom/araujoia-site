export const INTERESTS = {
  sites: 'Desenvolvimento de sites',
  sistemas: 'Sistemas e aplicações web',
  automacao: 'Automação de processos',
  software: 'Desenvolvimento de software',
  outro: 'Outro serviço'
};

export const STATUSES = ['novo', 'em_atendimento', 'contatado', 'concluido'];

export const PRIVACY_VERSION = '2026-10-20';

export const NOTIFICATION_MAX_ATTEMPTS = 5;

export function env(name) {
  return process.env[name] || '';
}

// O formulário só é aberto ao público quando o proprietário consegue ler os leads
// (senha do painel) e a proteção anti-bot está ativa (segredo de assinatura).
export function isEnabled() {
  return Boolean(env('ADMIN_PASSWORD') && env('FORM_SECRET'));
}

export function emailConfigured() {
  return Boolean(env('RESEND_API_KEY') && env('NOTIFY_EMAIL'));
}
