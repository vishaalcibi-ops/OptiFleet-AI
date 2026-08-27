import { useEffect, useState, useRef } from 'react';
import { Truck, Navigation, AlertCircle, CheckCircle2, AlertOctagon, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DriverTrackProps {
  lorryId?: string;
}

export function DriverTrack({ lorryId: propLorryId }: DriverTrackProps) {
  // Read lorryId from prop or URL path (/track/:lorryId or #/track/:lorryId)
  const [lorryId] = useState<string>(() => {
    if (propLorryId) return propLorryId;
    const path = window.location.pathname;
    if (path.startsWith('/track/')) {
      return decodeURIComponent(path.replace('/track/', '').split('/')[0].split('?')[0]);
    }
    const hash = window.location.hash;
    if (hash.startsWith('#/track/')) {
      return decodeURIComponent(hash.replace('#/track/', '').split('/')[0].split('?')[0]);
    }
    return '';
  });

  const [status, setStatus] = useState<'requesting' | 'sharing' | 'denied' | 'error'>('requesting');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isBreakdown, setIsBreakdown] = useState<boolean>(false);
  const [sosLoading, setSosLoading] = useState<boolean>(false);

  // Throttle writes to at most once every 20 seconds (20,000 ms)
  const lastWriteRef = useRef<number>(0);
  const THROTTLE_MS = 20000;

  // On page load, check current is_breakdown status from Supabase
  useEffect(() => {
    if (!lorryId) return;
    async function checkLorryStatus() {
      try {
        const { data } = await supabase
          .from('lorries')
          .select('is_breakdown')
          .eq('lorry_id', lorryId)
          .maybeSingle();

        if (data && data.is_breakdown != null) {
          setIsBreakdown(Boolean(data.is_breakdown));
        }
      } catch (err) {
        console.error('Error fetching initial breakdown status:', err);
      }
    }
    checkLorryStatus();
  }, [lorryId]);

  // Continuous geolocation tracking
  useEffect(() => {
    if (!lorryId) {
      setStatus('error');
      setErrorMessage('No Lorry ID specified in tracking URL.');
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatus('error');
      setErrorMessage('GPS geolocation is not supported by this browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speed = pos.coords.speed != null ? pos.coords.speed * 3.6 : null;
        const heading = pos.coords.heading ?? null;

        // Update UI state immediately without waiting for DB throttle
        setCoords({ lat, lng });
        setStatus('sharing');

        // Throttle Supabase DB writes to once every 20 seconds
        const now = Date.now();
        if (now - lastWriteRef.current >= THROTTLE_MS) {
          lastWriteRef.current = now;
          const timestamp = new Date().toISOString();
          try {
            await supabase
              .from('lorries')
              .update({
                current_latitude: lat,
                current_longitude: lng,
                speed_kmh: speed,
                heading_deg: heading,
                last_location_update: timestamp,
                updated_at: timestamp,
              })
              .eq('lorry_id', lorryId);

            setLastUpdate(new Date());
          } catch (err) {
            console.error('Supabase location update error:', err);
          }
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setErrorMessage('Please allow location access in your browser to share your position.');
        } else if (err.code === err.TIMEOUT) {
          setStatus('error');
          setErrorMessage('Location request timed out. Retrying...');
        } else {
          setStatus('error');
          setErrorMessage('Unable to retrieve location. Please check GPS settings.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [lorryId]);

  // Handle Report Breakdown SOS
  const handleReportBreakdown = async () => {
    if (!lorryId) return;
    setSosLoading(true);
    const now = new Date().toISOString();
    try {
      await supabase
        .from('lorries')
        .update({
          is_breakdown: true,
          breakdown_at: now,
          updated_at: now,
        })
        .eq('lorry_id', lorryId);

      setIsBreakdown(true);
    } catch (err) {
      console.error('Failed to report breakdown:', err);
      alert('Could not report breakdown. Please check internet connection.');
    } finally {
      setSosLoading(false);
    }
  };

  // Handle Cancel Breakdown
  const handleCancelBreakdown = async () => {
    if (!lorryId) return;
    setSosLoading(true);
    const now = new Date().toISOString();
    try {
      await supabase
        .from('lorries')
        .update({
          is_breakdown: false,
          breakdown_at: null,
          updated_at: now,
        })
        .eq('lorry_id', lorryId);

      setIsBreakdown(false);
    } catch (err) {
      console.error('Failed to cancel breakdown:', err);
    } finally {
      setSosLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 text-center font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Header / Vehicle Info */}
        <div className="flex flex-col items-center space-y-2">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${isBreakdown ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse' : 'bg-sky-500/10 border border-sky-500/20 text-sky-400'}`}>
            {isBreakdown ? <AlertOctagon size={36} /> : <Truck size={36} />}
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Lorry Driver Tracking</span>
            <h1 className="text-3xl font-black tracking-tight text-sky-400 mt-0.5">{lorryId || 'Unknown Lorry'}</h1>
          </div>
        </div>

        {/* GPS Status Indicator */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
          {status === 'sharing' && (
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-lg">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                Sharing location...
              </div>
              {coords && (
                <p className="text-xs text-slate-400 font-mono">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              )}
              {lastUpdate && (
                <p className="text-[11px] text-slate-500">
                  Last synced: {lastUpdate.toLocaleTimeString()} (throttled 20s)
                </p>
              )}
            </div>
          )}

          {status === 'requesting' && (
            <div className="flex items-center justify-center gap-2 text-amber-400 font-medium py-1">
              <Navigation size={18} className="animate-spin" />
              Location permission needed
            </div>
          )}

          {status === 'denied' && (
            <div className="space-y-2 text-rose-400 py-1">
              <div className="flex items-center justify-center gap-2 font-bold text-base">
                <AlertCircle size={20} />
                Location Access Denied
              </div>
              <p className="text-sm text-slate-300">
                Please allow location access in your browser to share your position.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-1 text-rose-400 py-1">
              <div className="flex items-center justify-center gap-2 font-semibold">
                <AlertCircle size={18} />
                Error
              </div>
              <p className="text-xs text-slate-300">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* SOS Breakdown Section */}
        <div className="border-t border-b border-slate-800/80 py-5 space-y-3">
          {!isBreakdown ? (
            <button
              onClick={handleReportBreakdown}
              disabled={sosLoading}
              className="w-full py-4 px-6 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-extrabold text-lg shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2.5"
            >
              <AlertOctagon size={24} />
              {sosLoading ? 'Alerting Dispatcher...' : '🚨 Report Breakdown'}
            </button>
          ) : (
            <div className="space-y-3 bg-red-950/40 border border-red-500/40 rounded-2xl p-4 animate-fade-in">
              <div className="flex items-center justify-center gap-2 text-red-400 font-bold text-base">
                <AlertOctagon size={20} className="animate-bounce text-red-500" />
                Breakdown reported. Dispatcher has been alerted.
              </div>
              <p className="text-xs text-slate-300">
                Live SOS signal is actively flashing on dispatcher dashboards.
              </p>
              <button
                onClick={handleCancelBreakdown}
                disabled={sosLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 text-sm font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <Check size={16} className="text-emerald-400" />
                {sosLoading ? 'Updating...' : "I'm okay now — cancel"}
              </button>
            </div>
          )}
        </div>

        {/* Driving Keep Alive Notice */}
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-300 flex items-center justify-center gap-2">
            <CheckCircle2 size={16} className="text-sky-400 shrink-0" />
            Keep this tab open while driving
          </p>
          <p className="text-xs text-slate-500">
            OptiFleet GPS live dispatcher stream · No driver login required
          </p>
        </div>

      </div>
    </div>
  );
}
