import React, { useEffect, useRef } from 'react';
import Leaflet from 'leaflet';
import type { Map, Polyline, Polygon as LPolygon, Marker } from 'leaflet';
import { fetchBoundaries, getBoundingBoxForRoute } from '../utils/overpass';
import { findAreasCrossed } from '../utils/routeAnalysis';
import { useAppStatus } from '../context/AppStatusContext';
import { HighlightHandlers, Area, RoutePoints, Coordinate } from '../types';

const BOUNDARY_STYLES: Record<
  number,
  { color: string; weight: number; dashArray?: string; opacity: number }
> = {
  4: { color: '#a855f7', weight: 3, opacity: 0.9 },
  6: { color: '#3b82f6', weight: 2, dashArray: '8 4', opacity: 0.8 },
  8: { color: '#22c55e', weight: 1.5, dashArray: '4 4', opacity: 0.7 },
};
const START_END_DIFF = 0.001;

interface Props {
  routePoints: RoutePoints | null;
  areas: Area[];
  setAreas: (areas: Area[]) => void;
  onAreaFound: (area: Area) => void;
  highlightRef: React.MutableRefObject<HighlightHandlers | null>;
}

export default function MapView({ routePoints, onAreaFound, setAreas, highlightRef }: Props) {
  const { setStatus, setStatusMessage } = useAppStatus();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<Map | null>(null);
  const layersRef = useRef<(Polyline | LPolygon | Marker)[]>([]);
  const highlightLayersRef = useRef<globalThis.Map<string, LPolygon>>(new globalThis.Map());

  // Initialize Leaflet map
  useEffect(() => {
    if (leafletMap.current || !mapRef.current) {
      return;
    }
    const map = Leaflet.map(mapRef.current!).setView([20, 0], 2);
    Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    leafletMap.current = map;
  }, []);

  useEffect(() => {
    async function analyse() {
      if (!routePoints || !leafletMap.current) {
        return;
      }
      const map = leafletMap.current!;

      // Clear out the map to start with
      layersRef.current.forEach((layer) => map.removeLayer(layer));
      layersRef.current = [];
      highlightLayersRef.current.forEach((layer) => map.removeLayer(layer));
      highlightLayersRef.current.clear();
      setAreas([]);

      // Add the route points to the map and fit the zoom to the route with some padding
      const coordinates = routePoints.map((p) => [p.lat, p.lon] as Coordinate);
      const routeLine = Leaflet.polyline(coordinates, {
        color: '#f97316',
        weight: 3,
        opacity: 0.9,
      }).addTo(map);
      layersRef.current.push(routeLine);
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

      // Add the start and end points, using the combined marker if needed
      const startPoint = coordinates[0];
      const endPoint = coordinates[coordinates.length - 1];
      const useCombinedIcon =
        Math.abs(startPoint[0] - endPoint[0]) < START_END_DIFF &&
        Math.abs(startPoint[1] - endPoint[1]) < START_END_DIFF;
      if (useCombinedIcon) {
        const marker = Leaflet.marker(startPoint, {
          icon: Leaflet.icon({ iconUrl: '/assets/start-end-icon.svg', iconAnchor: [8, 8] }),
          keyboard: false,
        }).addTo(map);
        layersRef.current.push(marker);
      } else {
        const startMarker = Leaflet.marker(startPoint, {
          icon: Leaflet.icon({ iconUrl: '/assets/start-icon.svg', iconAnchor: [8, 8] }),
          keyboard: false,
        }).addTo(map);
        const endMarker = Leaflet.marker(endPoint, {
          icon: Leaflet.icon({ iconUrl: '/assets/end-icon.svg', iconAnchor: [8, 8] }),
          keyboard: false,
        }).addTo(map);
        layersRef.current.push(startMarker, endMarker);
      }

      try {
        // Get bounding box and data from Overpass
        setStatus('fetching');
        setStatusMessage('Fetching boundaries from OpenStreetMap...');
        const boundingBox = getBoundingBoxForRoute(routePoints);
        const overpassData = await fetchBoundaries(boundingBox);

        setStatus('processing');
        setStatusMessage('Analysing route crossings...');

        // Draw all boundary outlines, not relations
        for (const element of overpassData.elements) {
          if (element.type !== 'relation') {
            continue;
          }
          const adminLevel = parseInt(element.tags?.admin_level ?? '', 10);

          // Don't draw that which need not be drawn
          const style = BOUNDARY_STYLES[adminLevel];
          if (!style) {
            continue;
          }

          // Push the boundary to the map
          for (const member of element.members ?? []) {
            if (member.type !== 'way' || !member.geometry) {
              continue;
            }
            const coords = member.geometry.map((point) => [point.lat, point.lon] as Coordinate);
            if (coords.length >= 2) {
              layersRef.current.push(Leaflet.polyline(coords, style).addTo(map));
            }
          }
        }

        // Wire up highlight handlers before walking starts
        highlightRef.current = {
          highlight: (name) =>
            highlightLayersRef.current.get(name)?.setStyle({ fillOpacity: 0.2, opacity: 0.8 }),
          unhighlight: (name) =>
            highlightLayersRef.current.get(name)?.setStyle({ fillOpacity: 0, opacity: 0 }),
        };

        // Walk the route — add polygon and push each found area to the list
        await findAreasCrossed(
          routePoints,
          overpassData,
          (area) => {
            // Convert [lon, lat] rings to Leaflet [lat, lon], outer ring first then holes
            const allRings = [...area.rings.outer, ...area.rings.inner].map((ring) =>
              ring.map(([lon, lat]) => [lat, lon] as Coordinate),
            );
            const poly = Leaflet.polygon(allRings, {
              color: '#facc15',
              weight: 2,
              fillColor: '#facc15',
              fillOpacity: 0,
              opacity: 0,
            }).addTo(map);
            highlightLayersRef.current.set(area.name, poly);
            onAreaFound(area);
          },
          (percent) => {
            setStatusMessage(`Analysing route crossings... ${percent}%`);
          },
        );

        setStatus('done');
        setStatusMessage(
          `Done — ${highlightLayersRef.current.size} area${highlightLayersRef.current.size !== 1 ? 's' : ''} identified`,
        );
      } catch (err) {
        setStatus('error');
        setStatusMessage(`Error: ${(err as Error).message}`);
      }
    }

    analyse();
  }, [routePoints]);

  return <div ref={mapRef} className="w-full h-full" style={{ minHeight: 400 }} />;
}
