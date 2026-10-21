import test from 'node:test';
import assert from 'node:assert/strict';
import { YahooClient, leagueKey, teamKey } from '../src/yahoo.js';

test('keys cannot inject API paths', () => {
  assert.equal(leagueKey('461.l.123'), '461.l.123');
  assert.equal(teamKey('461.l.123.t.2'), '461.l.123.t.2');
  for (const input of ['https://evil.example', '461.l.1/players', 'nfl.l.1', '']) assert.throws(() => leagueKey(input));
});

test('expired token is refreshed once concurrently and rotated refresh token persisted', async () => {
  process.env.YAHOO_CLIENT_ID = 'test-id'; process.env.YAHOO_CLIENT_SECRET = 'test-secret';
  let refreshes = 0; let stored;
  const client = new YahooClient({
    load: async () => ({ access_token: 'expired', expires_at: 0, refresh_token: 'old' }),
    save: async value => { stored = value; },
    fetcher: async (url, init) => {
      if (url.includes('/get_token')) {
        refreshes++;
        assert.equal(init.body.get('refresh_token'), 'old');
        return Response.json({ access_token: 'fresh', refresh_token: 'rotated', expires_in: 3600 });
      }
      assert.equal(init.method, 'GET');
      assert.equal(init.headers.Authorization, 'Bearer fresh');
      return new Response('<fantasy_content><league><name>My League</name></league></fantasy_content>');
    },
  });
  const results = await Promise.all([client.get('league/461.l.1/settings'), client.get('league/461.l.1/teams')]);
  assert.equal(refreshes, 1); assert.equal(stored.refresh_token, 'rotated');
  assert.equal(results[0].league.name, 'My League');
});

test('401 retries once with a refreshed token; API errors omit Yahoo response secrets', async () => {
  let apiCalls = 0;
  const client = new YahooClient({
    load: async () => ({ access_token: 'current', expires_at: Date.now() + 3600000, refresh_token: 'refresh' }),
    save: async () => {},
    fetcher: async url => {
      if (url.includes('/get_token')) return Response.json({ access_token: 'new', expires_in: 3600 });
      apiCalls++;
      return new Response('sensitive error body', { status: 401 });
    },
  });
  await assert.rejects(client.get('league/461.l.1/settings'), /Yahoo request failed \(401\)/);
  assert.equal(apiCalls, 2);
  await assert.rejects(client.get('https://evil.example'), /Invalid Yahoo API path/);
});
