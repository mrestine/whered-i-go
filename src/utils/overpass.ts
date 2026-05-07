import { BoundingBox, OverpassResponse, RoutePoints } from '../types';

/**
 * Calculates the bounding box of the supplied route
 *
 * @param points all the points in the user-supplied route
 * @returns the min and max for latitude and longitude for the route
 */
export function getBoundingBoxForRoute(points: RoutePoints): BoundingBox {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const { lat, lon } of points) {
    if (lat < minLat) {
      minLat = lat;
    }
    if (lat > maxLat) {
      maxLat = lat;
    }
    if (lon < minLon) {
      minLon = lon;
    }
    if (lon > maxLon) {
      maxLon = lon;
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Adds small padding to the given bounding box and fetches the geo data for that box
 * In general, states, counties, and towns are fetched
 *
 * @param boundingBox the bounding box of the route
 * @returns the overpass response for the box
 */
export async function fetchBoundaries(boundingBox: BoundingBox): Promise<OverpassResponse> {
  // Add the padding
  const padding = 0.01;
  const paddedBox =
    `${boundingBox.minLat - padding},` +
    `${boundingBox.minLon - padding},` +
    `${boundingBox.maxLat + padding},` +
    `${boundingBox.maxLon + padding}`;

  // Create the query for overpass
  const query = `
    [out:json][timeout:60];
    (
      relation["boundary"="administrative"]["admin_level"="4"](${paddedBox});
      relation["boundary"="administrative"]["admin_level"="6"](${paddedBox});
      relation["boundary"="administrative"]["admin_level"="8"](${paddedBox});
    );
    out geom;
  `;

  const delays = [1000, 3000];

  let lastStatus = 0;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
    }
    const res = await fetch('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });
    if (res.ok) {
      return res.json() as Promise<OverpassResponse>;
    }
    lastStatus = res.status;
    if (res.status < 500) {
      break;
    }
  }

  throw new Error(`Overpass request failed: ${lastStatus}`);
}
