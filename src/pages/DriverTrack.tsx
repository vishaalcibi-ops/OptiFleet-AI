import { useEffect, useState, useRef } from 'react';
import { Truck, Navigation, AlertCircle, CheckCircle2, AlertOctagon, Check, Package, MapPin, Flag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Lorry, Shipment } from '@/types';

interface DriverTrackProps {
  token?: string;
}

export function DriverTrack({ token: propToken }: DriverTrackProps) {
  // Read token from prop or URL path (/track/:token or #/track/:token)
  const [urlToken] = useState<string>(() => {
    if (propToken) return propToken;
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

  const [loading, setLoading] = useState<boolean>(true);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [tokenInfo, setTokenInfo] = useState<{ token: string; lorryId: string; shipmentId: string } | null>(null);
  const [lorry, setLorry] = useState<Lorry | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);

  const [status, setStatus] = useState<'requesting' | 'sharing' | 'denied' | 'error'>('requesting');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  
  const [actionDone, setActionDone] = useState<'breakdown' | 'delivered' | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [showBreakdownConfirm, setShowBreakdownConfirm] = useState<boolean>(false);
  const [showDeliveredConfirm, setShowDeliveredConfirm] = useState<boolean>(false);

  const lastWriteRef = useRef<number>(0);
  const THROTTLE_MS = 20000;

  // 1. Resolve tracking token on load
  useEffect(() => {
    let isMounted = true;
    async function resolveToken() {
      setLoading(true);
      if (!urlToken) {
        if (isMounted) { setIsExpired(true); setLoading(false); }
        return;
      }

      try {
        // Query driver_tracking_links by token
        const { data: linkData, error: linkErr } = await supabase
          .from('driver_tracking_links')
          .select('*')
          .eq('tracking_token', urlToken)
          .maybeSingle();

        if (linkErr || !linkData) {
          // If token not found in DB, check if token is a raw lorry_id fallback (e.g. L01)
          const { data: lorryFallback } = await supabase
            .from('lorries')
            .select('*')
            .eq('lorry_id', urlToken)
            .maybeSingle();

          if (lorryFallback) {
            // Raw lorry ID fallback — resolution succeeded
            const activeShipmentId = lorryFallback.current_shipment_id || 'S001';
            const { data: shipData } = await supabase
              .from('shipments')
              .select('*')
              .eq('shipment_id', activeShipmentId)
              .maybeSingle();

            if (isMounted) {
              setTokenInfo({ token: urlToken, lorryId: lorryFallback.lorry_id, shipmentId: activeShipmentId });
              setLorry(lorryFallback as Lorry);
              if (shipData) setShipment(shipData as Shipment);
              setLoading(false);
            }
            return;
          }

          // Also check localStorage token cache
          try {
            const cache = JSON.parse(localStorage.getItem('optifleet_tracking_tokens') || '{}');
            const cachedObj = cache[urlToken];
            if (cachedObj && cachedObj.lorry_id) {
              setTokenInfo({ token: urlToken, lorryId: cachedObj.lorry_id, shipmentId: cachedObj.shipment_id || 'S001' });
              setLoading(false);
              return;
            }
          } catch {}

          if (isMounted) {
            setIsExpired(true);
            setLoading(false);
          }
          return;
        }

        // Check if token is expired
        if (linkData.expired_at) {
          if (isMounted) { setIsExpired(true); setLoading(false); }
          return;
        }

        // Valid active token! Fetch linked shipment & lorry
        const [lorryRes, shipmentRes] = await Promise.all([
          supabase.from('lorries').select('*').eq('lorry_id', linkData.lorry_id).maybeSingle(),
          supabase.from('shipments').select('*').eq('shipment_id', linkData.shipment_id).maybeSingle(),
        ]);

        if (isMounted) {
          setTokenInfo({ token: urlToken, lorryId: linkData.lorry_id, shipmentId: linkData.shipment_id });
          if (lorryRes.data) setLorry(lorryRes.data as Lorry);
          if (shipmentRes.data) setShipment(shipmentRes.data as Shipment);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error resolving tracking token:', err);
        if (isMounted) { setIsExpired(true); setLoading(false); }
      }
    }

    resolveToken();
    return () => { isMounted = false; };
  }, [urlToken]);

  // 2. Continuous GPS Tracking
  useEffect(() => {
    if (!tokenInfo || actionDone) return;

    if (!('geolocation' in navigator)) {
      setStatus('error');
      setErrorMessage('GPS geolocation is not supported by this browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        setStatus('sharing');

        // Throttle updates every 20 seconds
        const now = Date.now();
        if (now - lastWriteRef.current >= THROTTLE_MS) {
          lastWriteRef.current = now;
          try {
            // Call driver_update_gps RPC
            await supabase.rpc('driver_update_gps', {
              p_token: tokenInfo.token,
              p_lat: lat,
              p_lng: lng,
            });
            setLastUpdate(new Date());
          } catch {
            // Fallback direct lorry GPS update
            try {
              await supabase.from('lorries').update({
                last_gps_latitude: lat,
                last_gps_longitude: lng,
                last_gps_updated_at: new Date().toISOString(),
                current_latitude: lat,
                current_longitude: lng,
              }).eq('lorry_id', tokenInfo.lorryId);
              setLastUpdate(new Date());
            } catch {}
          }
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
        } else {
          setStatus('error');
          setErrorMessage('Unable to retrieve high-precision GPS signal.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );

    return () => { navigator.geolocation.clearWatch(watchId); };
  }, [tokenInfo, actionDone]);

  // Action 1: Report Breakdown / Emergency SOS
  const executeReportBreakdown = async () => {
    if (!tokenInfo) return;
    setActionLoading(true);
    const now = new Date().toISOString();
    try {
      // 1. Try RPC driver_report_breakdown
      const { error: rpcErr } = await supabase.rpc('driver_report_breakdown', { p_token: tokenInfo.token });

      if (rpcErr) {
        // Fallback updates if RPC is not compiled in DB yet
        await Promise.all([
          supabase.from('shipments').update({ shipment_status: 'unassigned', status: 'unassigned', assigned_lorry_id: null, assigned_driver_name: null, updated_at: now }).eq('shipment_id', tokenInfo.shipmentId),
          supabase.from('lorries').update({ status: 'maintenance', assignment_status: 'available', is_breakdown: true, breakdown_at: now, current_shipment_id: null, updated_at: now }).eq('lorry_id', tokenInfo.lorryId),
          supabase.from('driver_alerts').insert({ lorry_id: tokenInfo.lorryId, shipment_id: tokenInfo.shipmentId, alert_type: 'BREAKDOWN', message: `${tokenInfo.lorryId} reported a breakdown while carrying ${tokenInfo.shipmentId}. Shipment returned to queue.` }),
          supabase.from('driver_tracking_links').update({ expired_at: now }).eq('tracking_token', tokenInfo.token),
        ]);
      }

      setActionDone('breakdown');
      setShowBreakdownConfirm(false);
    } catch (err) {
      console.error('Breakdown report error:', err);
      alert('Could not send alert. Please check your internet connection.');
    } finally {
      setActionLoading(false);
    }
  };

  // Action 2: Reached Destination / Mark Delivered
  const executeMarkDelivered = async () => {
    if (!tokenInfo) return;
    setActionLoading(true);
    const now = new Date().toISOString();
    try {
      // 1. Try RPC driver_mark_delivered
      const { error: rpcErr } = await supabase.rpc('driver_mark_delivered', { p_token: tokenInfo.token });

      if (rpcErr) {
        // Fallback updates
        const destName = shipment?.destination_name || 'Destination';
        const destLat = shipment?.destination_latitude || lorry?.current_latitude || 13.0827;
        const destLng = shipment?.destination_longitude || lorry?.current_longitude || 80.2707;

        await Promise.all([
          supabase.from('shipments').update({ shipment_status: 'delivered', status: 'delivered', updated_at: now }).eq('shipment_id', tokenInfo.shipmentId),
          supabase.from('lorries').update({
            current_location_name: destName, current_latitude: destLat, current_longitude: destLng,
            assignment_status: 'available', current_shipment_id: null, last_gps_latitude: destLat, last_gps_longitude: destLng, last_gps_updated_at: now, updated_at: now,
          }).eq('lorry_id', tokenInfo.lorryId),
          supabase.from('driver_tracking_links').update({ expired_at: now }).eq('tracking_token', tokenInfo.token),
        ]);
      }

      setActionDone('delivered');
      setShowDeliveredConfirm(false);
    } catch (err) {
      console.error('Mark delivered error:', err);
      alert('Could not update status. Please check your internet connection.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-sky-400 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-200">Loading Tracking Portal...</h2>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <AlertCircle size={36} />
          </div>
          <h1 className="text-2xl font-black text-slate-100">Tracking Link No Longer Active</h1>
          <p className="text-slate-400 text-sm">
            This tracking link has expired, been completed, or reassigned. Please contact your dispatch team if you need a new tracking link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 text-center font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Header / Vehicle & Driver Info */}
        <div className="flex flex-col items-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
            <Truck size={36} />
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Active Delivery Job</span>
            <h1 className="text-3xl font-black tracking-tight text-sky-400 mt-0.5">{tokenInfo?.lorryId || 'Lorry'}</h1>
            {lorry?.driver_name && <p className="text-sm text-slate-300 font-medium mt-0.5">Driver: {lorry.driver_name}</p>}
          </div>
        </div>

        {/* Shipment Details Box */}
        {tokenInfo && (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-left text-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono font-extrabold text-sky-400 flex items-center gap-1.5">
                <Package size={16} /> {tokenInfo.shipmentId}
              </span>
              {shipment?.delivery_deadline && (
                <span className="text-xs text-amber-400 font-medium">
                  Deadline: {new Date(shipment.delivery_deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="space-y-1 pt-1 border-t border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <MapPin size={14} className="shrink-0" />
                <span><strong>Pickup:</strong> {shipment?.pickup_location_name || 'Loading Point'}</span>
              </div>
              <div className="flex items-center gap-2 text-rose-400 font-medium">
                <Flag size={14} className="shrink-0" />
                <span><strong>Destination:</strong> {shipment?.destination_name || 'Delivery Point'}</span>
              </div>
            </div>
          </div>
        )}

        {/* GPS Status Indicator Banner */}
        {!actionDone && (
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
            {status === 'sharing' && (
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  GPS Live Location Sharing
                </div>
                {coords && (
                  <p className="text-[11px] text-slate-400 font-mono">
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </p>
                )}
                {lastUpdate && (
                  <p className="text-[10px] text-slate-500">
                    Synced: {lastUpdate.toLocaleTimeString()} (throttled 20s)
                  </p>
                )}
              </div>
            )}

            {status === 'denied' && (
              <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-amber-400" />
                Location sharing is off — turn on GPS to appear live on the fleet map
              </div>
            )}

            {status === 'requesting' && (
              <div className="flex items-center justify-center gap-2 text-amber-400 font-medium text-xs py-1">
                <Navigation size={14} className="animate-spin" />
                Requesting GPS location access...
              </div>
            )}
          </div>
        )}

        {/* Completed Action State */}
        {actionDone === 'breakdown' && (
          <div className="p-6 rounded-2xl bg-red-950/50 border border-red-500/50 space-y-2 text-center">
            <AlertOctagon size={40} className="text-red-500 animate-bounce mx-auto" />
            <h3 className="text-lg font-bold text-red-400">Reported. Fleet team has been alerted.</h3>
            <p className="text-xs text-slate-300">
              Your breakdown report has been dispatched to the fleet manager dashboard. Help is on the way.
            </p>
          </div>
        )}

        {actionDone === 'delivered' && (
          <div className="p-6 rounded-2xl bg-emerald-950/50 border border-emerald-500/50 space-y-2 text-center">
            <CheckCircle2 size={40} className="text-emerald-400 animate-bounce mx-auto" />
            <h3 className="text-xl font-bold text-emerald-400">Delivered! Thank you.</h3>
            <p className="text-xs text-slate-300">
              Shipment completed successfully. Lorry position has been updated to {shipment?.destination_name || 'destination'}.
            </p>
          </div>
        )}

        {/* Action Buttons (Visible when job is active) */}
        {!actionDone && (
          <div className="border-t border-slate-800/80 pt-5 space-y-3">
            {/* Green Delivery Button */}
            <button
              onClick={() => setShowDeliveredConfirm(true)}
              disabled={actionLoading}
              className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-extrabold text-lg shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5"
            >
              <CheckCircle2 size={24} />
              ✅ Reached Destination
            </button>

            {/* Red Breakdown Button */}
            <button
              onClick={() => setShowBreakdownConfirm(true)}
              disabled={actionLoading}
              className="w-full py-3.5 px-6 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-base shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2.5"
            >
              <AlertOctagon size={20} />
              🔴 Report Breakdown / Problem
            </button>
          </div>
        )}

        {/* Breakdown Confirmation Modal */}
        {showBreakdownConfirm && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="max-w-sm w-full bg-slate-900 border border-red-500/50 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-scale-in">
              <AlertOctagon size={48} className="text-red-500 mx-auto animate-pulse" />
              <h3 className="text-xl font-black text-white">Confirm Breakdown Report?</h3>
              <p className="text-xs text-slate-300">
                Are you sure? This will unassign your shipment and alert the fleet team immediately.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBreakdownConfirm(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={executeReportBreakdown}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  {actionLoading ? 'Reporting...' : 'Yes, Alert Team'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delivered Confirmation Modal */}
        {showDeliveredConfirm && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="max-w-sm w-full bg-slate-900 border border-emerald-500/50 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-scale-in">
              <CheckCircle2 size={48} className="text-emerald-400 mx-auto" />
              <h3 className="text-xl font-black text-white">Confirm Delivery?</h3>
              <p className="text-xs text-slate-300">
                Mark shipment {tokenInfo?.shipmentId} as delivered to {shipment?.destination_name || 'destination'}?
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDeliveredConfirm(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={executeMarkDelivered}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  {actionLoading ? 'Updating...' : 'Yes, Delivered'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 text-xs text-slate-500">
          OptiFleet Smart Logistics Driver Portal · Secured Token Session
        </div>

      </div>
    </div>
  );
}

