// Servidor local: serve o site estático e executa as Netlify Functions com armazenamento em arquivos.
// Uso: npm run dev   (ou npm run dev:mock para simular o envio de e-mail)
import http from 'node:http';
import { promises as fs, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotenv() {
  const file = path.join(root, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.xml': 'application/xml',
  '.txt': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml'
};
const BLOCKED = [/^\/netlify(\/|$)/, /^\/test(\/|$)/, /^\/scripts(\/|$)/, /^\/docs(\/|$)/, /^\/\./, /^\/node_modules(\/|$)/,
  /^\/package(-lock)?\.json$/, /^\/netlify\.toml$/];

async function loadRoutes() {
  const dir = path.join(root, 'netlify', 'functions');
  const routes = [];
  for (const file of await fs.readdir(dir)) {
    if (!file.endsWith('.mjs')) continue;
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    if (mod.config?.path) routes.push({ paths: [].concat(mod.config.path), handler: mod.default });
  }
  return routes;
}

function matches(pattern, pathname) {
  if (pattern.endsWith('/*')) return pathname.startsWith(pattern.slice(0, -1));
  return pathname === pattern;
}

export async function createDevServer() {
  loadDotenv();
  process.env.LEADS_STORAGE = process.env.LEADS_STORAGE || 'file';
  const routes = await loadRoutes();

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const route = routes.find((r) => r.paths.some((p) => matches(p, url.pathname)));
      if (route) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : body
        });
        const response = await route.handler(request, { ip: req.socket.remoteAddress });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }

      let pathname = decodeURIComponent(url.pathname);
      if (BLOCKED.some((re) => re.test(pathname))) {
        res.writeHead(404).end('Not found');
        return;
      }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.join(root, pathname);
      if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') res.writeHead(404).end('Not found');
      else {
        console.error(err);
        res.writeHead(500).end('Server error');
      }
    }
  });
}

// Servidor falso do Resend para testar o fluxo de e-mail sem credenciais reais.
export function startMockEmail(port = 4010, { fail = false, log = false } = {}) {
  const sent = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const isForm = String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
    const body = isForm ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw || '{}');
    if (fail) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"message":"mock failure"}');
      return;
    }
    sent.push({ headers: req.headers, body, url: req.url, isForm });
    if (log && !isForm) console.log(`\n--- E-MAIL SIMULADO ---\nPara: ${body.to}\nAssunto: ${body.subject}\n\n${body.text}\n-----------------------\n`);
    if (log && isForm) {
      const lines = Object.entries(body).map(([k, v]) => `${k}: ${v}`).join('\n');
      console.log(`\n--- ENVIO SIMULADO AO NETLIFY FORMS ---\n${lines}\n---------------------------------------\n`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":"mock"}');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, sent })));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT || 5173);
  if (process.argv.includes('--mock') || process.env.MOCK_EMAIL === '1') {
    const { sent } = await startMockEmail(4010, { log: true });
    process.env.RESEND_API_URL = 'http://127.0.0.1:4010/emails';
    process.env.FORMS_SUBMIT_URL = 'http://127.0.0.1:4010/forms';
    process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_mock_key';
    process.env.NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'dono@exemplo.test';
    console.log('E-mail simulado ativo (nada é enviado de verdade).');
    setInterval(() => {}, 1 << 30).unref();
    globalThis.__mockSent = sent;
  }
  const server = await createDevServer();
  server.listen(port, () => console.log(`Site local: http://localhost:${port}`));
}
