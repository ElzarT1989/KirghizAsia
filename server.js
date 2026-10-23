const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.txt', '.xml', '.ico']);
const cache = new Map();

/* файл читаем с диска при изменении (mtime), иначе берём готовую запись из памяти */
function load(file, cb) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return cb(null);
    const hit = cache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return cb(hit);
    fs.readFile(file, (e, raw) => {
      if (e) return cb(null);
      const entry = { mtime: st.mtimeMs, raw, etag: '"' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 20) + '"' };
      if (COMPRESSIBLE.has(path.extname(file).toLowerCase()) && raw.length > 512) {
        entry.gz = zlib.gzipSync(raw, { level: 9 });
        entry.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      }
      cache.set(file, entry);
      cb(entry);
    });
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');

  load(file, (entry) => {
    if (!entry) return send(res, 404, 'Не найдено', { 'Content-Type': MIME['.txt'] });
    const ext = path.extname(file).toLowerCase();
    const revalidate = ['.html', '.css', '.js'].includes(ext);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=86400',
      ETag: entry.etag,
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === entry.etag) return send(res, 304, '', headers);

    /* текст сжимаем один раз при первом обращении (br → gzip), дальше отдаём из памяти */
    const accept = String(req.headers['accept-encoding'] || '');
    let body = entry.raw;
    if (entry.br && /(^|[ ,])br([ ,;]|$)/.test(accept)) { body = entry.br; headers['Content-Encoding'] = 'br'; }
    else if (entry.gz && /(^|[ ,])gzip([ ,;]|$)/.test(accept)) { body = entry.gz; headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length;
    send(res, 200, req.method === 'HEAD' ? '' : body, headers);
  });
});

server.listen(PORT, () => {
  console.log(`KirghizAsia: http://localhost:${PORT}`);
});
