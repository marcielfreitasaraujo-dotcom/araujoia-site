import test, { before, after, beforeEach, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockEmail } from '../scripts/dev-server.mjs';
import { getSecret, makeSessionToken, sign } from '../netlify/lib/security.mjs';
import leadFn from '../netlify/functions/lead.mjs';
import tokenFn from '../netlify/functions/form-token.mjs';
import adminFn from '../netlify/functions/admin.mjs';
import retryFn from '../netlify/functions/notify-retry.mjs';
import { openStore } from '../netlify/lib/store.mjs';

const HOST = 'https://site.test';
const SECRET = 'segredo-de-teste-apenas-para-testes-automatizados';
const PASSWORD = 'senha-de-teste-123';
let tmp, mock, mockPort = 4111, ipCounter = 0;

const baseEnv = () => {
  process.env.LEADS_STORAGE = 'file';
  process.env.LEADS_DATA_DIR = tmp;
  process.env.FORM_SECRET = SECRET;
  process.env.NETLIFY_FORMS = 'off';
  delete process.env.FORMS_SUBMIT_URL;
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.RESEND_API_KEY = 're_chave_falsa_de_teste';
  process.env.NOTIFY_EMAIL = 'dono@exemplo.test';
  process.env.RESEND_API_URL = `http://127.0.0.1:${mockPort}/emails`;
};

before(async () => {
  mock = await startMockEmail(mockPort);
});
after(() => mock.server.close());
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'aia-test-'));
  baseEnv();
  mock.sent.length = 0;
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const oldToken = (secret = SECRET) => sign({ t: Date.now() - 10_000, n: 'teste' }, secret);
const newIp = () => `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

const payload = (over = {}) => ({
  name: 'Cliente Teste Automatizado',
  email: 'cliente.teste@exemplo.test',
  phone: '(99) 98765-4321',
  interest: 'sites',
  message: 'Mensagem de TESTE <b>negrito</b>',
  company: 'Empresa de Teste Ltda',
  deadline: 'um_mes',
  budget: 'de_1500_a_5000',
  currentSite: 'www.exemplo.test',
  consent: true,
  token: oldToken(),
  key: `key-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  website: '',
  ...over
});

const post = (body, { ip = newIp(), headers = {} } = {}) =>
  leadFn(
    new Request(`${HOST}/api/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    }),
    { ip }
  );

const admin = (pathname, { method = 'GET', body, cookie, ip = newIp(), headers = {} } = {}) =>
  adminFn(
    new Request(`${HOST}/api/admin/${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined
    }),
    { ip }
  );

async function login() {
  const res = await admin('login', { method: 'POST', body: { password: PASSWORD } });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

const allLeads = async () => {
  const store = await openStore('leads');
  return Promise.all((await store.keys('lead/')).map((k) => store.get(k)));
};

test('formulário desativado até configurar senha e segredo', async () => {
  delete process.env.ADMIN_PASSWORD;
  const t = await (await tokenFn(new Request(`${HOST}/api/form-token`))).json();
  assert.equal(t.ok, false);
  assert.equal((await post(payload())).status, 503);
  assert.equal((await admin('session')).status, 503);
});

const emails = () => mock.sent.filter((m) => !m.isForm);
const formPosts = () => mock.sent.filter((m) => m.isForm);

test('sem nenhuma variável: o formulário abre pelo Netlify Forms e o segredo é gerado sozinho', async () => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.FORM_SECRET;
  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFY_EMAIL;
  delete process.env.NETLIFY_FORMS;
  process.env.FORMS_SUBMIT_URL = `http://127.0.0.1:${mockPort}/forms`;

  const t = await (await tokenFn(new Request(`${HOST}/api/form-token`))).json();
  assert.equal(t.ok, true);
  assert.equal((await admin('session')).status, 503, 'painel continua exigindo ADMIN_PASSWORD');

  const meta = await openStore('meta');
  const generated = await getSecret(meta);
  assert.match(generated, /^[0-9a-f]{64}$/);
  assert.equal(await getSecret(meta), generated, 'o segredo é estável');

  const res = await post(payload({ token: sign({ t: Date.now() - 10_000, n: 'x' }, generated) }));
  assert.equal(res.status, 201);
  const [lead] = await allLeads();
  assert.equal(lead.notification.status, 'sent');
  assert.deepEqual(lead.notification.channels, { forms: 'sent' });
  assert.equal(emails().length, 0);
  assert.equal(formPosts().length, 1);
  const f = formPosts()[0].body;
  assert.equal(f['form-name'], 'orcamento');
  assert.equal(f.nome, 'Cliente Teste Automatizado');
  assert.equal(f.telefone, '(99) 98765-4321');
  assert.equal(f.whatsapp, 'https://wa.me/5599987654321');
  assert.equal(f.interesse, 'Desenvolvimento de sites');
  assert.equal(f.empresa, 'Empresa de Teste Ltda');
  assert.equal(f.prazo, 'Em até 1 mês');
  assert.equal(f.investimento, 'De R$ 1.500 a R$ 5.000');
  assert.equal(f.id_do_registro, lead.id);
});

