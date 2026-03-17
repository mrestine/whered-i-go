import { useCallback } from 'react';
import { useAppStatus } from '../context/AppStatusContext';
import type { RoutePoints } from '../types';

interface Props {
  onRouteParsed: (points: RoutePoints) => void;
}

export default function FileDropzone({ onRouteParsed }: Props) {
  const { setStatus, setStatusMessage } = useAppStatus();
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      setStatus('parsing');
      setStatusMessage(`Parsing ${file.name}...`);

      if (ext === 'gpx') {
        const text = await file.text();
        try {
          const GpxParser = (await import('gpxparser')).default;
          const gpx = new GpxParser();
          gpx.parse(text);
          const points: RoutePoints = gpx.tracks
            .flatMap((t) => t.points)
            .map((p) => ({ lat: p.lat, lon: p.lon }));
          onRouteParsed(points);
          setStatusMessage(`Parsed ${points.length} points — fetching boundaries...`);
          setStatus('fetching');
        } catch (err) {
          setStatus('error');
          setStatusMessage(`Failed to parse GPX: ${(err as Error).message}`);
        }
      } else if (ext === 'fit') {
        const buf = await file.arrayBuffer();
        try {
          const FitParser = (await import('fit-file-parser-typescript')).default;
          const parser = new FitParser({ force: true, speedUnit: 'km/h' });
          parser.parse(buf, (error: string | null, data: any) => {
            if (error) {
              setStatus('error');
              setStatusMessage(`Failed to parse FIT: ${error}`);
              return;
            }
            const points: RoutePoints = (data.records ?? [])
              .filter((r: any) => r.position_lat != null && r.position_long != null)
              .map((r: any) => ({ lat: r.position_lat, lon: r.position_long }));
            onRouteParsed(points);
            setStatusMessage(`Parsed ${points.length} points — fetching boundaries...`);
            setStatus('fetching');
          });
        } catch (err) {
          setStatus('error');
          setStatusMessage(`Failed to parse FIT: ${(err as Error).message}`);
        }
      } else {
        setStatus('error');
        setStatusMessage('Unsupported file type. Please use .gpx or .fit');
      }
    },
    [onRouteParsed, setStatus, setStatusMessage],
  );

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        handleFile(e.dataTransfer.files[0]);
      }}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => document.getElementById('file-input')?.click()}
      className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-blue-500 hover:bg-gray-900 transition-colors cursor-pointer"
    >
      <input
        id="file-input"
        type="file"
        accept=".gpx,.fit"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="text-3xl mb-2">🗺️</div>
      <p className="text-sm font-medium text-gray-300">Drop a .gpx or .fit file</p>
      <p className="text-xs text-gray-500 mt-1">or click to browse</p>
    </div>
  );
}
