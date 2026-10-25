'use client';

import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import type { SpinState } from '@/game';
import type { CategoryLook } from '@/features/game/catalog';
import { landingAngle, wheelAngle } from '@/features/game/Wheel';
import { serverNow } from '@/realtime/clock';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { degradeToLight } from '../useThreeD';

const INK = '#1C2A66';
const RADIUS = 2;
const DEPTH = 0.22;
const BULBS = 24;

/** Three flat bands of light: the cartoon look of the 2D screens, in 3D. */
function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([110, 110, 110, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function wedge(from: number, to: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const steps = Math.max(8, Math.ceil((to - from) / (Math.PI / 32)));
  // Angles run clockwise from the top, like the 2D wheel.
  for (let k = 0; k <= steps; k++) {
    const a = from + ((to - from) * k) / steps;
    shape.lineTo(RADIUS * Math.sin(a), RADIUS * Math.cos(a));
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 2, curveSegments: 4 });
}

/** The category icons as textures, drawn from the same SVGs the 2D screens use. */
function useIconTextures(icons: string[]): Map<string, THREE.Texture> {
  const key = icons.join('|');
  const [textures, setTextures] = useState(new Map<string, THREE.Texture>());
  useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    Promise.all(
      [...new Set(icons)].map(
        (icon) =>
          new Promise<[string, THREE.Texture]>((resolve, reject) => {
            const color = icon === 'crown' ? INK : '#ffffff';
            const svg = renderToStaticMarkup(<CategoryIcon icon={icon} size={128} color={color} />);
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 128;
              canvas.getContext('2d')!.drawImage(image, 0, 0, 128, 128);
              const texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              made.push(texture);
              resolve([icon, texture]);
            };
            image.onerror = reject;
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
          }),
      ),
    )
      .then((entries) => alive && setTextures(new Map(entries)))
      .catch(() => undefined);
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return textures;
}

