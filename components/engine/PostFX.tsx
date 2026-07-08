"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Vector2 } from "three";
import { useEngineStore } from "@/lib/engine/store";

/**
 * Post-FX chain. Order matters:
 *   1. Bloom — the dominant effect, additive on bright particles
 *   2. Chromatic aberration — subtle color separation
 *   3. Film grain — organic texture
 *   4. Vignette — focuses eye to center
 *
 * Stage 5: bloom intensity is modulated by `audioOnset` so transients pulse
 * visually. The modulation is gentle (multiplier 1.0-1.8) so it doesn't
 * blow out the rest of the chain.
 */
export function PostFX() {
  const postFx = useEngineStore((s) => s.shaderGraph.postFx);
  const audioOnset = useEngineStore((s) => s.audioOnset);

  const bloomRef = useRef<{ intensity: number }>(null);

  useFrame(() => {
    if (!bloomRef.current) return;
    // Onset → bloom pulse (subtle, peaks at 1.8x base)
    const pulse = 1 + audioOnset * 0.8;
    bloomRef.current.intensity = postFx.bloom * pulse;
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        ref={bloomRef as never}
        intensity={postFx.bloom}
        luminanceThreshold={0.1}
        luminanceSmoothing={0.5}
        mipmapBlur
      />
      <ChromaticAberration
        offset={new Vector2(postFx.chromaticAberration, postFx.chromaticAberration)}
        radialModulation={false}
        modulationOffset={0}
      />
      <Noise opacity={postFx.filmGrain} blendFunction={BlendFunction.OVERLAY} />
      <Vignette eskil={false} offset={0.2} darkness={0.5} />
    </EffectComposer>
  );
}
