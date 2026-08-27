import { useEffect, useState, useMemo, useRef } from 'react';
import { Map as MapIcon, Radio, Activity, Navigation, LocateFixed, LocateOff, Info } from 'lucide-react';
import { Map } from '@/components/Map';
import { useStore } from '@/lib/store';

export function FleetMap() {
  const { lorries, shipments, currentResult, assignments, updateLorryGPS, subscribeToLorries } = useStore();
  const [selectedLorryId, setSelectedLorryId] = useState<string>('');
  const [trackingMode, setTrackingMode] = useState<'OFF' | 'LIVE' | 'SIMULATION'>('OFF');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<number | null>(null);

  // Subscribe to realtime updates on mount
  useEffect(() => {
    const unsubscribe = subscribeToLorries();
    return () => unsubscribe();
  }, [subscribeToLorries]);

  // Handle GPS / Simulation stopping on unmount or mode change
  useEffect(() => {
    return () => stopTracking();
  }, []);

  const selectedLorry = lorries.find((l) => l.lorry_id === selectedLorryId);

  const startLiveGPS = () => {
    if (!selectedLorryId) return;
    stopTracking();
    setErrorMsg(null);
    if (!('geolocation' in navigator)) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }
    setTrackingMode('LIVE');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void updateLorryGPS(
          selectedLorryId,
          position.coords.latitude,
          position.coords.longitude,
          position.coords.speed ? position.coords.speed * 3.6 : null, // m/s to km/h
          position.coords.heading
        );
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setErrorMsg('Location permission denied.');
        else if (error.code === error.POSITION_UNAVAILABLE) setErrorMsg('Location unavailable.');
        else if (error.code === error.TIMEOUT) setErrorMsg('Location request timed out.');
        else setErrorMsg(error.message);
        setTrackingMode('OFF');
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  const startSimulation = () => {
    if (!selectedLorry) return;
    stopTracking();
    setErrorMsg(null);
    setTrackingMode('SIMULATION');

    // Simulate moving from current location towards a hardcoded route (e.g. Chennai to Erode)
    const simPoints = [
      [13.0827, 80.2707], [12.9815, 80.2180], [12.8364, 79.9880], [12.6310, 79.8000], [12.2855, 79.0664], [11.6643, 78.1460], [11.3424, 77.7281]
    ];
    let currentIndex = 0;
    
    // Teleport to start immediately if simulation starts
    void updateLorryGPS(selectedLorryId, simPoints[0][0], simPoints[0][1], 60, 240);

    simIntervalRef.current = window.setInterval(() => {
      currentIndex = (currentIndex + 1) % simPoints.length;
      const point = simPoints[currentIndex];
      void updateLorryGPS(selectedLorryId, point[0], point[1], 65, 240);
    }, 5000); // Wait 5s between moves to respect throttle
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simIntervalRef.current !== null) {
      window.clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setTrackingMode('OFF');
  };

  // Build fallback routes from persistent assignments
  const latestAssignmentRoutes = useMemo(() => {
    if (currentResult) return []; // Map handles plans
    const grouped = assignments.reduce((acc, a) => {
      if (!acc[a.lorry_id] || a.optimization_run_id > acc[a.lorry_id].run_id) {
        acc[a.lorry_id] = { run_id: a.optimization_run_id, points: [] };
      }
      return acc;
    }, {} as Record<string, { run_id: string; points: [number, number][] }>);

    // This is a naive reconstruction just to show *some* route persistence
    // Without full location coords in assignments it's not perfect, but map will center on lorry anyway.
    return Object.entries(grouped).map(([lorry_id]) => {
       const lorry = lorries.find(l => l.lorry_id === lorry_id);
       return {
         id: lorry?.id ?? lorry_id,
         points: lorry ? [[lorry.current_latitude, lorry.current_longitude] as [number, number]] : []
       };
    });
  }, [assignments, currentResult, lorries]);

  const activeCount = lorries.filter(l => l.status === 'active').length;
  const maintenanceCount = lorries.filter(l => l.status === 'maintenance').length;
  const availableCount = lorries.filter(l => l.assignment_status === 'available').length;
  const gpsConnected = lorries.filter(l => {
    if (!l.last_location_update) return false;
    const diff = Date.now() - new Date(l.last_location_update).getTime();
    return diff < 60000; // Updated in last 60 seconds
  }).length;

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <MapIcon size={20} className="text-accent-400" />
          Live Fleet Map
        </h2>
        <p className="text-sm text-gray-500">
          Real-time GPS tracking integrated with Supabase Realtime.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-gray-100 flex items-center gap-2">
              <Activity size={18} className="text-accent-400" /> Fleet Summary
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-base-900 p-2 rounded border border-base-700">
                <div className="text-gray-400">Total Lorries</div>
                <div className="text-xl font-bold text-gray-100">{lorries.length}</div>
              </div>
              <div className="bg-base-900 p-2 rounded border border-base-700">
                <div className="text-gray-400">GPS Live</div>
                <div className="text-xl font-bold text-success-500">{gpsConnected}</div>
              </div>
              <div className="bg-base-900 p-2 rounded border border-base-700">
                <div className="text-gray-400">Active</div>
                <div className="text-xl font-bold text-accent-400">{activeCount}</div>
              </div>
              <div className="bg-base-900 p-2 rounded border border-base-700">
                <div className="text-gray-400">Maintenance</div>
                <div className="text-xl font-bold text-warning-500">{maintenanceCount}</div>
              </div>
            </div>
          </div>

          <div className="card p-4 space-y-4">
            <h3 className="font-semibold text-gray-100 flex items-center gap-2">
              <Navigation size={18} className="text-accent-400" /> GPS Tracking
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Select Lorry for GPS source:</label>
              <select 
                className="input w-full"
                value={selectedLorryId} 
                onChange={(e) => {
                  setSelectedLorryId(e.target.value);
                  if (trackingMode !== 'OFF') stopTracking();
                }}
              >
                <option value="">-- Select Lorry --</option>
                {lorries.map(l => (
                  <option key={l.id} value={l.lorry_id}>{l.lorry_id} ({l.status})</option>
                ))}
              </select>
            </div>

            {selectedLorryId && (
              <div className="flex flex-col gap-2">
                {trackingMode === 'OFF' ? (
                  <>
                    <button className="btn btn-primary w-full flex items-center justify-center gap-2" onClick={startLiveGPS}>
                      <LocateFixed size={18} /> Start Live GPS
                    </button>
                    <button className="btn bg-base-700 hover:bg-base-600 text-gray-200 border-base-600 w-full flex items-center justify-center gap-2" onClick={startSimulation}>
                      <Radio size={18} /> Start Simulation
                    </button>
                    <button
                      className="btn bg-sky-600 hover:bg-sky-500 text-white w-full flex items-center justify-center gap-2 text-xs font-semibold py-2"
                      onClick={() => window.open(`/track/${selectedLorryId}`, '_blank')}
                    >
                      <Navigation size={15} /> Open Driver View & SOS (New Tab)
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn bg-error-600 hover:bg-error-500 text-white w-full flex items-center justify-center gap-2" onClick={stopTracking}>
                      <LocateOff size={18} /> Stop {trackingMode === 'LIVE' ? 'GPS' : 'Simulation'}
                    </button>
                    <button
                      className="btn bg-sky-600 hover:bg-sky-500 text-white w-full flex items-center justify-center gap-2 text-xs font-semibold py-2"
                      onClick={() => window.open(`/track/${selectedLorryId}`, '_blank')}
                    >
                      <Navigation size={15} /> Open Driver View & SOS (New Tab)
                    </button>
                  </>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="bg-error-900/30 border border-error-500/50 text-error-400 text-sm p-3 rounded flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0" />
                <p>{errorMsg}</p>
              </div>
            )}
            
            {trackingMode !== 'OFF' && selectedLorry && (
              <div className="bg-base-900 border border-base-700 rounded p-3 text-sm space-y-2 mt-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Status</span>
                  <span className={`badge ${trackingMode === 'LIVE' ? 'bg-success-900/50 text-success-400 border-success-700/50' : 'bg-warning-900/50 text-warning-400 border-warning-700/50'}`}>
                    {trackingMode === 'LIVE' ? 'GPS LIVE' : 'SIMULATION'}
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Lat:</span> <span className="font-mono text-gray-300">{selectedLorry.current_latitude.toFixed(5)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Lng:</span> <span className="font-mono text-gray-300">{selectedLorry.current_longitude.toFixed(5)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Speed:</span> <span className="font-mono text-gray-300">{selectedLorry.speed_kmh != null ? `${Math.round(selectedLorry.speed_kmh)} km/h` : '--'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Heading:</span> <span className="font-mono text-gray-300">{selectedLorry.heading_deg != null ? `${Math.round(selectedLorry.heading_deg)}°` : '--'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Last Sync:</span> <span className="text-gray-300">{selectedLorry.last_location_update ? new Date(selectedLorry.last_location_update).toLocaleTimeString() : 'Never'}</span></div>
              </div>
            )}
          </div>
        </div>

        {/* Map Container */}
        <div className="lg:col-span-3 card p-1 sm:p-2 bg-base-800 flex items-stretch">
          <div className="w-full relative min-h-[500px] h-[70vh] rounded overflow-hidden">
            <Map lorries={lorries} shipments={shipments} plans={currentResult?.plans ?? []} latestAssignmentRoutes={latestAssignmentRoutes} />
          </div>
        </div>
      </div>
    </div>
  );
}
