import { lineString, polygon } from '@turf/helpers';
import length from '@turf/length';
import along from '@turf/along';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const turf = { lineString, polygon, length, along, booleanPointInPolygon };
import { Area, Ring, Rings, RoutePoints, OverpassResponse } from '../types';

const STEP_METERS = 100;
const CHUNK_SIZE = 50; // steps between yields to the browser

/**
 * The heart of the application. This will:
 * - Calculate the boundaries of the overpass data
 * - Step through the route 100m at a time
 * - Check the stepped segment for a new area
 * - Return the list of the crossed areas and their borders
 *
 * @param routePoints all the points in the given route
 * @param overpassData the response from Overpass for the bounding box
 * @param onCrossing callback for a area border crossing for live updates
 * @param onProgress callback for tracking progress
 * @returns
 */
export async function findAreasCrossed(
  routePoints: RoutePoints,
  overpassData: OverpassResponse,
  onCrossing?: (area: Area) => void,
  onProgress?: (percent: number) => void,
): Promise<Area[]> {
  // Construct the boundaries of the entities returned from Overpass
  // Boundaries will include state, counties, and states
  const boundaries = buildBoundaries(overpassData);
  if (!boundaries.length) {
    return [];
  }

  // Calculate the total route distance, and steps required for the set STEP_METERS
  const line = turf.lineString(routePoints.map((point) => [point.lon, point.lat]));
  const totalKm = turf.length(line, { units: 'kilometers' });
  const stepKm = STEP_METERS / 1000;
  const totalSteps = Math.ceil(totalKm / stepKm);

  // The list of areas to be returned
  const crossedAreas: Area[] = [];

  // This might be a town, county, or state name depending on resolved admin level
  let currentName: string | null = null;

  // Just for tracking progress
  let step = 0;

  // Step forward to the next point in the route
  for (let dist = 0; dist <= totalKm; dist += stepKm) {
    const currentPoint = turf.along(line, dist, { units: 'kilometers' });

    // Test the current point against all boundaries noting the most specific
    // This ensures the list will show towns whenever possible
    // 'best' tracks this most specific geographic entity
    let best: Area | null = null;
    for (const boundary of boundaries) {
      try {
        if (
          turf.booleanPointInPolygon(currentPoint, boundary.feature) &&
          (!best || boundary.adminLevel > best.adminLevel)
        ) {
          best = boundary;
        }
      } catch {
        // Malformed polygon - no action needed
      }
    }

    // The resolve area name is different than the last one visited.
    // Add to list, fire the callback, set the new currentName
    const bestName = best?.name ?? null;
    if (bestName && bestName !== currentName) {
      const area: Area = {
        name: bestName,
        adminLevel: best!.adminLevel,
        feature: best!.feature,
        rings: best!.rings,
      };
      crossedAreas.push(area);
      onCrossing?.(area);
      currentName = bestName;
    }

    // Iterate the steps and report progress to the callback
    // Yield to the browser every CHUNK_SIZE steps for better rerendering
    step++;
    if (step % CHUNK_SIZE === 0) {
      onProgress?.(Math.round((step / totalSteps) * 100));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(100);
  return crossedAreas;
}

/**
 * Ensures all the way segments come together to create a valid polygon
 *
 * @param ways the rings to be stitched
 * @returns the stitched rings
 */
function stitchRings(ways: Rings): Rings {
  const unused = ways.map((w) => ({ coords: w, used: false }));
  const rings: Rings = [];

  for (let i = 0; i < unused.length; i++) {
    if (unused[i].used) {
      continue;
    }
    const chain: Ring = [...unused[i].coords];
    unused[i].used = true;

    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1];
      const head = chain[0];
      if (tail[0] === head[0] && tail[1] === head[1]) break;

      for (const segment of unused) {
        if (segment.used) {
          continue;
        }
        const s = segment.coords[0];
        const e = segment.coords[segment.coords.length - 1];
        if (s[0] === tail[0] && s[1] === tail[1]) {
          chain.push(...segment.coords.slice(1));
          segment.used = true;
          extended = true;
          break;
        } else if (e[0] === tail[0] && e[1] === tail[1]) {
          chain.push(...[...segment.coords].reverse().slice(1));
          segment.used = true;
          extended = true;
          break;
        }
      }
    }

    const head = chain[0],
      tail = chain[chain.length - 1];
    if (head[0] !== tail[0] || head[1] !== tail[1]) {
      chain.push(head);
    }
    if (chain.length >= 4) {
      rings.push(chain);
    }
  }
  return rings;
}

/**
 * Creates calid, stitched Turf polygons from the overpass response
 *
 * @param overpassData the raw data from the overpass response
 * @returns turf polygons of the overpass towns, counties, and states
 */
function buildBoundaries(overpassData: OverpassResponse): Area[] {
  const boundaries: Area[] = [];

  for (const element of overpassData.elements) {
    if (element.type !== 'relation') {
      continue;
    }
    const name = element.tags?.name ?? element.tags?.['name:en'] ?? `(id ${element.id})`;
    const adminLevel = parseInt(element.tags?.admin_level ?? '', 10);
    if (!adminLevel) {
      continue;
    }

    // For exclaves, inner borders are necessary
    const outerWays: Rings = [];
    const innerWays: Rings = [];

    // Add valid coordinates to the current inner and outer borders
    for (const member of element.members ?? []) {
      if (member.type !== 'way' || !member.geometry) {
        continue;
      }
      const coords: Ring = member.geometry.map((pt) => [pt.lon, pt.lat]);
      if (coords.length < 2) {
        continue;
      }
      if (member.role === 'outer') {
        outerWays.push(coords);
      } else if (member.role === 'inner') {
        innerWays.push(coords);
      }
    }

    // At least 1 outer border is necessary
    if (!outerWays.length) {
      continue;
    }

    // Ensure that the borders created a closed polygon
    const outerRings = stitchRings(outerWays);
    const innerRings = stitchRings(innerWays);
    if (!outerRings.length) {
      continue;
    }

    // Build turf polygon - first ring is outer, subsequent rings are holes
    try {
      const feature = turf.polygon([outerRings[0], ...innerRings], { name, adminLevel });
      boundaries.push({
        name,
        adminLevel,
        feature,
        rings: { outer: outerRings, inner: innerRings },
      });
    } catch {
      // invalid geometry - do nothing
    }
  }

  return boundaries;
}
