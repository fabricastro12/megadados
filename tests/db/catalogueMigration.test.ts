import { describe, expect, it } from 'vitest';
import { GameConfigSchema, createGame } from '@/game';
import { freshDatabase, U } from './harness';

describe('upgrading the old catalogue', () => {
  it('closes a running match, replaces categories and removes the retired features', async () => {
    const db = await freshDatabase(async (pg) => {
      const categories = (await pg.query<{ id: string }>(`insert into public.categories (slug, name, color) values ('megafy', 'Megafy', '#9B5CFF'), ('latinoamerica', 'Latinoamérica', '#FF6A3D') returning id`)).rows;
      const config = GameConfigSchema.parse({ categories: categories.map((c) => c.id) });
      const room = (await pg.query<{ id: string }>(`insert into public.rooms (code, status, config) values ('MXQ7K', 'playing', $1::jsonb) returning id`, [JSON.stringify({ ...config, lifelines: { ...config.lifelines, extraTime: true } })])).rows[0]!;
      const player = (await pg.query<{ id: string }>(`insert into public.players (room_id, user_id, name, role) values ($1, $2, 'Host', 'host') returning id`, [room.id, U.host])).rows[0]!;
      const created = createGame({ config, players: [{ id: player.id, name: 'Host', teamId: null }], teams: [], questions: [] }, { now: 1000, random: () => 0 });
      if (!created.ok) throw new Error(created.error);
      await pg.query(`insert into public.games (room_id, phase, state) values ($1, 'awaitingSpin', $2::jsonb)`, [room.id, JSON.stringify(created.state)]);
    });
    const game = (await db.query<{ state: { phase: string; finished: { reason: string } }; version: number }>('select state, version from public.games')).rows[0]!;
    expect(game.state.phase).toBe('finished');
    expect(game.state.finished.reason).toBe('catalogUpdated');
    expect(game.version).toBe(1);
    const room = (await db.query<{ status: string; config: { categories: string[]; lifelines: Record<string, boolean> } }>('select status, config from public.rooms')).rows[0]!;
    expect(room.status).toBe('finished');
    expect(room.config.categories).toHaveLength(6);
    expect(room.config.lifelines).not.toHaveProperty('extraTime');
    expect((await db.query(`select 1 from public.categories where slug in ('megafy', 'latinoamerica')`)).rows).toHaveLength(0);
    expect((await db.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'kicked_at'`)).rows).toHaveLength(0);
    await expect(db.query(`insert into public.categories (slug, name, color) values ('otra', 'Otra', '#FFFFFF')`)).rejects.toThrow(/supported_category_slug/);
  });
});
