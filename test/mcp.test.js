import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('MCP initializes, advertises only read tools, and returns labeled demo data', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['src/server.js', '--demo'], env: { ...process.env, MCP_TRANSPORT: 'stdio' } });
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9);
    assert.ok(tools.every(t => t.annotations.readOnlyHint));
    for (const name of ['list_my_leagues', 'list_my_teams', 'get_league_settings', 'get_league_teams', 'get_team_roster', 'get_available_players', 'get_standings', 'get_matchups']) {
      const result = await client.callTool({ name, arguments: {} });
      assert.ok(!result.isError, name);
      assert.match(JSON.parse(result.content[0].text).source, /SYNTHETIC DEMO/);
    }
    const invalid = await client.callTool({ name: 'get_available_players', arguments: { count: 100 } });
    assert.equal(invalid.isError, true);
    const stats = await client.callTool({ name: 'get_player_stats', arguments: { player_keys: ['999.p.1'] } });
    assert.ok(!stats.isError);
  } finally { await client.close(); }
});

test('HTTP rejects unauthenticated access and accepts authenticated MCP calls', { timeout: 15000 }, async () => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const secret = 'test-secret-for-local-http-32-characters';
  const child = spawn(process.execPath, ['src/server.js', '--demo'], {
    env: { ...process.env, MCP_TRANSPORT: 'http', MCP_PORT: String(port), MCP_BEARER_TOKEN: secret }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = once(child, 'exit');
  const client = new Client({ name: 'http-test', version: '1.0.0' });
  try {
    await Promise.race([once(child.stderr, 'data'), exited.then(() => { throw new Error('HTTP server exited early'); })]);
    const url = new URL(`http://127.0.0.1:${port}/mcp`);
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${secret}`, Origin: 'https://evil.example' } })).status, 403);
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${secret}` } } }));
    assert.equal((await client.listTools()).tools.length, 9);
    const result = await client.callTool({ name: 'list_my_leagues', arguments: {} });
    assert.match(result.content[0].text, /SYNTHETIC DEMO/);
  } finally { await client.close(); child.kill(); await exited; }
});
