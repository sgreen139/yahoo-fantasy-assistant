import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const tokenFile = resolve('.data/yahoo-tokens.json');
const tokenEndpoint = 'https://api.login.yahoo.com/oauth2/get_token';
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

export async function saveTokens(tokens) {
  await mkdir(dirname(tokenFile), { recursive: true, mode: 0o700 });
  const temporary = `${tokenFile}.${process.pid}.tmp`;
  const file = await open(temporary, 'w', 0o600);
  try { await file.writeFile(JSON.stringify(tokens)); } finally { await file.close(); }
  await rename(temporary, tokenFile);
}

export async function exchangeToken(parameters, fetcher = fetch) {
  const { YAHOO_CLIENT_ID: id, YAHOO_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('Yahoo credentials are missing. Complete Yahoo approval and local authorization first.');
  const response = await fetcher(tokenEndpoint, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Yahoo authorization failed (${response.status}). Reauthorize locally if access was revoked.`);
  const result = await response.json();
  if (!result.access_token || !Number.isFinite(Number(result.expires_in))) throw new Error('Yahoo returned an invalid token response.');
  return { ...result, expires_at: Date.now() + Number(result.expires_in) * 1000 };
}

export class YahooClient {
  constructor({ fetcher = fetch, load = () => readFile(tokenFile, 'utf8').then(JSON.parse), save = saveTokens } = {}) {
    this.fetcher = fetcher; this.load = load; this.save = save;
  }
  async token(force = false) {
    if (!this.tokens) {
      try { this.tokens = await this.load(); }
      catch { throw new Error('Yahoo is not connected. Run npm run auth after API approval.'); }
    }
    if (force || !this.tokens.access_token || this.tokens.expires_at < Date.now() + 60000) {
      if (!this.refreshing) this.refreshing = (async () => {
        if (!this.tokens.refresh_token) throw new Error('Yahoo refresh token is missing. Reauthorize locally.');
        const refreshed = await exchangeToken({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token }, this.fetcher);
        const next = { ...this.tokens, ...refreshed };
        await this.save(next);
        this.tokens = next;
      })().finally(() => { this.refreshing = undefined; });
      await this.refreshing;
    }
    return this.tokens.access_token;
  }
  async get(path) {
    // Only internally constructed relative Fantasy API paths may reach Yahoo.
    if (!/^(users|league|team)\//.test(path) || /[?#\\]/.test(path)) throw new Error('Invalid Yahoo API path.');
    for (let attempt = 0; attempt < 2; attempt++) {
      const accessToken = await this.token(attempt === 1);
      const response = await this.fetcher(`https://fantasysports.yahooapis.com/fantasy/v2/${path}`, {
        method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/xml' },
        signal: AbortSignal.timeout(20000), redirect: 'error',
      });
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 429) throw new Error('Yahoo rate limit reached. Wait before trying again.');
      if (!response.ok) throw new Error(`Yahoo request failed (${response.status}). Check league membership, season, and API access.`);
      const result = parser.parse(await response.text());
      if (!result.fantasy_content || result.fantasy_content.error) throw new Error('Yahoo returned an unexpected response.');
      return result.fantasy_content;
    }
  }
}

export function leagueKey(value = process.env.YAHOO_LEAGUE_KEY) {
  if (!/^\d+\.l\.\d+$/.test(value ?? '')) throw new Error('Provide a league_key from list_my_leagues.');
  return value;
}
export function teamKey(value = process.env.YAHOO_TEAM_KEY) {
  if (!/^\d+\.l\.\d+\.t\.\d+$/.test(value ?? '')) throw new Error('Provide a team_key from list_my_teams or get_league_teams.');
  return value;
}
