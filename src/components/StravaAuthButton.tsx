import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
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

  // the user won't ever be null here since it's checked in the parent component
  // but otherwise typescript will whine that user is possibly null
  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((open) => !open)}
        aria-label="Account menu"
        className={`block rounded-full focus:outline-none ring-2 ${open ? 'ring-orange-500' : 'ring-transparent'}`}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.athleteName} className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-sm font-semibold">
            {user.athleteName.charAt(0)}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded bg-gray-900 border border-gray-700 shadow-lg z-10 py-1">
          <div className="px-3 py-2 text-sm text-gray-300 border-b border-gray-700 truncate">
            {user.athleteName}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function StravaAuthButton() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="h-8 w-8 bg-gray-700 rounded-full animate-pulse" />;
  }

  return user ? (
    <UserMenu />
  ) : (
    <a href="/api/auth/strava">
      <img
        src="/assets/connect-with-strava.png"
        alt="Connect with Strava"
        height={32}
        style={{ height: '32px', width: 'auto' }}
      />
    </a>
  );
}
