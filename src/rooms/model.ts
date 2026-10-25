import { z } from 'zod';
import { GameConfigSchema } from '@/game/config';

export const AVATAR_COLORS = ['violet', 'blue', 'green', 'yellow', 'orange', 'pink'] as const;
export const AVATAR_FACES = ['happy', 'cool', 'wink', 'surprised', 'tongue'] as const;

export const AvatarSchema = z.object({
  color: z.enum(AVATAR_COLORS),
  face: z.enum(AVATAR_FACES),
});
export type Avatar = z.infer<typeof AvatarSchema>;

export const PlayerNameSchema = z.string().trim().min(1, 'Escribí tu nombre.').max(24, 'Usá hasta 24 letras.');

/** Default team names: Andean animals, shared by the five countries on the team. */
export const TEAM_PRESETS = [
  { name: 'Cóndores', color: '#2E8BFF' },
  { name: 'Llamas', color: '#FF6A3D' },
  { name: 'Colibríes', color: '#2CC56F' },
  { name: 'Pumas', color: '#FFB31A' },
  { name: 'Vicuñas', color: '#9B5CFF' },
  { name: 'Tucanes', color: '#FF5DAA' },
  { name: 'Jaguares', color: '#1C8A4C' },
  { name: 'Quetzales', color: '#1A5FC4' },
] as const;

export const CreateRoomSchema = z.object({ name: PlayerNameSchema, avatar: AvatarSchema });

export const JoinRoomSchema = z.discriminatedUnion('as', [
  z.object({ as: z.literal('player'), name: PlayerNameSchema, avatar: AvatarSchema }),
  z.object({ as: z.literal('spectator') }),
]);

/** Everything the lobby can change; host-only actions are checked by the service. */
export const LobbyActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('updateProfile'), name: PlayerNameSchema, avatar: AvatarSchema }),
  z.object({ type: z.literal('updateConfig'), config: GameConfigSchema }),
  z.object({ type: z.literal('assignTeam'), playerId: z.uuid(), teamId: z.uuid().nullable() }),
  z.object({ type: z.literal('shuffleTeams') }),
  z.object({ type: z.literal('renameTeam'), teamId: z.uuid(), name: z.string().trim().min(1).max(24) }),
  z.object({ type: z.literal('kick'), playerId: z.uuid() }),
  z.object({ type: z.literal('claimHost'), pin: z.string().regex(/^\d{4}$/).optional() }),
  z.object({ type: z.literal('heartbeat') }),
]);
export type LobbyAction = z.infer<typeof LobbyActionSchema>;

export interface LobbyPlayer {
  id: string;
  name: string;
  avatar: Avatar;
  role: 'host' | 'player' | 'spectator';
  teamId: string | null;
}

export interface LobbySnapshot {
  room: { code: string; status: 'lobby' | 'playing' | 'finished'; config: z.infer<typeof GameConfigSchema>; hostPlayerId: string | null };
  players: LobbyPlayer[];
  teams: { id: string; name: string; color: string }[];
  categories: { id: string; slug: string; name: string; color: string; icon: string }[];
}

/** A host that has not been seen for this long can be replaced by anyone in the room. */
export const HOST_STALE_MS = 45_000;