function WheelModel({ segments, spin, pausedAt }: { segments: CategoryLook[]; spin: SpinState | null; pausedAt: number | null }) {
  const rotor = useRef<THREE.Group>(null);
  const pointer = useRef<THREE.Group>(null);
  const bulbs = useRef<THREE.MeshStandardMaterial[]>([]);
  const n = segments.length;
  const step = (Math.PI * 2) / n;
  const gradient = useMemo(toonGradient, []);
  const geometries = useMemo(() => segments.map((_, i) => wedge(i * step, (i + 1) * step)), [segments, step]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const icons = useIconTextures(segments.map((s) => s.icon));
  const reduce = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useFrame((state) => {
    const now = pausedAt ?? serverNow();
    const degrees = reduce && spin ? landingAngle(spin.segment, n, 0) : wheelAngle(spin, n, now);
    if (rotor.current) rotor.current.rotation.z = -THREE.MathUtils.degToRad(degrees);
    const spinning = !!spin && now < spin.startedAt + spin.durationMs && pausedAt === null;
    // The pointer flicks back each time a peg passes under it.
    const frac = (degrees % (360 / n)) / (360 / n);
    if (pointer.current) pointer.current.rotation.z = spinning ? 0.35 * Math.max(0, 1 - frac * 5) : 0;
    const t = state.clock.elapsedTime;
    bulbs.current.forEach((m, i) => {
      if (!m) return;
      m.emissiveIntensity = spinning ? ((i + Math.floor(t * 14)) % 3 === 0 ? 4 : 0.4) : 1.2 + 0.8 * Math.sin(t * 2 + i * 0.6);
    });
  });

  return (
    <group rotation-x={-0.18}>
      {/* Rim and back plate stay still; the rotor turns inside them. */}
      <mesh rotation-x={Math.PI / 2} position-z={-0.05}>
        <cylinderGeometry args={[RADIUS + 0.22, RADIUS + 0.22, 0.3, 96]} />
        <meshToonMaterial color={INK} gradientMap={gradient} />
      </mesh>
      <mesh position-z={DEPTH + 0.02}>
        <torusGeometry args={[RADIUS + 0.13, 0.1, 12, 96]} />
        <meshToonMaterial color={INK} gradientMap={gradient} />
      </mesh>
      {Array.from({ length: BULBS }, (_, i) => {
        const a = (i / BULBS) * Math.PI * 2;
        return (
          <mesh key={i} position={[(RADIUS + 0.13) * Math.sin(a), (RADIUS + 0.13) * Math.cos(a), DEPTH + 0.12]}>
            <sphereGeometry args={[0.065, 12, 8]} />
            <meshStandardMaterial ref={(m) => void (bulbs.current[i] = m!)} color="#FFE9A8" emissive="#FFD23F" emissiveIntensity={1} toneMapped={false} />
          </mesh>
        );
      })}

      <group ref={rotor}>
        {segments.map((c, i) => (
          <group key={c.id + i}>
            <mesh geometry={geometries[i]}>
              <meshToonMaterial color={c.color} gradientMap={gradient} />
            </mesh>
            {/* Peg between segments, also the dark seam of the 2D wheel. */}
            <group rotation-z={-i * step}>
              <mesh position={[0, RADIUS / 2, DEPTH + 0.06]}>
                <boxGeometry args={[0.06, RADIUS, 0.04]} />
                <meshBasicMaterial color={INK} />
              </mesh>
              <mesh position={[0, RADIUS - 0.08, DEPTH + 0.1]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.05, 0.05, 0.12, 10]} />
                <meshToonMaterial color="#ffffff" gradientMap={gradient} />
              </mesh>
            </group>
            {icons.get(c.icon) && (
              <group rotation-z={-(i + 0.5) * step}>
                <mesh position={[0, RADIUS * 0.66, DEPTH + 0.065]}>
                  <planeGeometry args={[0.62, 0.62]} />
                  <meshBasicMaterial map={icons.get(c.icon)} transparent depthWrite={false} />
                </mesh>
              </group>
            )}
          </group>
        ))}
      </group>

      {/* Hub */}
      <mesh rotation-x={Math.PI / 2} position-z={DEPTH + 0.1}>
        <cylinderGeometry args={[0.42, 0.46, 0.2, 40]} />
        <meshToonMaterial color="#ffffff" gradientMap={gradient} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-z={DEPTH + 0.22}>
        <cylinderGeometry args={[0.18, 0.2, 0.08, 32]} />
        <meshStandardMaterial color="#FFD23F" emissive="#FFB31A" emissiveIntensity={0.6} />
      </mesh>

      {/* Pointer at the top, hinged at its base. */}
      <group ref={pointer} position={[0, RADIUS + 0.38, DEPTH + 0.2]}>
        <mesh position-y={-0.2} rotation-z={Math.PI}>
          <coneGeometry args={[0.2, 0.46, 3]} />
          <meshToonMaterial color="#FF4D5A" gradientMap={gradient} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshToonMaterial color={INK} gradientMap={gradient} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * The 3D wheel. It turns from the same server-chosen spin and the same angle function as the 2D
 * wheel, so every screen lands on the same segment at the same moment.
 */
export default function Wheel3D({
  segments,
  spin,
  size,
  pausedAt = null,
  effects = false,
  label,
}: {
  segments: CategoryLook[];
  spin: SpinState | null;
  size: number;
  pausedAt?: number | null;
  /** Bloom on the rim bulbs and a soft vignette; for the TV. */
  effects?: boolean;
  label?: string;
}) {
  return (
    <div style={{ width: size, height: size }} role="img" aria-label={label ?? 'Ruleta de categorías'}>
      <Canvas flat dpr={[1, effects ? 2 : 1.5]} camera={{ position: [0, 0, 6.6], fov: 44 }} gl={{ alpha: true, antialias: !effects }}>
        <PerformanceMonitor onFallback={degradeToLight} />
        <ambientLight intensity={1.6} />
        <directionalLight position={[2.5, 4, 6]} intensity={2.2} />
        <WheelModel segments={segments} spin={spin} pausedAt={pausedAt} />
        {effects && (
          <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
            <Bloom luminanceThreshold={1} mipmapBlur intensity={0.9} radius={0.6} />
            <Vignette offset={0.35} darkness={0.35} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
