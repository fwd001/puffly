#!/usr/bin/env bash
# Serve the built app exactly the way GitHub Pages will, and check what actually comes back.
#
# Every unit test passes with a wrong base path; the only symptom in production is a blank
# page, because index.html asks for /assets/… at the domain root instead of /<repo>/assets/….
set -euo pipefail

BASE="${PUBLIC_BASE:-/puffly/}"
PORT="${PORT:-4173}"
HOST="127.0.0.1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST="$ROOT/apps/web/dist"

if [ ! -f "$DIST/index.html" ]; then
  echo "no build found at apps/web/dist — run: PUBLIC_BASE=$BASE npm run build" >&2
  exit 1
fi

node -e '
const [dir, port, host, base] = process.argv.slice(1);
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { join, normalize } = require("node:path");
// Pages hosts a project site under /<repo>/ and serves the artifact root there, so the
// prefix has to come off before the file is looked up.
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  let path = decodeURIComponent(url.pathname);
  if (base !== "/" && path.startsWith(base)) path = path.slice(base.length - 1);
  if (path === "" || path === "/") path = "/index.html";
  try {
    const body = await readFile(join(dir, normalize(path).replace(/^(\.\.[/\\])+/, "")));
    res.writeHead(200, { "content-type": contentType(path) });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
function contentType(path) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".webmanifest")) return "application/manifest+json";
  return "application/octet-stream";
}
server.listen(port, host, () => console.log(`serving ${dir} on ${host}:${port}`));
' "$DIST" "$PORT" "$HOST" "$BASE" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://$HOST:$PORT$BASE"; then break; fi
  sleep 0.25
done

fail() { echo "FAIL: $1" >&2; exit 1; }

ORIGIN="http://$HOST:$PORT"
PAGE="$ORIGIN$BASE"
HTML="$(curl -fsS "$PAGE" 2>/dev/null || fail "$BASE did not answer; the build is not servable from this path")"

ASSET="$(printf '%s' "$HTML" | sed -n 's/.*src="\([^"]*\.js\)".*/\1/p' | head -1)"
[ -n "$ASSET" ] || fail "index.html references no script"

case "$ASSET" in
  "$BASE"*) ;;
  *) fail "index.html loads $ASSET, which is not under $BASE — the build used the wrong base" ;;
esac

curl -fsS -o /dev/null "$ORIGIN$ASSET" || fail "$ASSET returned nothing"
printf 'ok  index served from %s\n' "$BASE"
printf 'ok  entry asset %s\n' "$ASSET"

MANIFEST="$(printf '%s' "$HTML" | sed -n 's/.*href="\([^"]*\.webmanifest\)".*/\1/p' | head -1)"
if [ -n "$MANIFEST" ]; then
  curl -fsS -o /dev/null "$ORIGIN$MANIFEST" || fail "$MANIFEST returned nothing"
  printf 'ok  manifest %s\n' "$MANIFEST"
fi

# Offline is the product (§53): the generated worker has to be reachable under the same base.
if [ -f "$DIST/sw.js" ]; then
  curl -fsS -o /dev/null "$ORIGIN${BASE}sw.js" || fail "sw.js is not reachable under $BASE"
  printf 'ok  service worker %ssw.js\n' "$BASE"
fi
