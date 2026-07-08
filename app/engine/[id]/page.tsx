/**
 * /engine/[id] — Standalone artwork viewer.
 *
 * Stage 3: loads (or derives) a seed for the given id and runs the engine.
 * The route is SSR-disabled because the engine canvas must run client-side.
 *
 * Stage 5 will add Web Audio analyser + real audio reactivity.
 * Stage 9 will fetch Artwork records by id instead of deriving from id string.
 */

import { EngineView } from "./EngineView";

export default async function EnginePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EngineView id={id} />;
}