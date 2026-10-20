import { promises as fs } from 'node:fs';
import path from 'node:path';

// Em produção usa o Netlify Blobs (persistente e privado, sem credenciais extras).
// Para desenvolvimento e testes, LEADS_STORAGE=file grava arquivos JSON em LEADS_DATA_DIR.
function fileStore(name) {
  const base = path.resolve(process.env.LEADS_DATA_DIR || '.data', name);
  const fileFor = (key) => path.join(base, `${encodeURIComponent(key)}.json`);
  return {
    async get(key) {
      try {
        return JSON.parse(await fs.readFile(fileFor(key), 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async set(key, value) {
      await fs.mkdir(base, { recursive: true });
      const target = fileFor(key);
      const tmp = `${target}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value));
      await fs.rename(tmp, target);
    },
    async delete(key) {
      await fs.rm(fileFor(key), { force: true });
    },
    async keys(prefix = '') {
      try {
        const files = await fs.readdir(base);
        return files
          .filter((f) => f.endsWith('.json'))
          .map((f) => decodeURIComponent(f.slice(0, -5)))
          .filter((k) => k.startsWith(prefix));
      } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
      }
    }
  };
}

async function blobStore(name) {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name, consistency: 'strong' });
  return {
    get: (key) => store.get(key, { type: 'json' }),
    set: (key, value) => store.setJSON(key, value),
    delete: (key) => store.delete(key),
    async keys(prefix = '') {
      const out = [];
      for await (const page of store.list({ prefix, paginate: true })) {
        for (const blob of page.blobs) out.push(blob.key);
      }
      return out;
    }
  };
}

export async function openStore(name) {
  if (process.env.LEADS_STORAGE === 'file') return fileStore(name);
  return blobStore(name);
}
