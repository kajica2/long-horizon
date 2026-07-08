# BeatRender Genesis — Build Stages

12 stages. Each one independently runnable and reviewable. Stop after any stage to give feedback before proceeding.

**Source documents:**
- `/workspace/beatrender-genesis.md` — product spec (manifesto + v1 user flow + roadmap)
- `/workspace/beatrender-genesis-engine.md` — technical scoping (data model + Flow Field Meditation v1)
- `/workspace/beatrender-genesis/STAGE2_DECISION.md` — essentia.js vs meyda decision rationale

---

## Status

| # | Stage | Status | Notes |
|---|-------|--------|-------|
| 0 | Project skeleton | ✅ done | Next.js 16 + TS + Tailwind v4 + R3F deps. All routes stubbed. |
| 1 | Data model + persistence | ✅ done | Prisma + SQLite, 3 seed artworks with synthesized audio, 11 tests pass. |
| 2 | AudioDNA pipeline | ✅ done | essentia.js + ffmpeg, real extraction, 6 tests pass. Total 17/17. |
| 3 | Engine stub (Flow Field Meditation) | ✅ done | R3F + manual GPGPU + curl noise shaders + 4 camera modes. Build clean. |
| 3c | Living System switching | ✅ done | EngineCanvas dispatches to ParticleSystem, CosmicFilaments, SandTraveler, or DeJongAttractor |
| 3d | Polaroid proofs | ✅ done | Static renders for 3 planetary + 2 sand + 2 de Jong moments |
| 3e | Sand Traveler port | ✅ done | Tarbell Sonar 2004 piece: 200 cities, sand-painter accumulation, cream-paper, 10 tests |
| 3f | de Jong Attractor port | ✅ done | Tarbell 2004 piece: 4000 travelers, de Jong map (Bourke params), ink-on-cream, 9 tests |
| 4 | Reproducibility test | ✅ done | 10 determinism tests — filament byte-identical, hash stable across key reorder, planetary changes reflected in hash, two engines produce same output |
| 5 | Audio reactivity | ✅ done | Web Audio API + AnalyserNode + bass/mid/treble/onset with attack/release smoothing; player UI; bloom pulse on transients; 8 tests |
| 6 | 3D Birth Chart | ✅ done | Placidus houses, ascendant/MC, 5 aspects, 3D rotatable wheel with orbit controls; 3 demo charts (Kepler, Cage, Tarbell); 16 tests |
| 7 | Parameter panel | ✅ done | Right-rail accordion UI; sliders + numeric inputs; 2x2 audio bindings grid; per-group reset; 5 tests |
| 8 | MP4 recording | ✅ done | Polaroid PNG (canvas.toBlob) + WebM 5s video (MediaRecorder); uploads to /public/captures/; 2 tests |
| 9 | Shareable page | ✅ done | /a/[id] public route, no chrome, live engine + metadata strip + Remix action; 3 tests |
| 7 | User interactions | ⏸ | Mouse / scroll / click |
| 7 | Parameter panel | ⏸ | UI sliders bound to shader graph |
| 8 | MP4 recording | ⏸ | MediaRecorder integration |
| 9 | Save + shareable link | ⏸ | POST Artwork → self-contained /a/[id] |
| 10 | Landing page installation | ⏸ | Flow Field on `/` |
| 11 | Polish + v1 acceptance | ⏸ | All 7 acceptance criteria pass |

---

## Stage 0 — Project skeleton ✅

## Stage 1 — Data model + persistence ✅

## Stage 2 — AudioDNA pipeline ✅

**Goal:** Upload MP3 → get AudioDNA profile.

**Library decision:** essentia.js (full rationale in `STAGE2_DECISION.md`). The decision was forced by capability: meyda has no native BPM, key, or onset-rate detection, and our `AudioDNA` schema requires all three.

**Deliverables landed:**
- `lib/audio/decode.ts` — ffmpeg-based MP3/WAV/OGG/FLAC/M4A → mono PCM at 22050 Hz
- `lib/audio/analyze.ts` — essentia.js wrapper. Per-frame: RMS, ZCR, spectral centroid, MFCC, spectral flux. Whole-signal: KeyExtractor, BeatTrackerMultiFeature, OnsetRate
- `lib/audio/normalize.ts` — raw features → AudioDNA in [0, 1] ranges
- `lib/audio/extract-dna.ts` — orchestrator with per-process hash-keyed cache
- `app/api/audio/dna/route.ts` — POST endpoint, accepts multipart upload (max 50MB)
- `next.config.ts` — ffmpeg-installer + essentia.js marked as serverExternalPackages
- `prisma/seed.ts` — demo artworks now derive AudioDNA from real analysis
- `tests/audio-dna.test.ts` — 6 tests for determinism, range, cache, hash stability
- `types/shims.d.ts` — type declarations for libs without @types packages

