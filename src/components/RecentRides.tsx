import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import StravaAuthButton from './StravaAuthButton';
import type { RoutePoints, StoredRide } from '../types';

interface Props {
  onRouteParsed: (points: RoutePoints) => void;
}

function RecentRidesHeader() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1.5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Rides</h2>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200 text-[10px] leading-none transition-colors"
          aria-label="About Recent Rides"
        >
          ?
        </button>
        {open && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 px-2.5 py-2 rounded bg-gray-900 border border-gray-700 text-xs text-gray-300 shadow-lg z-10">
            Rides are added automatically after they're posted to Strava. Before that, up to your
            last 5 outdoor rides out of your most recent 100 activities are shown here.
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-gray-700" />
          </div>
        )}
      </div>
      <div className="ml-auto">
        <StravaAuthButton />
      </div>
    </div>
  );
}

export default function RecentRides({ onRouteParsed }: Props) {
  const { user } = useAuth();
  const [rides, setRides] = useState<StoredRide[]>([]);
  const [loadingRides, setLoadingRides] = useState<boolean>(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setRides([]);
      return;
    }
    setLoadingRides(true);
    fetch('/api/rides', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setRides(data.rides ?? []))
      .catch(() => setRides([]))
      .finally(() => setLoadingRides(false));
  }, [user]);

  const handleClick = async (ride: StoredRide) => {
    setLoadingId(ride.activityId);
    try {
      const res = await fetch(`/api/rides/${ride.activityId}`, { credentials: 'include' });
      const data = await res.json();
      const points: RoutePoints = (data.points as [number, number][]).map(([lat, lon]) => ({
        lat,
        lon,
      }));
      setSelectedId(ride.activityId);
      onRouteParsed(points);
    } catch {
      // ignore
    } finally {
      setLoadingId(null);
    }
  };

  const formatDistance = (meters: number) => `${(meters / 1000).toFixed(1)} km`;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-4 border-b border-gray-800">
      <div className="">
        <RecentRidesHeader />
        {loadingRides ? (
          <ul className="space-y-1 mt-2">
            {[...Array(2)].map((_, i) => (
              <li key={i} className="px-3 py-2">
                <div className="h-5 bg-gray-800 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-gray-800 rounded animate-pulse w-1/2 mt-0.5" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1 mt-2 md:max-h-64 md:overflow-y-auto">
            {rides.map((ride) => (
              <li key={ride.activityId}>
                <button
                  onClick={() => selectedId !== ride.activityId && handleClick(ride)}
                  disabled={loadingId !== null}
                  className={`w-full text-left px-3 py-2 rounded transition-colors disabled:opacity-50 group ${selectedId === ride.activityId ? 'bg-gray-700 cursor-default' : 'hover:bg-gray-800'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-100 truncate group-hover:text-white">
                      {loadingId === ride.activityId ? (
                        <span className="text-gray-400">Loading…</span>
                      ) : (
                        ride.name
                      )}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDistance(ride.distanceMeters)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{formatDate(ride.startDate)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