test('Netlify Forms: falha preserva o cadastro e o reenvio não duplica o aviso', async () => {
  delete process.env.NETLIFY_FORMS;
  process.env.FORMS_SUBMIT_URL = 'http://127.0.0.1:9/forms';
  const res = await post(payload());
  assert.equal(res.status, 201);
  let [lead] = await allLeads();
  assert.equal(lead.notification.status, 'failed');
  assert.equal(lead.notification.channels.forms, 'failed');

  process.env.FORMS_SUBMIT_URL = `http://127.0.0.1:${mockPort}/forms`;
  const cookie = await login();
  assert.equal((await (await admin(`leads/${lead.id}/notify`, { method: 'POST', cookie })).json()).notification.status, 'sent');
  assert.equal(formPosts().length, 1);
  // reenviar de novo não manda outro aviso: o canal já concluiu
  await admin(`leads/${lead.id}/notify`, { method: 'POST', cookie });
  assert.equal(formPosts().length, 1);
  assert.equal((await allLeads()).length, 1);
});

test('dois canais: se só um falha, o reenvio repete apenas o que falhou', async () => {
  delete process.env.NETLIFY_FORMS;
  process.env.FORMS_SUBMIT_URL = 'http://127.0.0.1:9/forms';
  assert.equal((await post(payload())).status, 201);
  assert.equal(emails().length, 1, 'e-mail enviado');
  let [lead] = await allLeads();
  assert.deepEqual(lead.notification.channels, { resend: 'sent', forms: 'failed' });
  assert.equal(lead.notification.status, 'failed');

  process.env.FORMS_SUBMIT_URL = `http://127.0.0.1:${mockPort}/forms`;
  const cookie = await login();
  await admin(`leads/${lead.id}/notify`, { method: 'POST', cookie });
  assert.equal(emails().length, 1, 'e-mail não é reenviado');
  assert.equal(formPosts().length, 1);
  [lead] = await allLeads();
  assert.deepEqual(lead.notification.channels, { resend: 'sent', forms: 'sent' });
  assert.equal(lead.notification.status, 'sent');
});

test('token do formulário é emitido quando configurado', async () => {
  const t = await (await tokenFn(new Request(`${HOST}/api/form-token`))).json();
  assert.equal(t.ok, true);
  assert.ok(t.token.includes('.'));
});

