'use client';

import { useEffect, useState } from 'react';
import { useSettings } from '@/features/settings/settingsStore';

let support: boolean | null = null;

/** WebGL 2 present and a device that is not obviously weak. Checked once per page. */
function capable(): boolean {
  if (support !== null) return support;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const cores = navigator.hardwareConcurrency ?? 4;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    support = !!gl && cores >= 4 && !saveData;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    support = false;
  }
  return support;
}

/**
 * Whether to draw the 3D layer. Light mode (from settings, or switched on automatically when the
 * device is weak or the frame rate drops) falls back to the 2D wheel and the mascot pictures.
 */
export function useThreeD(): boolean {
  const light = useSettings((s) => s.light);
  const lightAuto = useSettings((s) => s.lightAuto);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (lightAuto && !light && !capable()) useSettings.getState().set({ light: true });
    setOk(capable() || !lightAuto);
  }, [light, lightAuto]);
  return ok && !light;
}

/** Called by a scene whose frame rate keeps dropping. */
export function degradeToLight(): void {
  const s = useSettings.getState();
  if (s.lightAuto && !s.light) s.set({ light: true });
}
