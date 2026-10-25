'use client';

import { create } from 'zustand';

export interface SettingsState {
  music: number;
  effects: number;
  muted: boolean;
  /** Simpler 3D, no post-processing. Turned on automatically on weak GPUs. */
  light: boolean;
  lightAuto: boolean;
  textSize: 'normal' | 'large' | 'huge';
  open: boolean;
  set(partial: Partial<Omit<SettingsState, 'set'>>): void;
}

const KEY = 'megadados-settings';

function load(): Partial<SettingsState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  music: 0.6,
  effects: 0.85,
  muted: false,
  light: false,
  lightAuto: true,
  textSize: 'normal',
  open: false,
  set: (partial) => {
    set(partial);
    const { music, effects, muted, light, lightAuto, textSize } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ music, effects, muted, light, lightAuto, textSize }));
    } catch {
      // Private mode: settings just won't persist.
    }
  },
}));

export function hydrateSettings(): void {
  if (typeof window === 'undefined') return;
  useSettings.setState(load());
}