test('envio válido: salva, notifica por e-mail e responde 201', async () => {
  const res = await post(payload());
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.id, /^ld_/);

  const [lead] = await allLeads();
  assert.equal(lead.id, body.id);
  assert.equal(lead.name, 'Cliente Teste Automatizado');
  assert.equal(lead.phone.e164, '+5599987654321');
  assert.equal(lead.status, 'novo');
  assert.equal(lead.consent.given, true);
  assert.ok(lead.consent.privacyVersion);
  assert.equal(lead.notification.status, 'sent');
  assert.equal(JSON.stringify(lead).includes('10.1.'), false, 'IP bruto não pode ser armazenado');

  assert.equal(mock.sent.length, 1);
  const mail = mock.sent[0].body;
  assert.equal(mail.subject, 'Novo potencial cliente — formulário do site');
  assert.deepEqual(mail.to, ['dono@exemplo.test']);
  assert.match(mail.text, /Nome: Cliente Teste Automatizado/);
  assert.match(mail.text, /Telefone: \(99\) 98765-4321/);
  assert.match(mail.text, /WhatsApp: https:\/\/wa\.me\/5599987654321/);
  assert.match(mail.text, /Interesse: Desenvolvimento de sites/);
  assert.match(mail.text, /Empresa: Empresa de Teste Ltda/);
  assert.match(mail.text, /Prazo desejado: Em até 1 mês/);
  assert.match(mail.text, /Faixa de investimento: De R\$ 1\.500 a R\$ 5\.000/);
  assert.match(mail.text, /Site atual: www\.exemplo\.test/);
  assert.equal(lead.company, 'Empresa de Teste Ltda');
  assert.equal(lead.budget.key, 'de_1500_a_5000');
  assert.match(mail.text, new RegExp(`ID do registro: ${lead.id}`));
  assert.ok(!mail.html.includes('<b>negrito</b>'), 'HTML do visitante deve ser escapado');
  assert.ok(mail.html.includes('&lt;b&gt;negrito&lt;/b&gt;'));
  assert.equal(mock.sent[0].headers['idempotency-key'], `lead-${lead.id}`);
  assert.equal(mock.sent[0].headers.authorization, 'Bearer re_chave_falsa_de_teste');
});

test('perguntas opcionais: podem ficar em branco e opções inválidas são rejeitadas', async () => {
  const bare = await post(payload({ company: '', deadline: '', budget: '', currentSite: '' }));
  assert.equal(bare.status, 201);
  const mail = mock.sent[0].body;
  for (const label of ['Empresa:', 'Prazo desejado:', 'Faixa de investimento:', 'Site atual:']) {
    assert.ok(!mail.text.includes(label), `${label} só aparece quando preenchido`);
  }
  const bad = await post(payload({ email: 'outro@exemplo.test', deadline: 'ontem', budget: '__proto__' }));
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys((await bad.json()).errors).sort(), ['budget', 'deadline']);
});

test('campos obrigatórios vazios retornam 422 sem salvar', async () => {
  const res = await post(payload({ name: '', email: '', phone: '', interest: '', consent: false }));
  assert.equal(res.status, 422);
  const { errors } = await res.json();
  assert.deepEqual(Object.keys(errors).sort(), ['consent', 'email', 'interest', 'name', 'phone']);
  assert.equal((await allLeads()).length, 0);
});

test('e-mail e telefone inválidos são rejeitados', async () => {
  const a = await post(payload({ email: 'nao-e-email' }));
  assert.equal(a.status, 422);
  assert.ok((await a.json()).errors.email);
  const b = await post(payload({ phone: '12345' }));
  assert.equal(b.status, 422);
  assert.ok((await b.json()).errors.phone);
  assert.equal((await allLeads()).length, 0);
});

test('honeypot: robô recebe sucesso falso e nada é salvo', async () => {
  const res = await post(payload({ website: 'http://spam.test' }));
  assert.equal(res.status, 201);
  assert.equal((await allLeads()).length, 0);
  assert.equal(mock.sent.length, 0);
});

test('token ausente, inválido ou rápido demais é recusado', async () => {
  for (const token of [undefined, 'abc.def', sign({ t: Date.now(), n: 'x' }, SECRET), sign({ t: Date.now() - 10_000 }, 'outro-segredo')]) {
    const res = await post(payload({ token }));
    assert.equal(res.status, 400, String(token));
    assert.equal((await res.json()).error, 'token');
  }
  assert.equal((await allLeads()).length, 0);
});

test('proteção contra duplicidade: mesma chave de envio e mesmo contato', async () => {
  const ip = newIp();
  const first = payload();
  assert.equal((await post(first, { ip })).status, 201);
  const again = await post(first, { ip });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);

  const sameContact = await post(payload(), { ip });
  assert.equal(sameContact.status, 200);
  assert.equal((await sameContact.json()).duplicate, true);

  assert.equal((await allLeads()).length, 1);
  assert.equal(mock.sent.length, 1, 'apenas um e-mail');
});

