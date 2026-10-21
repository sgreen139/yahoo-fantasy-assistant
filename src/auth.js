import './config.js';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { exchangeToken, saveTokens } from './yahoo.js';

const id = process.env.YAHOO_CLIENT_ID;
if (!id || !process.env.YAHOO_CLIENT_SECRET) throw new Error('Set Yahoo client ID and secret in your local .env after approval.');
const redirect = new URL(process.env.YAHOO_REDIRECT_URI ?? 'http://127.0.0.1:8787/callback');
if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port || redirect.search || redirect.hash || redirect.username || redirect.password) {
  throw new Error('This local authorization helper requires an http://127.0.0.1:PORT/callback URI registered with Yahoo. If Yahoo requires HTTPS, a hosted callback must be implemented instead.');
}
const state = randomBytes(32).toString('hex');
const authorization = new URL('https://api.login.yahoo.com/oauth2/request_auth');
authorization.search = new URLSearchParams({ client_id: id, redirect_uri: redirect.href, response_type: 'code', scope: 'fspt-r', state }).toString();
let processing = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirect.origin);
  if (req.method !== 'GET' || url.pathname !== redirect.pathname) { res.writeHead(404).end(); return; }
  const received = Buffer.from(url.searchParams.get('state') ?? '');
  const expected = Buffer.from(state);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) { res.writeHead(400).end('Invalid authorization state.'); return; }
  if (processing) { res.writeHead(409).end(); return; }
  processing = true;
  try {
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) throw new Error('Authorization was not completed.');
    const tokens = await exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: redirect.href });
    await saveTokens(tokens);
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Yahoo connected. You may close this tab.');
    console.error('Yahoo connected. Tokens saved locally in .data/. Set YAHOO_DEMO=false to use live data.');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Authorization failed. Restart the local authorization command and try again.');
    process.exitCode = 1;
  } finally { clearTimeout(timeout); server.close(); }
});
const timeout = setTimeout(() => { console.error('Authorization timed out. Run npm run auth again.'); server.close(); }, 5 * 60 * 1000);
server.on('error', () => { clearTimeout(timeout); console.error('Unable to start callback listener. Check that its port is free.'); process.exitCode = 1; });
server.listen(Number(redirect.port), '127.0.0.1', () => console.error(`Open this URL in your browser to authorize Yahoo:\n${authorization.href}`));
