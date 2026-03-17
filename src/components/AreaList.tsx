import { useState } from 'react';
import type { AppStatus, Area } from '../types';
import { useAppStatus } from '../context/AppStatusContext';

interface Props {
  areas: Area[];
  onHover: (name: string) => void;
  onHoverEnd: (name: string) => void;
}

const LABELS: Record<number, string> = { 4: 'State / Province', 6: 'County', 8: 'Town' };
const COLORS: Record<number, string> = {
  4: 'bg-purple-900 text-purple-200',
  6: 'bg-blue-900 text-blue-200',
  8: 'bg-green-900 text-green-200',
};

const PROCESSING_STATUSES: AppStatus[] = ['parsing', 'fetching', 'processing'];

export default function AreaList({ areas, onHover, onHoverEnd }: Props) {
  const { status, statusMessage } = useAppStatus();
  const [uniqueOnly, setUniqueOnly] = useState(false);
  const isProcessing = PROCESSING_STATUSES.includes(status);

  const areasToDisplay = uniqueOnly
    ? areas.filter((area, i, arr) => arr.findIndex((a) => a.name === area.name) === i)
    : areas;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {areasToDisplay.length} area{areasToDisplay.length !== 1 ? 's' : ''} crossed
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={uniqueOnly}
            onChange={(e) => setUniqueOnly(e.target.checked)}
            className="accent-blue-500 w-3.5 h-3.5 cursor-pointer"
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">Unique only</span>
        </label>
      </div>

      {/* Scrollable list */}
      {areasToDisplay.length === 0 && !isProcessing ? (
        <div className="flex-1 flex items-center justify-center p-6 text-gray-600 text-sm text-center">
          Areas crossed will appear here after processing
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {areasToDisplay.map((area, i) => (
            <li
              key={i}
              onMouseEnter={() => onHover(area.name)}
              onMouseLeave={() => onHoverEnd(area.name)}
              onTouchStart={() => onHover(area.name)}
              onTouchEnd={() => onHoverEnd(area.name)}
              className="px-4 py-3 border-b border-gray-800 hover:bg-gray-900 transition-colors cursor-default"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm text-gray-100">{area.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${COLORS[area.adminLevel] ?? 'bg-gray-800 text-gray-300'}`}
                >
                  {LABELS[area.adminLevel] ?? `Level ${area.adminLevel}`}
                </span>
              </div>
            </li>
          ))}

          {/* Processing indicator as the next list item */}
          {isProcessing && (
            <li className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
              <span className="text-xs text-gray-400 ml-1 truncate">{statusMessage}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
