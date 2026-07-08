/**
 * Planetary compute — derive PlanetaryDNA from a timestamp.
 *
 * Uses astronomy-engine (pure JS, MIT) for heliocentric/geocentric
 * positions. All outputs are deterministic functions of the input
 * timestamp + observer location, so the reproducibility contract
 * extends cleanly: same timestamp → same DNA → same artwork.
 */

import {
  Body,
  Equator,
  Horizon,
  MakeTime,
  Observer,
} from "astronomy-engine";
import type { PlanetaryDNA, ZodiacElement } from "../types";

const DEFAULT_OBSERVER = new Observer(52.3676, 4.9041, 0); // Amsterdam-ish; equatorial positions unaffected by observer longitude at this precision

// ============================================================
// Zodiac sign → element
// ============================================================

function signFromLongitude(longitudeDeg: number): number {
  // 0–360° → sign index 0–11, each sign = 30°
  const norm = ((longitudeDeg % 360) + 360) % 360;
  return Math.floor(norm / 30);
}

const SIGN_ELEMENT: ZodiacElement[] = [
  "fire",  // 0  Aries
  "earth", // 1  Taurus
  "air",   // 2  Gemini
  "water", // 3  Cancer
  "fire",  // 4  Leo
  "earth", // 5  Virgo
  "air",   // 6  Libra
  "water", // 7  Scorpio
  "fire",  // 8  Sagittarius
  "earth", // 9  Capricorn
  "air",   // 10 Aquarius
  "water", // 11 Pisces
];

// ============================================================
// Longitude at a given time (geocentric ecliptic)
// ============================================================

function eclipticLongitude(body: Body, date: Date): number {
  // For Sun: heliocentric of Earth rotated, but astronomy-engine gives
  // apparent geocentric ecliptic longitude directly via Equator + Ecliptic.
  // We use the Observer-based Horizon call indirectly via the vector.
  // Simpler: astronomy-engine's Equator() returns a vector; convert to ecliptic
  // longitude via the rotation. For Sun and Moon we have direct formulas.

  // For Sun: geocentric ecliptic longitude = 0hAries - 0hEarth + 180°,
  // simplified: astronomy-engine's Body.Sun position via Equator gives RA/Dec,
  // and we convert RA → ecliptic longitude via obliquity.
  const equ = Equator(body, date, DEFAULT_OBSERVER, true, true);
  // equ.ra is in hours [0, 24). Convert to degrees.
  const raDeg = equ.ra * 15;
  // For solar system bodies, ecliptic longitude ≈ RA + small correction (obliquity)
  // For simplicity and acceptable accuracy at sub-degree precision, use RA
  // directly as the longitude (obliquity ~23° causes ~23° systematic offset
  // for the Moon; for planetary positions in tropical zodiac this is fine
  // for seeding purposes).
  // We'll apply a proper obliquity correction using date-based epsilon:
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const epsilonDeg = 23.439291 - 0.0130042 * T; // mean obliquity, degrees
  // Convert equatorial (RA, dec) → ecliptic (lon, lat):
  // lon = atan2( sin(RA)*cos(eps) + tan(dec)*sin(eps), cos(RA) )
  const raRad = (raDeg * Math.PI) / 180;
  const decRad = (equ.dec * Math.PI) / 180;
  const epsRad = (epsilonDeg * Math.PI) / 180;
  const lonRad = Math.atan2(
    Math.sin(raRad) * Math.cos(epsRad) + Math.tan(decRad) * Math.sin(epsRad),
    Math.cos(raRad),
  );
  let lonDeg = (lonRad * 180) / Math.PI;
  if (lonDeg < 0) lonDeg += 360;
  return lonDeg;
}

// ============================================================
// Retrograde detection — compare longitude today vs +1 day
// ============================================================

function isRetrograde(body: Body, date: Date): boolean {
  // Geocentric planets show retrograde motion when their apparent
  // ecliptic longitude decreases day-over-day (from Earth's perspective).
  // Skip for Sun, Moon, Earth — they don't go retrograde.
  if (body === Body.Sun || body === Body.Moon || body === Body.Earth) {
    return false;
  }
  const t1 = date;
  const t2 = new Date(date.getTime() + 24 * 3600 * 1000); // +1 day
  const lon1 = eclipticLongitude(body, t1);
  const lon2 = eclipticLongitude(body, t2);
  // Normalize the difference into [-180, 180]
  let delta = lon2 - lon1;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta < 0;
}

// ============================================================
// Aspects
// ============================================================

const ASPECTS: Array<{ angle: number; name: string; weight: number; orb: number }> = [
  { angle: 0, name: "conjunction", weight: 1.0, orb: 6 },
  { angle: 60, name: "sextile", weight: 0.6, orb: 4 },
  { angle: 90, name: "square", weight: 0.8, orb: 5 },
  { angle: 120, name: "trine", weight: 0.9, orb: 5 },
  { angle: 180, name: "opposition", weight: 1.0, orb: 6 },
];

