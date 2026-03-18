/**
 * gpxparser 3.0.0 ships without an index.d.ts - no types for typescript
 * Declaring the module here makes typescript happy.
 * There are later versions, and even the very next version after 3.0.0 has types.
 * However, it also ships with critically vulnerable dependencies.
 * Thus, we stick with 3.0.0 and declare this module.
 */
declare module 'gpxparser' {
  interface Point {
    lat: number;
    lon: number;
  }

  interface Track {
    points: Point[];
  }

  export default class GPXParser {
    tracks: Track[];
    parse(gpxstring: string): void;
  }
}
