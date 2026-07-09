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
| 10 | Mobile + responsive | ✅ done | `lib/engine/responsive.ts` (device tier + count scaling + tick rate cap), useGlContextRecovery hook, engine UI media queries (≤639 / 640–1023 / ≥1024), 13 responsive tests, total 101/101 |
| 11 | Browser compat | ✅ done | webglcontextlost / webglcontextrestored listener + MutationObserver re-attach, prefers-reduced-motion media query, Safari WebKit detection, print-mode hide, coarse-pointer :hover suppression |
| 12 | v1 acceptance | ✅ done | 101/101 tests pass, typecheck clean, `next build` clean. **v1.0** shipped |
| 13 | VisualDNA pipeline | ✅ done | `lib/visual/dna.ts` (sharp + k-means palette + Sobel edges + composition), `/api/visual/dna` POST endpoint, `lib/visual/bindings.ts` (DNA → ShaderGraph param deltas), Prisma migration `add_visual_dna`, engine store `setVisualDNA` action, 2 visual-driven seeds (sunset + moonscape). Tests 116/116. Stage 13/30 of Long Horizon roadmap. |
| 14 | VisualDNA end-to-end | ✅ done | `/api/visual/create` POST endpoint (saves Artwork from VisualDNA + DNA-derived shaderGraph). `components/create/UploadPanel.tsx` — drag-drop upload, preview, palette + 6 feature bars, create button. `/create` page now: list audio + list visual + upload panel. `ParameterPanel` has Visual DNA accordion with palette + features + influence slider that scales the bound params live. `EngineView` loads visualDNA on artwork mount, applies bindings, shows palette + DNA in title strip. Browser/client safe helper split out into `lib/visual/palette-name.ts` (no sharp dep). Tests 123/123 (+7 visual-flow). |
| 15 | Public gallery | ✅ done | `/gallery` route — server-rendered grid of all Artwork records. `components/gallery/ArtworkTile.tsx` — source-specific thumbnails (palette swatch / audio glyph / planetary wheel / natal wheel / system glyph). Filter chips: source · system · palette (URL-driven). 13 seed artworks in DB (3 audio + 3 planetary + 2 sand + 2 de Jong + 5 visual). `/a/[id]` polished: 3-section layout (hero / genome reveal / related artworks / footer); ↓ Polaroid + ↓ Video download CTAs; remix CTA via `/create?remix=[id]`. Stage 15/30 of Long Horizon roadmap. |
| 16 | Reaction-Diffusion | ✅ done | Gray-Scott Turing patterns. CPU solver at 512×512, ping-pong Float32Arrays, palette-mapped render to CanvasTexture on a 3D plane. `lib/engine/reaction-diffusion.ts` + `lib/engine/shaders/` (skipped — CPU render) + `components/engine/ReactionDiffusion.tsx`. 15 tests covering determinism, parameter stability, preset regimes. Dispatch manifest: `lib/engine/dispatch-reaction-diffusion.ts`. Seeds: `rd-mitosis` (F=0.0367, k=0.0649), `rd-stripes` (F=0.022, k=0.051). Tests 187/187 (baseline 144 + 15 new). Stage 16/30. |
| 17 | Lorenz Attractor | ✅ done | 3D strange attractor (Lorenz 1963), classical σ=10, ρ=28, β=8/3 with seed-jittered but bounded variants. RK4 integration dt=0.005, 8000-point circular trail buffer. THREE.Line + custom ShaderMaterial (NOT Line2 — its InterleavedBuffer array/count is read-only in @types/three). `lib/engine/lorenz-attractor.ts` + `lib/engine/shaders/lorenz-render.ts` + `components/engine/LorenzAttractor.tsx`. 12 tests covering determinism, RK4 smoothness, boundedness, circular buffer. Dispatch: `lib/engine/dispatch-lorenz-attractor.ts`. Seeds: `lorenz-butterfly` (8000 trail, ink palette), `lorenz-figure-eight` (6000 trail, aurora palette, orbit camera). Tests 187/187. Stage 17/30. |
| 18 | Slime Mold (Physarum) | ✅ done | Agent-based simulation (Jeff Jones 2010 model). CPU step bounded at 2000 agents for tests; runtime path uses 3 GLSL shaders (compute + deposit + render) with ping-pong RTs. 65536 agents / 16384 on low tier. RGBA32F agent texture packing (x, y, heading, agentSeed). `lib/engine/physarum.ts` + 3 shader files + `components/engine/Physarum.tsx`. 16 tests covering determinism, agent stepping, sense/decide, decay, boundedness. Dispatch: `lib/engine/dispatch-physarum.ts`. Seed: `physarum-network` (65536 agents, moss palette). Tests 187/187. Stage 18/30. |
| 19 | Reactions (hearts) | ✅ done | Anonymous lightweight likes on `/a/[id]`. New `Reaction` Prisma model (unique on `(artworkId, likerId, kind)`). `lib/reaction-store.ts`: `toggleReaction`, `getReactionSummary`, `countReactionsForArtworks`, `topReactedArtworks`. `/api/reactions` POST/GET. `components/share/HeartButton.tsx`: client UI with localStorage session id + optimistic update + revert-on-failure. 8 tests. 220/220 tests pass. Stage 19/30. |
| 20 | Collections | ✅ done | Curated named sets of artworks. New `Collection` + `CollectionItem` Prisma models. `lib/collection-store.ts`: `addOrUpdateCollection` (idempotent on slug), `getCollectionBySlug`, `listCollections`, `deleteCollection` (cascades). `/c/[slug]` page renders ordered grid with numbered tiles. `/collections` index page lists all collections with curator + count. Seed: 3 collections (living-patterns, tarbell-2004, image-as-genome). 6 tests. 226/226 tests pass. Stage 20/30. |
| 21 | Search & Discovery | ✅ done | `/explore` route with full-text query + facet filters (system / palette / source) + 4 sort modes (newest / oldest / most-reacted / similar). `lib/discovery.ts`: L2 distance over AudioDNA / VisualDNA vectors (tempo-normalised, cross-medium penalty, deterministic tiebreak). `/a/[id]` "More like this" section now ranks by genome distance (was system+palette match). `/api/search` returns lightweight metadata for incremental client search. 13 tests. 239/239 tests pass. Stage 21/30. |
| 22 | Polaroid Wall | ✅ done | `/polaroids` page renders a masonry grid of every captured polaroid in `public/captures/`. `lib/engine/polaroid-meta.ts`: `listAllPolaroids()` aggregates sidecar JSONs across all artworks. Lazy-loaded images, system+palette tag, captured timestamp + hash. Empty state when no captures exist. 6 tests. 245/245 tests pass. Stage 22/30. |
| 23 | Atom Feed | ✅ done | `/feed.xml` server-rendered Atom 1.0 feed of the latest 50 artworks. Each entry carries id/url/title/author/updated + category tags (system, palette) + an `lh:hash` extension carrying the artwork hash. Content-Type: `application/atom+xml; charset=utf-8`. 8 tests. 253/253 tests pass. Stage 23/30. |
| 24-28 | Mood Variants + Lightbox | ✅ done | Every artwork (gallery + polaroid wall) gets 6 mood variants: Morning / Afternoon / Night / Winter / Decay / Rebirth. Each mood is a deterministic palette + camera + postFx override of the parent's ShaderGraph — engine system and params preserved. `lib/moods.ts`: 6 presets, `applyMood`, `moodVariants`, `variantId`, `parseVariantId`. `lib/variant-resolver.ts`: `${parentId}--${mood}` URL → Artwork object. `/api/artworks/[id]` and `/a/[id]` route through the resolver. `components/share/MoodLightbox.tsx`: click tile → modal with 6 variant tiles → click mood → `/engine/[variantId]`. ESC closes; body scroll locked while open. 18 new tests (moods determinism, resolver, mood variants preserve audioDNA + visualDNA). 314/314 tests pass · typecheck clean · build clean. Stages 24-28/30. |