test('limite de requisições por IP (429)', async () => {
  const ip = newIp();
  let last;
  for (let i = 0; i < 9; i++) last = await post(payload({ token: 'x' }), { ip });
  assert.equal(last.status, 429);
});

test('origem diferente é bloqueada e corpo inválido tratado', async () => {
  assert.equal((await post(payload(), { headers: { Origin: 'https://malicioso.test' } })).status, 403);
  assert.equal((await post(payload(), { headers: { Origin: HOST } })).status, 201);
  assert.equal((await post('{nao-json')).status, 400);
  assert.equal((await post('x'.repeat(20_000))).status, 413);
  const wrongType = await leadFn(new Request(`${HOST}/api/lead`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }), { ip: newIp() });
  assert.equal(wrongType.status, 415);
  const get = await leadFn(new Request(`${HOST}/api/lead`), { ip: newIp() });
  assert.equal(get.status, 405);
});

test('falha no e-mail preserva o cadastro e permite reenviar sem duplicar', async () => {
  process.env.RESEND_API_URL = 'http://127.0.0.1:9/emails'; // porta fechada
  const res = await post(payload());
  assert.equal(res.status, 201, 'visitante vê sucesso pois o cadastro foi salvo');
  let [lead] = await allLeads();
  assert.equal(lead.notification.status, 'failed');
  assert.equal(lead.notification.attempts, 1);
  assert.ok(lead.notification.lastError);
  assert.equal(JSON.stringify(lead.notification).includes('cliente.teste'), false, 'erro sem dados pessoais');

  process.env.RESEND_API_URL = `http://127.0.0.1:${mockPort}/emails`;
  const cookie = await login();
  const retry = await admin(`leads/${lead.id}/notify`, { method: 'POST', cookie });
  assert.equal((await retry.json()).notification.status, 'sent');
  const leads = await allLeads();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].notification.attempts, 2);
  assert.equal(mock.sent.length, 1);
});

test('reenvio automático agendado reprocessa notificações falhas', async () => {
  process.env.RESEND_API_URL = 'http://127.0.0.1:9/emails';
  await post(payload());
  process.env.RESEND_API_URL = `http://127.0.0.1:${mockPort}/emails`;
  const store = await openStore('leads');
  const [key] = await store.keys('lead/');
  const lead = await store.get(key);
  lead.notification.lastAttemptAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await store.set(key, lead);
  await retryFn();
  assert.equal((await store.get(key)).notification.status, 'sent');
  assert.equal(mock.sent.length, 1);
});

test('sem serviço de e-mail configurado: cadastro salvo e status not_configured', async () => {
  delete process.env.RESEND_API_KEY;
  const res = await post(payload());
  assert.equal(res.status, 201);
  const [lead] = await allLeads();
  assert.equal(lead.notification.status, 'not_configured');
  assert.equal(mock.sent.length, 0);
});

test('painel: exige autenticação e rejeita senha errada e cookie adulterado', async () => {
  assert.equal((await admin('leads')).status, 401);
  assert.equal((await admin('session')).status, 401);
  assert.equal((await admin('login', { method: 'POST', body: { password: 'errada' } })).status, 401);
  assert.equal((await admin('login', { method: 'POST', body: {} })).status, 401);
  assert.equal((await admin('leads', { cookie: 'aia_admin=adulterado.xyz' })).status, 401);
  const forged = `aia_admin=${makeSessionToken('segredo-errado', Date.now() + 1e6)}`;
  assert.equal((await admin('leads', { cookie: forged })).status, 401);
  const expired = `aia_admin=${makeSessionToken(SECRET, Date.now() - 1)}`;
  assert.equal((await admin('leads', { cookie: expired })).status, 401);
});

test('painel: cookie é HttpOnly, SameSite=Strict e restrito ao caminho do painel', async () => {
  const res = await admin('login', { method: 'POST', body: { password: PASSWORD } });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/admin/);
});

