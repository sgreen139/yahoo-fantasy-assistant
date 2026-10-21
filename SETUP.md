# Developer setup

Status: local prototype. Yahoo approval and real-account verification are pending.
The existing public README/project website is unchanged.

## Try the demo now

Install Node.js 22 or newer, then run these commands in this repository:

```sh
npm ci
cp .env.example .env
npm run demo
```

The server uses stdio by default. It waits for an MCP client, so it will not show a
chat prompt in your terminal. All demo results are explicitly fictional. The
demo tests tool plumbing; it does not demonstrate real Yahoo payloads or advice.

In the desktop custom MCP form, choose STDIO:

- Name: Yahoo Fantasy Football (Demo)
- Command: the absolute path printed by `which node`
- Arguments, as separate entries: `/ABSOLUTE/PATH/TO/yahoo-fantasy-assistant/src/server.js`, then `--demo`

For live use, launch from the repository directory with `npm start` (or configure
your MCP client's working directory and environment). Relative `.env` and token
paths are resolved from that directory. Never put credentials in GitHub.

## Tools

| Tool | Purpose |
| --- | --- |
| list_my_leagues | Discover your NFL leagues, optionally by season |
| list_my_teams | Discover your team keys |
| get_league_settings | Scoring rules and roster settings |
| get_league_teams | Other teams and keys for trade research |
| get_team_roster | Any accessible team's current or weekly roster |
| get_available_players | Paginated free agents (FA) or waivers (W), by position |
| get_standings | League standings |
| get_matchups | Current or weekly scoreboard |
| get_player_stats | Season or weekly player stats in league context |

Discover keys before querying. Set optional YAHOO_TEAM_KEY and YAHOO_LEAGUE_KEY
defaults in `.env`. Player lists are capped at 25; increment `start` to page.
Query FA and W separately. Raw parsed Yahoo XML is returned with a timestamp and
attribution; numeric stat IDs are interpreted using league settings. Fantasy
rank is not a projection. News, injury reporting, and third-party projections
are not bundled. No tools submit trades, claims, lineup changes, or add/drops.

## After Yahoo approves access

1. Follow Yahoo's provisioning instructions to get a client ID and secret with
   Fantasy Sports read permission. Use your local `.env` for those credentials.
2. Register an exact callback URI with Yahoo. The local helper supports
   `http://127.0.0.1:8787/callback` only if Yahoo accepts that callback. Yahoo's
   current application policy must be verified after approval; do not assume
   localhost callbacks are permitted. If HTTPS is required, implement the hosted
   callback before proceeding.
3. Set YAHOO_REDIRECT_URI to the registered URI and run `npm run auth`. Open the
   printed URL, sign in directly at Yahoo, and approve access. A state parameter
   protects the callback. The authorization helper times out after five minutes.
4. Tokens are stored in `.data/yahoo-tokens.json` with owner-only permissions.
   Refreshes persist rotated refresh tokens. Keep a single server process per
   token file to avoid refresh rotation races across processes.
5. Set YAHOO_DEMO=false and run `npm start` from this directory.
6. First verify list_my_leagues and list_my_teams against Yahoo. Then check the
   roster, scoring, availability, ownership, and stats against Yahoo's UI. Live
   endpoints and response shapes remain unverified until this step.

## HTTP and phone access

The local HTTP prototype uses Streamable HTTP at http://127.0.0.1:3000/mcp.
Set MCP_TRANSPORT=http and a random MCP_BEARER_TOKEN of at least 32 characters.
It rejects unauthenticated requests, nonlocal Host headers, and browser Origins.
This is for local clients that can supply an Authorization: Bearer header.

It is **not yet a hosted ChatGPT integration**. Before publishing for mobile,
implement and test client-facing OAuth/discovery compatible with ChatGPT, HTTPS,
private credential storage, and persistent token storage. Yahoo authorization
and ChatGPT-to-MCP authorization are separate. Never deploy this server publicly
without those pieces or put Yahoo tokens into an MCP URL. Phone support must be
tested in the user's account after installation.

## Verification

```sh
npm test
```

Tests cover MCP initialization/discovery/demo calls, input validation, API path
validation, token rotation, concurrent refresh, and bounded 401 retry. Tests use
synthetic responses and do not contact Yahoo or expose real account data.

References:
- https://sports.yahoo.com/developer/docs/
- https://developer.yahoo.com/oauth2/guide/flows_authcode/
- https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x
