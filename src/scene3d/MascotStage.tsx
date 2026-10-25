'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
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

/** The Megafy mascot reacting to the game; decorative, so hidden from screen readers. */
export default function MascotStage({ pose, className = '', style }: { pose: MascotPoseName; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={style} aria-hidden="true">
      <Canvas flat dpr={[1, 2]} camera={{ position: [0, 1.45, 7], fov: 28 }} gl={{ alpha: true }}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 5, 6]} intensity={2.4} />
        <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#9EDCF8" />
        <MascotModel pose={pose} />
      </Canvas>
    </div>
  );
}
