/**
 * BirthChartWheel — 3D Western astrology chart.
 *
 * Renders a Placidus natal chart as a fully 3D scene:
 *   - Outer zodiac ring: 12 colored segments with sign glyphs
 *   - Body markers: small spheres at the body longitudes
 *   - Aspect lines: colored chords between bodies, inside the wheel
 *   - House cusp lines: radial lines from center to the cusps
 *   - Angle emphasis: brighter lines for Asc, MC, IC, Desc
 *
 * Layout (looking down from +Y):
 *   - 1st house cusp (Ascendant) is on the left (longitude 180° in sky view
 *     corresponds to east on Earth) — actually, we put Asc at the left (9 o'clock)
 *     for traditional Western chart convention, with the wheel rotating so
 *     the rest follows counter-clockwise (which is the standard).
 *
 *   - We map ecliptic longitude 0° (Aries) to the LEFT, longitude 90° (Cancer)
 *     to the BOTTOM, etc. — this matches the "Ascendant-on-left" convention
 *     where the houses go counter-clockwise.
 *
 * Coordinates:
 *   - The wheel lies in the XZ plane (Y is up)
 *   - Body at longitude λ is at (sin(λ) * R, 0, -cos(λ) * R)
 *     This way, longitude 0 → (-0, 0, -R) = "south" of center
 *           longitude 90 → (R, 0, 0)   = "east" of center
 *
 *   But for the standard chart, we want longitude 0 (Aries) on the LEFT
 *   and longitude 90 (Cancer) at the BOTTOM. With our XZ mapping and a
 *   90° rotation, this works.
 */

"use client";

/* eslint-disable react-hooks/rules-of-hooks --
   The useMemo calls inside segments.map() are SAFE: the loop count is
   fixed at 12 (one per zodiac sign), so the hook order is stable across
   renders. The rule of "no hooks in callbacks" exists to prevent hook
   count from changing between renders — that cannot happen here because
   segments.length is derived from ZODIAC_SIGNS at module load. */

import { useMemo } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { Text } from "@react-three/drei";
import type { BirthChart, BodyKey, ZodiacSign, AspectName } from "@/lib/types";

const ZODIAC_GLYPHS: Record<ZodiacSign, string> = {
  aries: "♈", taurus: "♉", gemini: "♊", cancer: "♋",
  leo: "♌", virgo: "♍", libra: "♎", scorpio: "♏",
  sagittarius: "♐", capricorn: "♑", aquarius: "♒", pisces: "♓",
};

const BODY_GLYPHS: Record<BodyKey, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
};

// Color palette — restrained, museum-grade. Element-based hues.
const ELEMENT_COLOR: Record<"fire" | "earth" | "air" | "water", string> = {
  fire: "#e07a4d",   // ember / orange
  earth: "#a58964",  // ochre
  air: "#c8b48a",    // pale wheat
  water: "#5a6c7c",  // slate
};

const ZODIAC_ELEMENT: Record<ZodiacSign, "fire" | "earth" | "air" | "water"> = {
  aries: "fire", leo: "fire", sagittarius: "fire",
  taurus: "earth", virgo: "earth", capricorn: "earth",
  gemini: "air", libra: "air", aquarius: "air",
  cancer: "water", scorpio: "water", pisces: "water",
};

const ASPECT_COLOR: Record<AspectName, string> = {
  conjunction: "#e8d9b0",  // warm white
  opposition: "#d96b3a",   // red-orange
  trine: "#7ab87a",        // green
  square: "#c75a5a",       // red
  sextile: "#5a8db8",      // blue
};

const ANGLE_COLOR = "#f5e6c8";  // cream

// Geometry constants
const R_OUTER = 4.0;     // outer edge of zodiac ring
const R_ZODIAC_INNER = 3.4;  // inner edge of zodiac ring
const R_BODY = 2.9;      // where planet markers sit
const R_HOUSE = 2.6;     // inner end of house lines
const R_ASPECT = 2.2;    // aspect line radius (chord inside)

/**
 * Convert a zodiac longitude (0-360) to a 3D position in the wheel's XZ plane.
 * Longitude 0 (Aries 0°) goes to the LEFT (X = -R), longitude 90 (Cancer) goes
 * to the BOTTOM (Z = +R). This is the standard Western chart convention.
 */
function lonToPos(lonDeg: number, radius: number): [number, number, number] {
  // Map: 0° → LEFT (-X), 90° → BOTTOM (+Z), 180° → RIGHT (+X), 270° → TOP (-Z)
  // That's a clockwise rotation when viewed from above.
  // lon_rad measured clockwise from -X axis.
  const lonRad = (lonDeg * Math.PI) / 180;
  const x = -Math.cos(lonRad) * radius;
  const z = -Math.sin(lonRad) * radius; // negate so 90° goes to +Z (bottom)
  return [x, 0, z];
}

