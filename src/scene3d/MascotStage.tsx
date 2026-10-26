'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, N8AO } from '@react-three/postprocessing';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createMascot, type MascotPoseName } from './mascot';

function MascotModel({ pose }: { pose: MascotPoseName }) {
  const mascot = useMemo(() => createMascot({ quality: 'high' }), []);
  useEffect(() => () => mascot.dispose(), [mascot]);
  useEffect(() => mascot.setPose(pose), [mascot, pose]);
  useFrame((state, delta) => {
    mascot.update(delta, state.clock.elapsedTime);
    // A slow look around, so it feels alive between reactions.
    mascot.root.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.25;
  });
  return <primitive object={mascot.root} />;
}

/** The mascot stands on y = 0 and is about 2.75 units tall; the camera and the panels aim at its chest. */
const FOCUS: [number, number, number] = [0, 1.4, 0];
const SHADOW_REACH = 2.4;

/**
 * Studio setup from the pose sheet: a warm key from the upper left with the only shadow map,
 * a cool rim from behind the right shoulder, and soft panels in the environment map that put
 * the broad highlights on the plastic. The hemisphere stands in for the sky bouncing off the set.
 * Directional lights aim at the origin (a moved target only counts once it is in the scene), so
 * their positions are the panel positions lowered by the focus height.
 */
function StudioLights() {
  return (
    <>
      <hemisphereLight args={['#FFFFFF', '#A9BDD8', 0.7]} />
      <directionalLight
        castShadow
        position={[-2.6, 4.1, 4.5]}
        intensity={2.8}
        color="#FFF4E6"
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.035}
        shadow-camera-near={1}
        shadow-camera-far={16}
        shadow-camera-left={-SHADOW_REACH}
        shadow-camera-right={SHADOW_REACH}
        shadow-camera-top={SHADOW_REACH}
        shadow-camera-bottom={-SHADOW_REACH}
      />
      <directionalLight position={[4, 0.6, 3]} intensity={1.3} color="#EEF3FA" />
      <directionalLight position={[3, 2.6, -4]} intensity={1.6} color="#CFE6FF" />
      <Environment resolution={256}>
        {/* Key softbox, fill panel, rim ring and a faint floor bounce. */}
        <Lightformer form="rect" intensity={3.6} color="#FFF6EC" position={[-4, 5, 5]} scale={[5, 6, 1]} target={FOCUS} />
        <Lightformer form="rect" intensity={2.2} color="#E6EFFA" position={[5, 2, 4]} scale={[3, 5, 1]} target={FOCUS} />
        <Lightformer form="ring" intensity={2} color="#E4F0FF" position={[3, 4, -5]} scale={4} target={FOCUS} />
        <Lightformer form="rect" intensity={0.35} color="#7FB4E8" position={[0, -4, 1]} scale={[8, 8, 1]} rotation-x={-Math.PI / 2} />
      </Environment>
    </>
  );
}

/** The Megafy mascot reacting to the game; decorative, so hidden from screen readers. */
export default function MascotStage({ pose, className = '', style }: { pose: MascotPoseName; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={style} aria-hidden="true">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ position: [0, 1.5, 7.2], fov: 28 }}
        gl={{ alpha: true, antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.16 }}
        onCreated={({ camera }) => camera.lookAt(...FOCUS)}
      >
        <StudioLights />
        <MascotModel pose={pose} />
        <ContactShadows position={[0, 0.004, 0]} scale={3.6} blur={2.4} opacity={0.5} far={1.4} resolution={512} color="#1B2550" />
        <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
          <N8AO aoRadius={0.3} intensity={1.1} distanceFalloff={0.6} quality="medium" halfRes />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
