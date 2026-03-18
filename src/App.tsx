import { useState, useRef, useCallback } from 'react';
import FileDropzone from './components/FileDropzone';
import MapView from './components/MapView';
import AreaList from './components/AreaList';
import StatusBar from './components/StatusBar';
import RecentRides from './components/RecentRides';
import { AppStatusProvider } from './context/AppStatusContext';
import { AuthProvider } from './context/AuthContext';
import type { HighlightHandlers, Area, RoutePoints } from './types';

export default function App() {
  const [routePoints, setRoutePoints] = useState<RoutePoints | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [ridesListOpen, setRidesListOpen] = useState(false);
  const highlightRef = useRef<HighlightHandlers | null>(null);

  const handleAreaFound = useCallback((area: Area) => {
    setAreas((prev) => [...prev, area]);
  }, []);

  const handleRouteParsed = useCallback((points: RoutePoints) => {
    setAreas([]);
    setRoutePoints(points);
    setRidesListOpen(false);
  }, []);

  return (
    <AuthProvider>
      <AppStatusProvider>
        <div className="flex flex-col h-screen overflow-hidden bg-gray-950 text-gray-100">
          <header className="shrink-0 px-6 py-4 border-b border-gray-800 flex items-center gap-4">
            <h1 className="text-xl font-semibold tracking-tight">Where'd I Go?</h1>
            <span className="hidden md:block text-gray-500 text-sm">
              See every area your ride passed through
            </span>
            <div className="ml-auto flex items-center gap-4">
              <span className="text-gray-400">
                by{' '}
                <a
                  className="font-semibold border-b-2 border-white hover:border-blue-500 transition-colors"
                  href="https://linkedin.com/in/mrestine/"
                  target="_blank"
                >
                  Matt Restine
                </a>
              </span>
            </div>
          </header>

          <div className="flex flex-col-reverse md:flex-row flex-1 min-h-0 overflow-hidden">
            <aside className="shrink-0 h-[45%] md:h-auto md:w-80 flex flex-col border-t border-gray-800 md:border-t-0 md:border-r overflow-hidden">
              {routePoints && (
                <button
                  className="md:hidden shrink-0 flex items-center justify-between w-full px-4 py-2 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-800 hover:bg-gray-900 transition-colors"
                  onClick={() => setRidesListOpen((open) => !open)}
                >
                  <span>Rides &amp; Upload</span>
                  <span>{ridesListOpen ? '▲' : '▼'}</span>
                </button>
              )}
              <div
                className={`shrink-0 overflow-y-auto max-h-64 md:overflow-visible md:max-h-none${routePoints && !ridesListOpen ? ' hidden md:block' : ''}`}
              >
                <div className="p-4 border-b border-gray-800">
                  <FileDropzone onRouteParsed={handleRouteParsed} />
                </div>
                <RecentRides onRouteParsed={handleRouteParsed} />
              </div>
              <AreaList
                areas={areas}
                onHover={(name) => highlightRef.current?.highlight(name)}
                onHoverEnd={(name) => highlightRef.current?.unhighlight(name)}
              />
            </aside>
            <main className="flex-1 min-h-0 relative">
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
    </AuthProvider>
  );
}
