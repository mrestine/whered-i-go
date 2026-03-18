import { Feature, Polygon } from 'geojson';

export type Coordinate = [number, number];

export type Ring = Coordinate[];

export interface Rings extends Array<Ring> {}

export interface Area {
  name: string;
  adminLevel: number;
  feature: Feature<Polygon>;
  rings: {
    outer: Rings;
    inner: Rings;
  };
}

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface RoutePoints extends Array<RoutePoint> {}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: OverpassMember[];
}

export interface OverpassMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
  geometry?: Array<{ lat: number; lon: number }>;
}

export type AppStatus = 'idle' | 'parsing' | 'fetching' | 'processing' | 'done' | 'error';

export interface User {
  stravaAthleteId: number;
  athleteName: string;
  avatarUrl?: string;
}

export interface StoredRide {
  activityId: number;
  name: string;
  startDate: string;
  distanceMeters: number;
}

export interface HighlightHandlers {
  highlight: (name: string) => void;
  unhighlight: (name: string) => void;
}
