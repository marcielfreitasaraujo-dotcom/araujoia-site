import { BUDGETS, DEADLINES, INTERESTS } from './config.mjs';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99
]);

export function cleanLine(value, max) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function normalizeEmail(raw) {
  const email = cleanLine(raw, 254).toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(email)) return null;
  const [local, domain] = email.split('@');
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (domain.startsWith('-') || domain.startsWith('.') || domain.includes('..') || domain.endsWith('.')) return null;
  return email;
}

export function normalizePhone(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0055')) digits = digits.slice(4);
  else if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  if (!DDDS.has(Number(ddd))) return null;
  if (number.length === 9 && number[0] !== '9') return null;
  if (number.length === 8 && !/[2-5]/.test(number[0])) return null;
  if (/^(\d)\1+$/.test(number)) return null;
  const display = number.length === 9
    ? `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`
    : `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  return { ddd, number, display, e164: `+55${digits}`, whatsapp: `55${digits}` };
}

export function validateLead(body) {
  const errors = {};
  const input = body && typeof body === 'object' ? body : {};

  const name = cleanLine(input.name, 120);
  const words = name.split(' ').filter((w) => /\p{L}/u.test(w));
  if (name.length < 5 || words.length < 2 || !/^[\p{L}\p{M}'’. -]+$/u.test(name)) {
    errors.name = 'Informe seu nome completo.';
  }

  const email = normalizeEmail(input.email);
  if (!email) errors.email = 'Informe um e-mail válido.';

  const phone = normalizePhone(typeof input.phone === 'string' ? input.phone : '');
  if (!phone) errors.phone = 'Informe um telefone válido com DDD.';

  const interestKey = typeof input.interest === 'string' ? input.interest : '';
  if (!Object.prototype.hasOwnProperty.call(INTERESTS, interestKey)) {
    errors.interest = 'Selecione o interesse principal.';
  }

  const message = cleanText(input.message, 2000);
  const company = cleanLine(input.company, 120);
  const currentSite = cleanLine(input.currentSite, 200);

  const optionalChoice = (raw, table, field) => {
    const key = typeof raw === 'string' ? raw : '';
    if (!key) return null;
    if (!Object.prototype.hasOwnProperty.call(table, key)) {
      errors[field] = 'Selecione uma das opções.';
      return null;
    }
    return { key, label: table[key] };
  };
  const deadline = optionalChoice(input.deadline, DEADLINES, 'deadline');
  const budget = optionalChoice(input.budget, BUDGETS, 'budget');

  if (input.consent !== true) {
    errors.consent = 'Para enviar, é necessário aceitar o Aviso de Privacidade.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      interest: { key: interestKey, label: INTERESTS[interestKey] },
      company,
      deadline,
      budget,
      currentSite,
      message
    }
  };
}