export function BirthChartWheel({ chart, seed }: { chart: BirthChart; seed: string }) {
  // Camera angle: the wheel is on the floor, camera looks down at an angle
  // to give it a sense of depth. The wheel is "slightly above" the camera.
  // We don't add OrbitControls here — the parent EngineCanvas will be updated
  // to support that for `system: "birthChart"` in Stage 6d.

  return (
    <group position={[0, 0, 0]}>
      {/* Background disk (subtle, to anchor the wheel) */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R_OUTER + 0.6, 64]} />
        <meshBasicMaterial color="#0a0a0e" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      <ZodiacRing />
      <HouseCusps chart={chart} />
      <AngleMarkers chart={chart} />
      <AspectLines chart={chart} />
      <BodyMarkers chart={chart} />

      {/* Center marker */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 32]} />
        <meshBasicMaterial color={ANGLE_COLOR} />
      </mesh>

      {/* Seed label — small text in the corner */}
      <Text
        position={[-R_OUTER - 0.3, 0.02, -R_OUTER - 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.18}
        color="#888"
        anchorX="left"
        anchorY="top"
      >
        {`seed ${seed.slice(0, 12)}…`}
      </Text>
    </group>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function ZodiacRing() {
  // 12 segments. Each is a flat ring slice.
  const segments = useMemo(() => {
    const result: Array<{
      sign: ZodiacSign;
      color: string;
      startAngle: number;
      endAngle: number;
    }> = [];
    for (let i = 0; i < 12; i++) {
      const sign = ZODIAC_GLYPHS[Object.keys(ZODIAC_GLYPHS)[i] as ZodiacSign];
      const elem = ZODIAC_ELEMENT[Object.keys(ZODIAC_ELEMENT)[i] as ZodiacSign];
      // We need both the sign glyph and the sign key — let me restructure
      const signKey = Object.keys(ZODIAC_GLYPHS)[i] as ZodiacSign;
      result.push({
        sign: signKey,
        color: ELEMENT_COLOR[ZODIAC_ELEMENT[signKey]],
        startAngle: i * 30,
        endAngle: (i + 1) * 30,
      });
    }
    return result;
  }, []);

  return (
    <group>
      {segments.map((seg) => {
        // Build a flat ring segment using ShapeGeometry
        const shape = useMemo(() => {
          const s = new THREE.Shape();
          const startRad = (seg.startAngle * Math.PI) / 180;
          const endRad = (seg.endAngle * Math.PI) / 180;
          const segments = 24;
          // Outer arc, going counterclockwise (in our lonToPos convention)
          for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = startRad + (endRad - startRad) * t;
            const x = -Math.cos(angle) * R_OUTER;
            const z = -Math.sin(angle) * R_OUTER;
            if (i === 0) s.moveTo(x, z);
            else s.lineTo(x, z);
          }
          // Inner arc, going back
          for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const angle = startRad + (endRad - startRad) * t;
            const x = -Math.cos(angle) * R_ZODIAC_INNER;
            const z = -Math.sin(angle) * R_ZODIAC_INNER;
            s.lineTo(x, z);
          }
          s.closePath();
          return s;
        }, [seg.startAngle, seg.endAngle]);

        const glyphPos = useMemo(() => {
          const midAngle = ((seg.startAngle + seg.endAngle) / 2 * Math.PI) / 180;
          const midR = (R_OUTER + R_ZODIAC_INNER) / 2;
          return [
            -Math.cos(midAngle) * midR,
            0.01,
            -Math.sin(midAngle) * midR,
          ] as [number, number, number];
        }, [seg.startAngle, seg.endAngle]);

        return (
          <group key={seg.sign}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
              <shapeGeometry args={[shape]} />
              <meshBasicMaterial color={seg.color} transparent opacity={0.55} side={THREE.DoubleSide} />
            </mesh>
            <Text
              position={glyphPos}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.42}
              color="#f4ecd8"
              anchorX="center"
              anchorY="middle"
            >
              {ZODIAC_GLYPHS[seg.sign]}
            </Text>
          </group>
        );
      })}

      {/* Inner / outer ring outlines */}
      <RingLine radius={R_OUTER} color="#444" segments={128} />
      <RingLine radius={R_ZODIAC_INNER} color="#444" segments={128} />
    </group>
  );
}

function RingLine({ radius, color, segments }: { radius: number; color: string; segments: number }) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(-Math.cos(a) * radius, 0, -Math.sin(a) * radius);
    }
    return new LineGeometry();
    // (LineGeometry doesn't accept a flat array directly; build via setPositions)
  }, [radius, segments]);

  geom.setPositions(useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(-Math.cos(a) * radius, 0.02, -Math.sin(a) * radius);
    }
    return pts;
  }, [radius, segments]));

  const mat = useMemo(() => new LineMaterial({
    color,
    linewidth: 1.5,
    worldUnits: false,
    transparent: true,
    opacity: 0.4,
  }), [color]);

  return <primitive object={new Line2(geom, mat)} />;
}