---

## Cycle 1 Wave 1 (subagent-swarm) — 2026-07-09

**Pattern**: 3 system workers in parallel git worktrees (`wt/reaction-diffusion`, `wt/lorenz-attractor`, `wt/physarum`). Each built end-to-end and was forbidden from touching shared files. Orchestrator (me) applied integration after all 3 PASS.

**Worktree infrastructure**: `node_modules` symlinked from parent project. Pre-existing prisma dev.db + tmp/corpus copied. `vitest.config.ts` patched to default `DATABASE_URL` so DB-touching tests run without env prefix. Turbopack panics on symlinked `node_modules` — workers used `next build --webpack` as a local workaround; orchestrator reverted it on main since main's node_modules is a real directory and Turbopack works fine there.

**Slice results**:
- Reaction-Diffusion: PASS. 4 files. 15 tests added. Summary: `out/reaction-diffusion/summary.md` (worktree).
- Lorenz Attractor: PASS. 5 files. 12 tests added. Summary: `out/lorenz-attractor/summary.md` (worktree).
- Physarum: PASS. 7 files. 16 tests added. Summary: `out/physarum/summary.md` (worktree).

**Integration (orchestrator)**:
- `lib/types.ts`: extended `LivingSystemName` union
- `components/engine/EngineCanvas.tsx` + `ShareableViewer.tsx`: dispatch arms for the 3 new systems
- `lib/engine/store.ts`: `resetParams` handles the 3 new systems (their default param sets)
- `components/engine/ParameterPanel.tsx`: header display name + `defaultParamsFor()` extended
- `app/gallery/page.tsx`: `SYSTEM_LABELS` + `SYSTEM_DESCRIPTIONS` for new systems
- `prisma/seed.ts`: 5 new seed artworks (2 RD + 2 LZ + 1 PM)

**Final verification**: 187/187 tests pass · typecheck clean · build clean · 20 seed artworks in DB (3 audio + 3 planetary + 2 sand + 2 de Jong + 5 visual + 5 new).

**Commits**:
- `50528a5` Preflight: default DATABASE_URL in vitest env
- `0ef18bd` Stage 16: Reaction-Diffusion (merge of wt/reaction-diffusion)
- `809e55e` Stage 16: Reaction-Diffusion (the actual merge commit)
- `f05d1e9` Stage 17: Lorenz Attractor (merge)
- `ec5603a` Stage 18: Slime Mold (merge)
- `55a4489` Revert build --webpack flag (worktree-only workaround)
- `a8baae0` Stages 16-18 integration: extend LivingSystemName + dispatch + resetParams + seeds

**Lessons**:
1. Each system worker's dispatch manifest was a `lib/engine/dispatch-<name>.ts` file — clean way to ship a system's contract without touching shared files.
2. Function hoisting in TS strict mode isn't always reliable when `await` is involved — declaring helper functions before main() avoids the issue.
3. Turbopack doesn't follow symlinked node_modules — webpack is the workaround; main project (real node_modules) is unaffected.

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