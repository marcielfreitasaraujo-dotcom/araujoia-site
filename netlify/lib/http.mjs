export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function readJson(req, maxBytes = 12_000) {
  const type = req.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) throw new HttpError(415, 'unsupported_media_type');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

// Bloqueia requisições de outros sites (CSRF/abuso). Requisições sem Origin (ex.: curl) passam,
// pois as demais camadas (token, limite de taxa, sessão) continuam valendo.
export function originAllowed(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set([new URL(req.url).host]);
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const item of extra) {
    try {
      allowed.add(new URL(item).host);
    } catch {
      allowed.add(item);
    }
  }
  return allowed.has(host);
}

export function clientIp(req, context) {
  return (
    context?.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}
