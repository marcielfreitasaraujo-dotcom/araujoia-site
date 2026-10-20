export const INTERESTS = {
  sites: 'Desenvolvimento de sites',
  sistemas: 'Sistemas e aplicações web',
  automacao: 'Automação de processos',
  software: 'Desenvolvimento de software',
  outro: 'Outro serviço'
};

export const DEADLINES = {
  urgente: 'O mais rápido possível',
  um_mes: 'Em até 1 mês',
  tres_meses: 'De 1 a 3 meses',
  sem_pressa: 'Sem pressa, ainda estou definindo'
};

export const BUDGETS = {
  ate_1500: 'Até R$ 1.500',
  de_1500_a_5000: 'De R$ 1.500 a R$ 5.000',
  de_5000_a_15000: 'De R$ 5.000 a R$ 15.000',
  acima_15000: 'Acima de R$ 15.000',
  conversar: 'Prefiro conversar sobre valores'
};

export const STATUSES =['novo', 'em_atendimento', 'contatado', 'concluido'];

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
