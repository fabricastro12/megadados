'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Toon } from '@/ui/Toon';
import { hydrateSettings, useSettings } from './settingsStore';

const SIZES = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grande' },
  { value: 'huge', label: 'Enorme' },
] as const;

/** The gear button and the settings sheet, available on every screen. */
export function Settings() {
  const s = useSettings();

  useEffect(() => {
    hydrateSettings();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'm' || e.key === 'M') useSettings.getState().set({ muted: !useSettings.getState().muted });
      if (e.key === 'Escape') useSettings.getState().set({ open: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.text = s.textSize;
  }, [s.textSize]);

  return (
    <>
      <button
        type="button"
        aria-label="Ajustes"
        onClick={() => s.set({ open: true })}
        className="btn fixed right-3 top-3 z-40 !min-h-0 h-12 w-12 !p-0"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      </button>

      <AnimatePresence>
        {s.open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => s.set({ open: false })}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              className="w-full max-w-md rounded-t-[2rem] border-4 border-b-0 border-ink bg-white px-6 pb-8 pt-3"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#9FB3D6]" />
              <div className="mb-4 flex items-center justify-between">
                <Toon as="h2" size="md" className="!text-[2rem]">
                  <span id="settings-title">Ajustes</span>
                </Toon>
                <button type="button" className="btn btn-go" onClick={() => s.set({ open: false })}>
                  Listo
                </button>
              </div>

              <label className="mb-1 flex justify-between font-extrabold" htmlFor="music">
                Música <span className="font-bold text-ink-soft">{Math.round(s.music * 100)} %</span>
              </label>
              <input id="music" type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => s.set({ music: Number(e.target.value) })} className="mb-4 w-full accent-[#2E8BFF]" />
              <label className="mb-1 flex justify-between font-extrabold" htmlFor="effects">
                Efectos <span className="font-bold text-ink-soft">{Math.round(s.effects * 100)} %</span>
              </label>
              <input id="effects" type="range" min={0} max={1} step={0.05} value={s.effects} onChange={(e) => s.set({ effects: Number(e.target.value) })} className="mb-5 w-full accent-[#2E8BFF]" />

              <label className="flex items-center gap-4 border-t-[3px] border-dashed border-[#D4E3F2] py-4">
                <span className="flex-1">
                  <span className="block font-extrabold">Silenciar todo</span>
                  <span className="text-sm font-semibold text-ink-soft">En compu, con la tecla M</span>
                </span>
                <input id="muted" type="checkbox" role="switch" checked={s.muted} onChange={(e) => s.set({ muted: e.target.checked })} className="h-7 w-7 accent-[#2CC56F]" />
              </label>
              <label className="flex items-center gap-4 pb-4">
                <span className="flex-1">
                  <span className="block font-extrabold">Modo liviano</span>
                  <span className="text-sm font-semibold text-ink-soft">Ruleta y fondo más simples. Se prende solo si tu equipo anda lento.</span>
                </span>
                <input id="light" type="checkbox" role="switch" checked={s.light} onChange={(e) => s.set({ light: e.target.checked, lightAuto: false })} className="h-7 w-7 accent-[#2CC56F]" />
              </label>

              <fieldset className="border-t-[3px] border-dashed border-[#D4E3F2] pt-4">
                <legend className="mb-3 font-extrabold">Tamaño de letra</legend>
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((size) => (
                    <label key={size.value} className={`btn !min-h-12 !px-2 ${s.textSize === size.value ? 'btn-gold' : ''}`}>
                      <input
                        type="radio"
                        name="text-size"
                        value={size.value}
                        checked={s.textSize === size.value}
                        onChange={() => s.set({ textSize: size.value })}
                        className="sr-only"
                      />
                      {size.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="mt-4 text-sm font-semibold text-ink-soft">
                Si tu sistema pide menos movimiento, la ruleta y el confetti se reemplazan por transiciones suaves.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