const PLANET_BODIES = [
  Body.Sun,
  Body.Moon,
  Body.Mercury,
  Body.Venus,
  Body.Mars,
  Body.Jupiter,
  Body.Saturn,
  Body.Uranus,
  Body.Neptune,
];

function angularSeparation(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function countAspects(longitudes: Record<string, number>): { count: number; intensity: number } {
  let count = 0;
  let totalWeight = 0;
  const keys = Object.keys(longitudes);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const sep = angularSeparation(longitudes[keys[i]], longitudes[keys[j]]);
      for (const asp of ASPECTS) {
        if (Math.abs(sep - asp.angle) <= asp.orb) {
          count++;
          // Weight = aspect weight × closeness (1 at exact, 0 at orb edge)
          const closeness = 1 - Math.abs(sep - asp.angle) / asp.orb;
          totalWeight += asp.weight * closeness;
          break; // only count one aspect per pair
        }
      }
    }
  }
  // Normalize intensity against a plausible max (say 20 weighted aspects)
  const intensity = Math.min(1, totalWeight / 15);
  return { count, intensity };
}

// ============================================================
// Element distribution from sign distribution
// ============================================================

function elementDistribution(longitudes: Record<string, number>): {
  dominant: ZodiacElement;
  balance: Record<ZodiacElement, number>;
} {
  const counts: Record<ZodiacElement, number> = {
    fire: 0,
    earth: 0,
    air: 0,
    water: 0,
  };
  for (const lon of Object.values(longitudes)) {
    const sign = signFromLongitude(lon);
    const element = SIGN_ELEMENT[sign];
    counts[element]++;
  }
  const total = PLANET_BODIES.length; // 9 bodies
  const balance: Record<ZodiacElement, number> = {
    fire: counts.fire / total,
    earth: counts.earth / total,
    air: counts.air / total,
    water: counts.water / total,
  };
  let dominant: ZodiacElement = "fire";
  let max = -1;
  for (const e of ["fire", "earth", "air", "water"] as ZodiacElement[]) {
    if (balance[e] > max) {
      max = balance[e];
      dominant = e;
    }
  }
  return { dominant, balance };
}

// ============================================================
// Public API
// ============================================================

/**
 * Compute PlanetaryDNA for a given moment.
 * @param timestamp - JS Date or ISO string. Defaults to "now".
 * @param observer - Optional Observer override. Default is a generic location
 *                  (longitude cancels out for topocentric equatorial coords;
 *                  we use RA which is observer-independent).
 */
export function computePlanetaryDNA(
  timestamp?: Date | string,
): PlanetaryDNA {
  const date = timestamp
    ? typeof timestamp === "string" ? new Date(timestamp) : timestamp
    : new Date();

  const longitudes: Record<string, number> = {
    sun: eclipticLongitude(Body.Sun, date),
    moon: eclipticLongitude(Body.Moon, date),
    mercury: eclipticLongitude(Body.Mercury, date),
    venus: eclipticLongitude(Body.Venus, date),
    mars: eclipticLongitude(Body.Mars, date),
    jupiter: eclipticLongitude(Body.Jupiter, date),
    saturn: eclipticLongitude(Body.Saturn, date),
    uranus: eclipticLongitude(Body.Uranus, date),
    neptune: eclipticLongitude(Body.Neptune, date),
  };

  const moonPhaseAngle = angularSeparation(longitudes.sun, longitudes.moon);
  const moonPhase = moonPhaseAngle / 360;

  const { count: aspectCount, intensity: chartIntensity } =
    countAspects(longitudes);
  const { dominant: dominantElement, balance: elementBalance } =
    elementDistribution(longitudes);

  return {
    sunLongitude: longitudes.sun,
    moonLongitude: longitudes.moon,
    mercuryLongitude: longitudes.mercury,
    venusLongitude: longitudes.venus,
    marsLongitude: longitudes.mars,
    jupiterLongitude: longitudes.jupiter,
    saturnLongitude: longitudes.saturn,
    uranusLongitude: longitudes.uranus,
    neptuneLongitude: longitudes.neptune,
    moonPhase,
    moonPhaseAngle,
    mercuryRetrograde: isRetrograde(Body.Mercury, date),
    venusRetrograde: isRetrograde(Body.Venus, date),
    marsRetrograde: isRetrograde(Body.Mars, date),
    jupiterRetrograde: isRetrograde(Body.Jupiter, date),
    saturnRetrograde: isRetrograde(Body.Saturn, date),
    uranusRetrograde: isRetrograde(Body.Uranus, date),
    neptuneRetrograde: isRetrograde(Body.Neptune, date),
    aspectCount,
    chartIntensity,
    dominantElement,
    elementBalance,
    timestamp: date.toISOString(),
  };
}

// Re-export for tests
export {
  eclipticLongitude,
  isRetrograde,
  countAspects,
  elementDistribution,
  angularSeparation,
  signFromLongitude,
  SIGN_ELEMENT,
  ASPECTS,
};