function HouseCusps({ chart }: { chart: BirthChart }) {
  const lines = useMemo(() => {
    const out: Array<{ from: [number, number, number]; to: [number, number, number]; isAngle: boolean; cusp: number }> = [];
    for (let i = 0; i < 12; i++) {
      const lon = chart.houses[i];
      const inner = lonToPos(lon, R_HOUSE);
      const outer = lonToPos(lon, R_OUTER + 0.05);
      const isAngle = i === 0 || i === 3 || i === 6 || i === 9; // 1, 4, 7, 10
      out.push({ from: inner, to: outer, isAngle, cusp: i + 1 });
    }
    return out;
  }, [chart.houses]);

  return (
    <group>
      {lines.map((l, i) => (
        <CuspLine key={i} from={l.from} to={l.to} isAngle={l.isAngle} />
      ))}
    </group>
  );
}

function CuspLine({ from, to, isAngle }: { from: [number, number, number]; to: [number, number, number]; isAngle: boolean }) {
  const geom = useMemo(() => {
    const g = new LineGeometry();
    g.setPositions([...from, ...to]);
    return g;
  }, [from, to]);
  const mat = useMemo(() => new LineMaterial({
    color: isAngle ? ANGLE_COLOR : "#777",
    linewidth: isAngle ? 2.5 : 1,
    worldUnits: false,
    transparent: true,
    opacity: isAngle ? 0.95 : 0.55,
  }), [isAngle]);
  return <primitive object={new Line2(geom, mat)} />;
}

function AngleMarkers({ chart }: { chart: BirthChart }) {
  // The 4 angles (Asc, IC, Dsc, MC) get extra labels
  const angles = useMemo(() => {
    return [
      { name: "ASC", lon: chart.ascendant, color: ANGLE_COLOR },
      { name: "IC",  lon: (chart.midheaven + 180) % 360, color: "#c8b48a" },
      { name: "DSC", lon: (chart.ascendant + 180) % 360, color: "#c8b48a" },
      { name: "MC",  lon: chart.midheaven, color: ANGLE_COLOR },
    ];
  }, [chart.ascendant, chart.midheaven]);

  return (
    <group>
      {angles.map((a) => {
        const pos = lonToPos(a.lon, R_OUTER + 0.4);
        return (
          <Text
            key={a.name}
            position={[pos[0], 0.05, pos[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.26}
            color={a.color}
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            {a.name}
          </Text>
        );
      })}
    </group>
  );
}

function BodyMarkers({ chart }: { chart: BirthChart }) {
  // Place body glyphs at the body longitudes, slightly inside the zodiac ring
  const bodies = useMemo(() => {
    return (Object.keys(chart.bodies) as BodyKey[]).map((key) => ({
      key,
      glyph: BODY_GLYPHS[key],
      lon: chart.bodies[key],
    }));
  }, [chart.bodies]);

  return (
    <group>
      {bodies.map((b) => {
        const pos = lonToPos(b.lon, R_BODY);
        // Tick line from ring to body
        const tickGeom = useMemo(() => {
          const inner = lonToPos(b.lon, R_ZODIAC_INNER - 0.05);
          const outer = lonToPos(b.lon, R_BODY + 0.18);
          const g = new LineGeometry();
          g.setPositions([...inner, ...outer]);
          return g;
        }, [b.lon]);
        const tickMat = useMemo(() => new LineMaterial({
          color: "#999",
          linewidth: 1,
          worldUnits: false,
          transparent: true,
          opacity: 0.5,
        }), []);
        return (
          <group key={b.key}>
            <primitive object={new Line2(tickGeom, tickMat)} />
            <Text
              position={[pos[0], 0.03, pos[2]]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.32}
              color="#f4ecd8"
              anchorX="center"
              anchorY="middle"
            >
              {b.glyph}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

function AspectLines({ chart }: { chart: BirthChart }) {
  const lines = useMemo(() => {
    return chart.aspects.map((a) => {
      const a1 = chart.bodies[a.a];
      const a2 = chart.bodies[a.b];
      const p1 = lonToPos(a1, R_ASPECT);
      const p2 = lonToPos(a2, R_ASPECT);
      return { id: `${a.a}-${a.b}-${a.type}`, p1, p2, color: ASPECT_COLOR[a.type], orb: a.orb };
    });
  }, [chart.aspects, chart.bodies]);

  return (
    <group>
      {lines.map((l) => {
        const geom = useMemo(() => {
          const g = new LineGeometry();
          g.setPositions([...l.p1, ...l.p2]);
          return g;
        }, [l.p1, l.p2]);
        const mat = useMemo(() => new LineMaterial({
          color: l.color,
          linewidth: 1 + Math.max(0, 1 - l.orb / 8) * 1.5, // tighter orb = thicker
          worldUnits: false,
          transparent: true,
          opacity: 0.7,
        }), [l.color, l.orb]);
        return <primitive key={l.id} object={new Line2(geom, mat)} />;
      })}
    </group>
  );
}