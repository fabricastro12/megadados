'use client';

import dynamic from 'next/dynamic';
import type { SpinState } from '@/game';
import { useThreeD } from '@/scene3d/useThreeD';
import type { CategoryLook } from './catalog';
import { Wheel } from './Wheel';

// Three.js loads only where the 3D wheel is shown.
const Wheel3D = dynamic(() => import('@/scene3d/wheel/Wheel3D'), { ssr: false });

/** The 3D wheel when the device can take it, the 2D one in light mode. Both land in sync. */
export function WheelView(props: { segments: CategoryLook[]; spin: SpinState | null; size: number; pausedAt: number | null; effects?: boolean }) {
  const threeD = useThreeD();
  const { effects, ...wheel } = props;
  return threeD ? <Wheel3D {...wheel} effects={effects} /> : <Wheel {...wheel} />;
}
