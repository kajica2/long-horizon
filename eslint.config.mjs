import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Engine components use imperative WebGL patterns (refs read during
  // render, mutable buffers, three.js objects) that the React Compiler
  // lint rules flag as ref/immutability violations. These are legitimate
  // for the GPGPU engine code — the imperative model is the point. We
  // keep the rules on for app code (server components, share widgets)
  // where the patterns are real bugs.
  {
    files: ["components/engine/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
  // Audio playback / audio bindings hooks similarly rely on refs
  // read during render to avoid render–audio glitches.
  {
    files: ["lib/audio/**/*.{ts,tsx}", "lib/engine/use-audio-bindings.ts"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
