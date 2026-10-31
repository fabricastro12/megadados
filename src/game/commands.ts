import { z } from 'zod';
import { LIFELINES } from './config';

const id = z.string().min(1).max(64);
const choice = z.number().int().min(0).max(3);

export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spin') }),
  z.object({ type: z.literal('pickCategory'), categoryId: id }),
  z.object({ type: z.literal('answer'), questionId: id, choice }),
  z.object({ type: z.literal('vote'), questionId: id, choice }),
  z.object({ type: z.literal('useLifeline'), lifeline: z.enum(LIFELINES) }),
  z.object({ type: z.literal('audienceVote'), questionId: id, choice }),
  /** Any client sends it when its countdown runs out; it only advances a phase whose deadline passed. */
  z.object({ type: z.literal('tick') }),
  // Host controls.
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('skip') }),
  z.object({ type: z.literal('adjustPoints'), ownerId: id, delta: z.number().int().min(-10_000).max(10_000) }),
  // Server only: a player joined a game in progress.
  z.object({
    type: z.literal('addPlayer'),
    player: z.object({ id, name: z.string().min(1).max(24), teamId: id.nullable() }),
  }),
]);

export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];

/** Commands a browser may send; the rest are host-only or server-only. */
export const CLIENT_COMMANDS = ['spin', 'pickCategory', 'answer', 'vote', 'useLifeline', 'audienceVote', 'tick'] as const;
export const HOST_COMMANDS = ['pause', 'resume', 'end', 'skip', 'adjustPoints'] as const;
