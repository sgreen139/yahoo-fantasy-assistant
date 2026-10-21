import { z } from 'zod';
import { leagueKey, teamKey } from './yahoo.js';

const key = z.string().optional();
const week = z.number().int().min(1).max(18).optional();
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function registerTools(server, client, demo = false) {
  const register = (name, description, inputSchema, handler) => server.registerTool(name, {
    description, inputSchema, annotations: readOnly,
  }, async (args) => {
    try {
      const data = demo ? demoData(name, args) : await handler(args);
      return { content: [{ type: 'text', text: JSON.stringify({
        source: demo ? 'SYNTHETIC DEMO — not your Yahoo account' : 'Yahoo Fantasy',
        fetched_at: new Date().toISOString(),
        attribution: 'Fantasy data provided by Yahoo Fantasy — https://football.fantasysports.yahoo.com/',
        data,
      }) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  });
  const season = z.number().int().min(2001).max(2100).optional();
  const games = (year) => `users;use_login=1/games;game_codes=nfl${year ? `;seasons=${year}` : ';is_available=1'}`;
  register('list_my_leagues', 'Find your Yahoo football leagues and league keys. Optionally select a season.', { season },
    ({ season }) => client.get(`${games(season)}/leagues`));
  register('list_my_teams', 'Find your Yahoo football teams and team keys. Use these to identify your roster.', { season },
    ({ season }) => client.get(`${games(season)}/teams`));
  register('get_league_settings', 'Read scoring rules, roster positions, and league settings before giving advice.', { league_key: key },
    ({ league_key }) => client.get(`league/${leagueKey(league_key)}/settings`));
  register('get_league_teams', 'List all teams in a league to find team keys and potential trade partners.', { league_key: key },
    ({ league_key }) => client.get(`league/${leagueKey(league_key)}/teams`));
  register('get_team_roster', 'Read any accessible team roster, including starters and bench. Omit week for current roster. Use list_my_teams to find your own team.', { team_key: key, week },
    ({ team_key, week }) => client.get(`team/${teamKey(team_key)}/roster${week ? `;week=${week}` : ''}/players`));
  register('get_available_players', 'Read a page of free agents or waiver players in your league. Query FA and W separately to cover both. Yahoo rank is not a personalized recommendation.', {
    league_key: key, status: z.enum(['FA', 'W']).default('FA'),
    position: z.enum(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']).optional(),
    start: z.number().int().min(0).max(5000).default(0), count: z.number().int().min(1).max(25).default(25),
  }, ({ league_key, status, position, start, count }) => client.get(
    `league/${leagueKey(league_key)}/players;status=${status}${position ? `;position=${position}` : ''};sort=OR;start=${start};count=${count}/ownership`));
  register('get_standings', 'Read league standings to understand team performance.', { league_key: key },
    ({ league_key }) => client.get(`league/${leagueKey(league_key)}/standings`));
  register('get_matchups', 'Read league matchups and scores for the current or selected NFL week.', { league_key: key, week },
    ({ league_key, week }) => client.get(`league/${leagueKey(league_key)}/scoreboard${week ? `;week=${week}` : ''}`));
  register('get_player_stats', 'Read season or weekly stats for up to 25 Yahoo player keys, using league scoring context. Read league settings to map stat IDs.', {
    league_key: key, player_keys: z.array(z.string().regex(/^\d+\.p\.\d+$/)).min(1).max(25), week,
  }, ({ league_key, player_keys, week }) => {
    const league = leagueKey(league_key);
    if (player_keys.some(p => p.split('.')[0] !== league.split('.')[0])) throw new Error('Player keys must belong to the same game/season as the league.');
    return client.get(`league/${league}/players;player_keys=${player_keys.join(',')}/stats${week ? `;type=week;week=${week}` : ';type=season'}`);
  });
}

function demoData(name, args) {
  const league = { league_key: '999.l.123', name: 'Example League (fictional)' };
  const teams = [{ team_key: '999.l.123.t.1', name: 'Your Example Team', is_owned_by_current_login: '1' }, { team_key: '999.l.123.t.2', name: 'Example Trade Partner' }];
  const player = (id, name, position) => ({ player_key: `999.p.${id}`, name, eligible_positions: [position], note: 'Fictional player; no real stats or projections.' });
  switch (name) {
    case 'list_my_leagues': return { leagues: [league] };
    case 'list_my_teams': case 'get_league_teams': return { teams };
    case 'get_league_settings': return { ...league, scoring_type: 'head', reception_points: 1, roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'W/R/T', 'K', 'DEF', 'BN'], note: 'Example PPR settings only.' };
    case 'get_team_roster': return { team_key: args.team_key ?? teams[0].team_key, players: [player(1, 'Example Quarterback', 'QB'), player(2, 'Example Running Back', 'RB')], week: args.week ?? null };
    case 'get_available_players': return { status: args.status, start: args.start, count: args.start === 0 ? 1 : 0, players: args.start === 0 ? [player(3, 'Example Available Player', args.position ?? 'RB')] : [] };
    case 'get_standings': return { teams: teams.map((t, i) => ({ ...t, rank: i + 1 })) };
    case 'get_matchups': return { week: args.week ?? 1, teams, note: 'Example matchup; no live scores.' };
    case 'get_player_stats': return { players: args.player_keys.map(player_key => ({ player_key, stats: [], note: 'No actual statistics in demo mode.' })) };
  }
}
