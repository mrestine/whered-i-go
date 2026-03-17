import { AppStatus } from '../types';
import { useAppStatus } from '../context/AppStatusContext';

const STATUS_STYLES: Record<AppStatus, string> = {
  idle: 'bg-gray-800 text-gray-400',
  parsing: 'bg-blue-900 text-blue-200',
  fetching: 'bg-yellow-900 text-yellow-200',
  processing: 'bg-orange-900 text-orange-200',
  done: 'bg-green-900 text-green-200',
  error: 'bg-red-900 text-red-200',
};

const STATUS_ICONS: Record<AppStatus, string> = {
  idle: '○',
  parsing: '⟳',
  fetching: '⟳',
  processing: '⟳',
  done: '✓',
  error: '✗',
};

export default function StatusBar() {
  const { status, statusMessage: message } = useAppStatus();
  const spinning = ['parsing', 'fetching', 'processing'].includes(status);
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 px-4 py-2 text-xs flex items-center gap-2 ${STATUS_STYLES[status]}`}
    >
      <span className={spinning ? 'animate-spin inline-block' : ''}>{STATUS_ICONS[status]}</span>
      <span>{message || 'Drop a file to begin'}</span>
    </div>
  );
}
