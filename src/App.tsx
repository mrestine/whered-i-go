import { useState, useRef, useCallback } from 'react';
import FileDropzone from './components/FileDropzone';
import MapView from './components/MapView';
import AreaList from './components/AreaList';
import StatusBar from './components/StatusBar';
import { AppStatusProvider } from './context/AppStatusContext';
import type { HighlightHandlers, Area, RoutePoints } from './types';

export default function App() {
  const [routePoints, setRoutePoints] = useState<RoutePoints | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const highlightRef = useRef<HighlightHandlers | null>(null);

  const handleAreaFound = useCallback((area: Area) => {
    setAreas((prev) => [...prev, area]);
  }, []);

  const handleRouteParsed = useCallback((points: RoutePoints) => {
    setAreas([]);
    setRoutePoints(points);
  }, []);

  return (
    <AppStatusProvider>
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <header className="px-6 py-4 border-b border-gray-800 flex items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Where'd I Go?</h1>
        <span className="text-gray-500 text-sm">
          Drop a .gpx or .fit file to see every area your ride passed through
        </span>
        <span className="ml-auto text-gray-400">
          by{' '}
          <a
            className="font-semibold border-b-2 border-white hover:border-blue-500 transition-colors"
            href="https://linkedin.com/in/mrestine/"
            target="_blank"
          >
            Matt Restine
          </a>
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 flex flex-col border-r border-gray-800 overflow-y-auto">
          <div className="p-4 border-b border-gray-800">
            <FileDropzone onRouteParsed={handleRouteParsed} />
          </div>
          <AreaList
            areas={areas}
            onHover={(name) => highlightRef.current?.highlight(name)}
            onHoverEnd={(name) => highlightRef.current?.unhighlight(name)}
          />
        </aside>
        <main className="flex-1 relative">
          <MapView
            routePoints={routePoints}
            areas={areas}
            setAreas={setAreas}
            onAreaFound={handleAreaFound}
            highlightRef={highlightRef}
          />
          <StatusBar />
        </main>
      </div>
      </div>
    </AppStatusProvider>
  );
}
