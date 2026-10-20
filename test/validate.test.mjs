import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, normalizePhone, validateLead } from '../netlify/lib/validate.mjs';

test('telefone brasileiro: aceita com e sem pontuação, com e sem +55', () => {
  for (const raw of ['(99) 98765-4321', '99987654321', '99 98765 4321', '+55 99 98765-4321', '5599987654321', '0055 99 98765-4321']) {
    const p = normalizePhone(raw);
    assert.ok(p, raw);
    assert.equal(p.e164, '+5599987654321');
    assert.equal(p.whatsapp, '5599987654321');
    assert.equal(p.display, '(99) 98765-4321');
  }
  assert.equal(normalizePhone('(11) 3333-4444').display, '(11) 3333-4444');
});

test('telefone brasileiro: rejeita formatos inválidos', () => {
  for (const raw of ['', '123', '(99) 99999-9999', '(00) 99999-9999', '(10) 99999-9999', '(11) 88888-8888', '(11) 99999-999', '(11) 11111-1111', 'abc', '99999999999999999', '(11) 6333-4444']) {
    assert.equal(normalizePhone(raw), null, raw);
  }
  assert.equal(normalizePhone(undefined), null);
});

test('e-mail: normaliza e valida formato', () => {
  assert.equal(normalizeEmail('  Joao.Silva@Exemplo.COM '), 'joao.silva@exemplo.com');
  for (const bad of ['', 'sem-arroba', 'a@b', 'a@b.c', 'a b@c.com', '<x>@c.com', 'a..b@c.com', '.a@c.com', 'a@c..com', 'a@c.com\nBcc: x@y.com']) {
    assert.equal(normalizeEmail(bad), null, bad);
  }
});

const valid = {
  name: '  João   da Silva ',
  email: 'joao@exemplo.com',
  phone: '(99) 98765-4321',
  interest: 'sites',
  message: 'Teste\r\n\r\n\r\n\r\nlinhas',
  consent: true
};

test('lead válido é normalizado', () => {
  const r = validateLead(valid);
  assert.ok(r.ok);
  assert.equal(r.value.name, 'João da Silva');
  assert.equal(r.value.interest.label, 'Desenvolvimento de sites');
  assert.equal(r.value.message, 'Teste\n\nlinhas');
});

test('campos obrigatórios e consentimento', () => {
  const r = validateLead({});
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['consent', 'email', 'interest', 'name', 'phone']);
  assert.equal(validateLead({ ...valid, consent: 'true' }).ok, false);
  assert.equal(validateLead({ ...valid, consent: false }).errors.consent !== undefined, true);
});

test('nome completo, interesse e tipos inesperados', () => {
  assert.equal(validateLead({ ...valid, name: 'João' }).ok, false);
  assert.equal(validateLead({ ...valid, name: '<script>alert(1)</script> x' }).ok, false);
  assert.equal(validateLead({ ...valid, interest: 'hackear' }).ok, false);
  assert.equal(validateLead({ ...valid, interest: '__proto__' }).ok, false);
  assert.equal(validateLead({ ...valid, email: ['a@b.com'] }).ok, false);
  assert.equal(validateLead({ ...valid, phone: 99999999999 }).ok, false);
  assert.equal(validateLead(null).ok, false);
  assert.equal(validateLead({ ...valid, message: 'x'.repeat(5000) }).value.message.length, 2000);
});