test('painel: listar, buscar, filtrar, ordenar e alterar status', async () => {
  await post(payload({ name: 'Ana Souza Teste', email: 'ana@exemplo.test', phone: '(11) 98888-7777' }));
  await new Promise((r) => setTimeout(r, 15));
  await post(payload({ name: 'Bruno Lima Teste', email: 'bruno@exemplo.test', phone: '(21) 97777-6666', interest: 'automacao' }));
  const cookie = await login();

  const all = await (await admin('leads', { cookie })).json();
  assert.equal(all.total, 2);
  assert.equal(all.leads[0].name, 'Bruno Lima Teste', 'mais recente primeiro');
  const asc = await (await admin('leads?order=asc', { cookie })).json();
  assert.equal(asc.leads[0].name, 'Ana Souza Teste');

  assert.equal((await (await admin('leads?q=ana', { cookie })).json()).total, 1);
  assert.equal((await (await admin('leads?q=BRUNO@exemplo', { cookie })).json()).total, 1);
  assert.equal((await (await admin('leads?q=97777', { cookie })).json()).total, 1);
  assert.equal((await (await admin('leads?q=inexistente', { cookie })).json()).total, 0);

  const target = all.leads[0];
  const patch = await admin(`leads/${target.id}`, { method: 'PATCH', cookie, body: { status: 'contatado' } });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).lead.status, 'contatado');
  assert.equal((await (await admin('leads?status=contatado', { cookie })).json()).total, 1);
  assert.equal((await (await admin('leads?status=novo', { cookie })).json()).total, 1);
  assert.equal((await admin(`leads/${target.id}`, { method: 'PATCH', cookie, body: { status: 'hackeado' } })).status, 422);
  assert.equal((await admin('leads/ld_inexistente1', { method: 'PATCH', cookie, body: { status: 'novo' } })).status, 404);
  assert.equal((await admin('leads/../../etc', { method: 'PATCH', cookie, body: { status: 'novo' } })).status, 404);
});

test('painel: ações de escrita bloqueiam origem externa e login tem limite de tentativas', async () => {
  const cookie = await login();
  const res = await admin('logout', { method: 'POST', cookie, headers: { Origin: 'https://malicioso.test' } });
  assert.equal(res.status, 403);
  const ip = newIp();
  let last;
  for (let i = 0; i < 9; i++) last = await admin('login', { method: 'POST', body: { password: 'x' }, ip });
  assert.equal(last.status, 429);
});

test('painel: exclusão definitiva libera o mesmo contato para novo envio', async () => {
  const body = payload();
  assert.equal((await post(body)).status, 201);
  const cookie = await login();
  const [lead] = await allLeads();
  assert.equal((await admin(`leads/${lead.id}`, { method: 'DELETE' })).status, 401, 'exige login');
  assert.equal((await admin(`leads/${lead.id}`, { method: 'DELETE', cookie })).status, 200);
  assert.equal((await allLeads()).length, 0);
  assert.equal((await admin(`leads/${lead.id}`, { method: 'DELETE', cookie })).status, 404);
  assert.equal((await post(payload())).status, 201, 'mesmo e-mail/telefone pode voltar a enviar');
});

test('prazo de guarda: elimina contatos sem atividade há mais de 365 dias', async () => {
  await post(payload({ name: 'Antigo Teste Retencao', email: 'antigo@exemplo.test', phone: '(11) 98888-7777' }));
  await post(payload({ name: 'Recente Teste Retencao', email: 'recente@exemplo.test', phone: '(21) 97777-6666' }));
  const store = await openStore('leads');
  const old = (await allLeads()).find((l) => l.email === 'antigo@exemplo.test');
  const past = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
  old.createdAt = past;
  old.history = [{ at: past, status: 'novo' }];
  await store.set(`lead/${old.id}`, old);
  await retryFn();
  const left = await allLeads();
  assert.equal(left.length, 1);
  assert.equal(left[0].email, 'recente@exemplo.test');
});

test('credenciais e segredos não aparecem em arquivos públicos', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['index.html', 'admin/index.html', 'privacidade.html']) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const forbidden of ['RESEND_API_KEY', 'ADMIN_PASSWORD', 'FORM_SECRET', 're_', 'NOTIFY_EMAIL', SECRET, PASSWORD]) {
      if (forbidden === 're_') assert.equal(/\bre_[A-Za-z0-9]{10,}/.test(text), false, `${file} contém chave`);
      else assert.equal(text.includes(forbidden), false, `${file} expõe ${forbidden}`);
    }
  }
});
