'use client';

import { useRoom } from '@/realtime/roomStore';
import { UI } from '@/theme/tokens';

export interface CategoryLook {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export const CROWN_LOOK: CategoryLook = { id: 'crown', name: 'Corona', color: UI.gold, icon: 'crown' };

/** Name, color and icon for each category id in the room. */
export function useCatalog(): (id: string | null | undefined) => CategoryLook {
  const categories = useRoom((s) => s.lobby?.categories);
  return (id) => {
    if (!id) return CROWN_LOOK;
    const c = categories?.find((x) => x.id === id);
    return c ? { id: c.id, name: c.name, color: c.color, icon: c.icon } : { id, name: 'Categoría', color: '#9B5CFF', icon: 'dice' };
  };
}

/** Display name of a player or team in the current game. */
export function useOwnerName(): (id: string | null | undefined) => string {
  const game = useRoom((s) => s.game?.state);
  return (id) => (id ? (game?.players.find((p) => p.id === id)?.name ?? game?.teams.find((t) => t.id === id)?.name ?? '…') : '…');
}

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
