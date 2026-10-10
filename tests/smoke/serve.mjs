/**
 * The static server the device suite runs against: the built app, served the way Pages serves it —
 * under `/puffly/` with the prefix stripped — with the content types the module scripts and the
 * atlas need. `tests/smoke/served-build.sh` proves the same tree once; this one stays up for the
 * whole run, because the suite takes minutes and a server that exits would take its page with it.
 *
 *   node tests/smoke/serve.mjs apps/web/dist 4173 127.0.0.1 /puffly/
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const [dir, port, host, base] = process.argv.slice(2);
if (!dir || !port) {
  console.error('usage: node tests/smoke/serve.mjs <dist> <port> [host] [base]');
  process.exit(2);
}
const BIND = host ?? '127.0.0.1';
const PREFIX = base ?? '/';

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webmanifest')) return 'application/manifest+json';
  return 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${BIND}:${port}`);
  let path = decodeURIComponent(url.pathname);
  if (PREFIX !== '/' && path.startsWith(PREFIX)) path = path.slice(PREFIX.length - 1);
  if (path === '' || path === '/') path = '/index.html';
  try {
    const body = await readFile(join(dir, normalize(path).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'content-type': contentType(path) });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(Number(port), BIND, () => console.log(`serving ${dir} on ${BIND}:${port}${PREFIX}`));
