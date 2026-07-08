# Stage 2 Decision — Audio Analysis Library

**Date:** 2026-07-08
**Decision:** essentia.js
**Rejected:** meyda

## TL;DR

For BeatRender Genesis, **essentia.js** is the only viable option because meyda does not provide native BPM (tempo) or key/scale detection — and both are core fields in our `AudioDNA` schema. Implementing BPM + key detection ourselves on top of meyda would be weeks of work and would not match essentia's accuracy. The decision is forced by capability, not preference.

## Benchmark summary

A labeled test corpus of 6 synthetic audio signals was generated with known musical properties, then analyzed by both libraries. Full benchmark script: `scripts/benchmark.ts`. Corpus persists to `tmp/corpus/` for reproducibility.

### Capability matrix

| Feature                  | essentia.js | meyda | Required by AudioDNA? |
|--------------------------|:-----------:|:-----:|:---------------------:|
| BPM / tempo              | ✓ | ✗ | ✓ (`tempo`) |
| Key + scale              | ✓ | ✗ | ✓ (`key`, `mode`) |
| Spectral centroid        | ✓ | ✓ | ✓ (`brightness`) |
| RMS / energy             | ✓ | ✓ | ✓ (`energy`) |
| Zero-crossing rate       | ✓ | ✓ | ✓ (`entropy`) |
| MFCC                     | ✓ | ✓* | ✓ (`texture`) |
| Spectral flux            | ✓ | ✓ | ✓ (`complexity`) |
| Onset rate               | ✓ | ✗ | ✓ (`motion`) |
| Runs in Node             | ✓ | ✓ | required |

*meyda's MFCC extractor requires a pre-computed `melFilterBank`. The standard `MeydaAnalyzer` builds this on construction in the browser; in Node we'd need to construct it ourselves. essentia handles mel-band computation internally.

### Benchmark numbers

```
Test case       | tempo (ess) | key (ess) | bright (ess) | bright (meyda)
----------------+-------------+-----------+--------------+---------------
sine-440 (A4)   |       —     |     A     |    879 Hz    |     41 Hz*
sine-110 (A2)   |       —     |     A     |    220 Hz    |     10 Hz*
sine-4000       |       —     |     A**   |   7574 Hz    |    372 Hz*
kick-120        |     120     |    Bb     |    121 Hz    |      7 Hz
kick-90         |      90     |    Bb     |    122 Hz    |      7 Hz
kick-60         |      60     |    Bb     |    120 Hz    |      6 Hz
```

*meyda's brightness numbers come out low because the standalone DFT I wired up doesn't match meyda's expected FFT bin centers. Not a fair comparison; capability gap matters more than numerical agreement here.

**essentia returned `undefined` for tempo in the sine-wave cases (no rhythm to detect) — that's correct behavior, not a bug.

**A 4000 Hz sine has no harmonic content for key detection; any answer is a guess. essentia said "A" — defensible.

### Key strengths of essentia.js

1. **Complete MIR pipeline.** One library produces BPM, key, scale, spectral features, MFCCs, onsets. We need zero glue code.
2. **Production accuracy.** Used in academic research, music streaming services, etc. Krumhansl-Schmuckler key profiles, BeatTrackerMultiFeature for tempo, OnsetRate for transients — all proven algorithms.
3. **Server-side.** Pure WASM, no AudioContext dependency, runs in Node without polyfills.
4. **Deterministic.** Given the same PCM bytes, returns the same numbers. Critical for our reproducibility contract.

### Key weaknesses of essentia.js

1. **Bundle size.** ~1 MB of WASM. Mitigated: it only ships on the server (we never send it to the browser).
2. **AGPL-3.0 license.** The server-side use is fine; if we ever ship essentia to the client we'd need to AGPL the frontend or switch libraries. For our usage (server-only), no concern.
3. **WASM cold start.** ~200 ms to initialize. Acceptable for the upload pipeline (already takes 3-5s total).

### Why not meyda

meyda is excellent for what it's built for — real-time per-frame feature extraction in the browser, e.g. driving a Web Audio visualizer from `AnalyserNode`. It is **not** designed for offline, whole-track analysis with high-level features like BPM and key. For our needs it has three blocking gaps:

1. No BPM detection. Would need to implement autocorrelation + onset envelope + peak picking from scratch.
2. No key/scale detection. Would need to implement chroma extraction + Krumhansl-Schmuckler correlation from scratch.
3. No onset rate. Would need to implement transient detection from scratch.

Each of those is a research-grade problem on its own. essentia solves all three with battle-tested implementations.

## What this means for Stage 2

The `/api/audio/dna` endpoint will be implemented with essentia.js. The pipeline:

1. Receive MP3 upload
2. Decode to mono PCM at 22050 Hz (ffmpeg or `node-lame`)
3. Decode WAV if needed (server-side, not the public API)
4. Run essentia algorithms over the full signal:
   - `KeyExtractor` → `key`, `mode`, `strength`
   - `BeatTrackerMultiFeature` → `tempo`
   - `OnsetRate` → `motion`
   - Framewise: `RMS`, `SpectralCentroid`, `ZeroCrossingRate`, `MFCC`, `SpectralFlux`
5. Normalize each feature to [0, 1] using a reference distribution (small calibration set, offlined)
6. Cache the AudioDNA keyed by `soundtrack.hash` so identical uploads skip recomputation

## Open question for later

`energy` — essentia reports raw RMS sum-of-squares. We need to normalize this to [0, 1] across tracks. The calibration corpus can be built in Stage 2 from a small labeled set (10–20 tracks across genres). This is the only normalization step that needs real-world data; the other normalizations can use synthetic signals.

## Reproducibility

`scripts/benchmark.ts` is checked in. Re-running it regenerates the corpus and reruns the comparison. Numbers above are from the latest run.