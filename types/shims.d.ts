// Type stubs for libraries without TypeScript declarations.
//
// The `any` types here are intentional — these are interop shims for
// libraries that don't ship their own .d.ts files. The eslint config
// file-scoped disables below suppress @typescript-eslint/no-explicit-any
// for this file only; everywhere else in the project, `any` is still
// a lint error.

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "essentia.js" {
  export const EssentiaWASM: any;
  export class Essentia {
    constructor(WASM: any);
    arrayToVector(arr: ArrayLike<number>): any;
    Energy(v: any): { energy: number };
    RMS(v: any): { rms: number };
    ZeroCrossingRate(v: any): { zeroCrossingRate: number };
    SpectralCentroidTime(v: any): { centroid: number };
    Spectrum(v: any): { spectrum: any };
    MFCC(spectrum: any): { mfcc: any };
    KeyExtractor(
      signal: any,
      averageDetuningCorrection?: boolean,
      frameSize?: number,
      hopSize?: number,
      hpcpSize?: number,
      maxFrequency?: number,
      maximumSpectralPeaks?: number,
      minFrequency?: number,
      pcpThreshold?: number,
      profileType?: string,
      sampleRate?: number,
      spectralPeaksThreshold?: number,
      tuningFrequency?: number,
      weightType?: string,
      windowType?: string,
    ): { key: string; scale: string; strength: number };
    BeatTrackerMultiFeature(
      signal: any,
      maxTempo?: number,
      minTempo?: number,
    ): { bpm: number; ticks: any; confidence: number };
    OnsetRate(signal: any): { onsetRate: number };
    shutdown(): void;
  }
}

declare module "meyda/dist/node/main.js" {
  export const featureExtractors: Record<
    string,
    (args: Record<string, unknown>) => number
  >;
}

declare module "@ffmpeg-installer/ffmpeg" {
  const installer: { path: string; version: string; url: string };
  export default installer;
}