**Done criteria:**
- ✅ `POST /api/audio/dna` accepts upload, returns Soundtrack + AudioDNA + cached flag
- ✅ Same bytes → byte-identical AudioDNA across calls
- ✅ All normalized fields in [0, 1]
- ✅ Cache works (re-uploads within session skip recomputation)
- ✅ Demo artworks seeded with real analyzed AudioDNA values
- ✅ 17/17 tests pass (11 roundtrip + 6 audio-dna)

**Try it:**
```bash
cd /workspace/beatrender-genesis
npm run dev   # → http://localhost:3000
# curl with one of the demo files:
curl -F "file=@public/demo/drift.wav" http://localhost:3000/api/audio/dna
```

**Notes:**
- ffmpeg binary is bundled via `@ffmpeg-installer/ffmpeg` — works on Linux/macOS/Windows without system ffmpeg
- Cache is in-memory only. For cross-process caching, Artwork records already store AudioDNA (Stage 9+ can add a separate AudioDNA table if needed)
- Normalization ranges in `lib/audio/normalize.ts` are tuned against the synthetic benchmark corpus. For production we'd derive them from a real labeled music corpus. Easy to swap — single file change.
- essentia.js is AGPL-3.0 — fine for server-side use. Only matters if we ever ship it to the browser.

---

## Stage 3 — Engine stub (Flow Field Meditation) ✅

**Goal:** Visual proof the engine works.

**Deliverables landed:**

*lib/engine/*

- `shaders/curl-noise.ts` — Ashima 3D simplex noise + curl-of-vector-noise GLSL
- `shaders/particle-compute.ts` — per-particle integration shader (semi-implicit Euler, age-based respawn)
- `shaders/particle-render.ts` — vertex/fragment for additive points + 6 palettes
- `shaders/background.ts` — slow-evolving fbm nebula behind particles
- `particles.ts` — GPGPU manager class (ping-pong render targets, fixedDt simulation)
- `camera-modes.ts` — pure simTime → camera transform for 5 modes
- `store.ts` — Zustand store for engine state + shader graph

*components/engine/*

- `EngineCanvas.tsx` — R3F Canvas wrapper
- `ParticleSystem.tsx` — owns compute + render for the particles
- `BackgroundLayer.tsx` — palette-aware nebula
- `CameraRig.tsx` — applies camera mode each frame
- `PostFX.tsx` — Bloom + ChromaticAberration + Noise + Vignette
- `EngineControls.tsx` — minimal HUD: pause, reset, camera selector, sim time

*Routes*

- `app/engine/[id]/page.tsx` + `EngineView.tsx` — standalone viewer
- `app/create/page.tsx` — updated to show 3 demo artworks as entry points

**Architecture decisions (locked):**

- **Manual GPGPU** instead of `GPUComputationRenderer` — full control over determinism
- **`fixedDt = 1/60s`** simulation clock, independent of render FPS → reproducibility holds across devices
- **Curl noise sampled per-step in the shader**, not precomputed as a 3D texture — simpler, less GPU memory, identical determinism
- **2 RGBA32F ping-pong render targets** for positions (xyz + age) and velocities (xyz + per-particle seed)
- **Seeded respawn** — when particles age out or leave bounds, they respawn at a seed+time-derived position
- **Audio reactivity is parameterized, not state-mutating** — same PCM at same simTime produces identical state, even with different audio reactivity timings

**Done criteria:**

- ✅ `npm run build` clean — `/engine/[id]` route generated
- ✅ `npm test` — 17/17 still passing (no test regressions)
- ✅ `npm run typecheck` — zero errors
- ⏳ Browser verification needed: open `/engine/demo-driftwav` to see the particles evolve

**Try it:**
```bash
cd /workspace/beatrender-genesis
npm run dev
# open http://localhost:3000/engine/demo-driftwav
# open http://localhost:3000/engine/demo-shimmerwav
# open http://localhost:3000/engine/demo-pulsewav
```

You'll see 250k particles drifting through a curl-noise field with bloom + chromatic aberration + film grain. Same seed → identical first frame on reload. Camera modes (drone / orbit / meditation drift / inside) selectable from the bottom bar.

**Known limitations (intentional, will be addressed in later stages):**

- No audio reactivity yet (Stage 5) — bass/mid/treble uniforms are at 0
- No mouse interactions (Stage 6) — camera is purely deterministic
- No parameter panel UI (Stage 7) — shader graph params don't change live
- No MP4 recording (Stage 8)
- Reset uses a `key` prop rebuild — works but is heavier than needed

**Performance expectations:**

- 250k particles, 60Hz sim, 60fps render: achievable on 2020-era hardware with discrete GPU
- Integrated GPUs: drop particle count to 100-150k via the parameter (Stage 7)
- Mobile: not a v1 target; will revisit in Phase 2