# Long Horizon — Living Art Engine

> A computational art engine. Each piece is a unique, evolving system — grown from a seed, shaped by audio or planetary positions, and reproducible from a single string.

A workspace by **Kai Djuric** (`kai@longhorizon.com`). See `AGENTS.md` for AI collaboration context.

## Status

**314/314 tests pass.** Build clean. 8 living systems, 28 seed artworks, 3 collections, 6 mood variants per artwork. See `STAGES.md` for the full build plan and the 28/30 Long Horizon roadmap.

### Living systems shipped

- **Flow Field Meditation** — curl-noise GPGPU particle field, 4 camera modes
- **Cosmic Filaments** — deterministic Line2 strands driven by planetary positions
- **Sand Traveler** — 2D-canvas accumulation, cream paper, auto-reset
- **de Jong Attractor** — 4000-traveler phase-space ink trails
- **Birth Chart** — Placidus houses + ascendant/MC + 5 aspect wheel

### Stack modules

- **AudioDNA** — `essentia.js` + `ffmpeg` (server) → BPM, key, onsets, MFCCs, spectral summary
- **PlanetaryDNA** — `astronomy-engine` → positions of all major bodies + aspect pairs
- **Audio reactivity** — `Web Audio + AnalyserNode` with attack/release smoothing
- **Reproducibility** — fixed-dt simulation clock, mulberry32 + FNV-1a hash seed
- **Engine UI** — Parameter Panel, MP4 Recording, shareable pages, remix

## Run

```bash
npm install
npm run db:migrate        # apply Prisma migrations
npm run db:seed           # 10 seed artworks
npm test                  # 88 tests, ~10s
npm run typecheck         # zero errors
npm run build             # full production build
npm run dev               # → http://localhost:3000
```

## Engine routes

| Route | Purpose |
|---|---|
| `/` | Landing — minimal install entry |
| `/create` | Artwork index — pick a seed or upload an audio file |
| `/engine/[id]` | Interactive engine — full UI, parameter panel, recording |
| `/a/[id]` | Shareable artwork page — embeddable, no chrome |
| `/gallery` | Public gallery grid of all artworks with filters |
| `/explore` | Search + DNA-similarity "more like this" discovery |
| `/collections` | Index of curated artwork collections |
| `/c/[slug]` | Single collection page (ordered artwork grid) |
| `/polaroids` | Polaroid Wall — every captured polaroid across the gallery |
| `/feed.xml` | Atom 1.0 feed of new artworks |
| `/api/audio/dna` | POST — extract AudioDNA from uploaded audio |
| `/api/planetary/dna` | POST — extract PlanetaryDNA for a date+location |
| `/api/visual/dna` | POST — extract VisualDNA from uploaded image |
| `/api/visual/create` | POST — create an Artwork from VisualDNA |
| `/api/artworks/[id]/polaroid` | POST — upload polaroid PNG |
| `/api/artworks/[id]/video` | POST — upload WebM recording |
| `/api/comments` | POST/GET — comments on shareable pages |
| `/api/reactions` | POST/GET — toggle heart reactions |
| `/api/search` | GET — lightweight JSON search |

## Reproducibility contract

The Artwork record is the unit of value. Given `(seed, soundtrack, shaderGraph, audioDNA, planetaryDNA, birthChart)`, the engine produces identical state at any time `t` on any conformant device. Polaroid proofs and recorded videos are reproducible from the same record.

## Project layout

```
app/
  page.tsx                       # landing
  create/page.tsx                # artwork index + upload
  engine/[id]/page.tsx           # interactive engine
  a/[id]/page.tsx                # shareable page
  api/                           # 7 API routes

lib/
  types.ts                       # Artwork, AudioDNA, PlanetaryDNA, BirthChart
  seed.ts / hash.ts              # mulberry32, sha256, canonical JSON
  audio/                         # playback + analyser + essentia wrapper
  planetary/                     # astronomy-engine wrapper + birth-chart
  engine/                        # 5 living-system renderers

components/
  engine/                        # EngineCanvas, FlowFieldMeditation, CosmicFilaments,
                                 # SandTraveler, DeJongAttractor, BirthChartWheel,
                                 # AudioPlayer, ParameterPanel, RecordingPanel,
                                 # ShareableViewer
  ui/                            # design primitives

prisma/
  schema.prisma                  # Artwork + AudioDNA + PlanetaryDNA + BirthChart
  seed.ts                        # 10 seed artworks
  migrations/

tests/
  artwork-roundtrip.test.ts      # 11
  audio-dna.test.ts              # 6
  planetary-dna.test.ts          # 10
  determinism.test.ts            # 10
  sand-traveler.test.ts          # 10
  de-jong-attractor.test.ts      # 9
  birth-chart.test.ts            # 16
  audio-analyser.test.ts         # 8
  stage789.test.ts               # 5 (panel + recording + remix)
  ...                            # 3 misc

public/
  demo/                          # 3 generated WAV files for seed
  renders/                       # static engine renders
  diagrams/                      # engine-architecture.svg
```

## Companion site

The publicly visible installation lives at `/workspace/website/` (10 pages + per-page evolving 3D backgrounds, deployable static to Vercel or any host).

## Docs

- `/workspace/beatrender-genesis.md` — product spec
- `/workspace/beatrender-genesis-engine.md` — technical scoping
- `STAGES.md` — 12-stage build + substages progress
- `STAGE2_DECISION.md` — essentia.js vs meyda
- `AGENTS.md` — AI collaboration conventions for this repo
- `CLAUDE.md` — Claude-specific working notes
- `diagrams/engine-architecture.svg` — system architecture diagram

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS v4
- Three.js + React Three Fiber + Drei + Postprocessing
- Zustand
- Prisma 6 + SQLite (dev) / Postgres (prod)
- essentia.js + astronomy-engine + fluent-ffmpeg
- Vitest (testing)

## License

UNLICENSED · private development
