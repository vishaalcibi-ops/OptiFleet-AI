import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Lorry, LorryPlan, Shipment } from '@/types';

import 'leaflet/dist/leaflet.css';

type VehicleVisualState = 'assigned-active' | 'available-active' | 'maintenance' | 'inactive';

interface RouteSegment {
  id: string;
  points: [number, number][];
}

interface FleetMapProps {
  lorries: Lorry[];
  shipments: Shipment[];
  plans: LorryPlan[];
  latestAssignmentRoutes?: RouteSegment[];
}

const statusStyles: Record<VehicleVisualState, { color: string; label: string; stroke?: string }> = {
  'assigned-active': { color: '#1e6fc4', label: 'Assigned (Active)' },
  'available-active': { color: '#fff', stroke: '#10b981', label: 'Available (Active)' },
  maintenance: { color: '#f59e0b', label: 'Maintenance' },
  inactive: { color: '#6b7280', label: 'Inactive' },
};

function createVehicleIcon(status: VehicleVisualState) {
  const { color, stroke, label } = statusStyles[status];
  const fillStyle = stroke
    ? `background-color: ${color}; border: 3px solid ${stroke}; color: ${stroke};`
    : `background-color: ${color}; color: #fff; border: 2px solid #fff;`;

  return L.divIcon({
    className: 'fleet-vehicle-icon',
    html: `<div class="fleet-vehicle-marker" style="${fillStyle}" aria-label="${label} vehicle">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7zM6.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
            </svg>
          </div>`,
    iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -20],
  });
}

function createBreakdownIcon() {
  return L.divIcon({
    className: 'fleet-vehicle-icon-breakdown',
    html: `<div class="fleet-vehicle-marker" style="background-color: #dc2626; color: #ffffff; border: 3px solid #fef08a; animation: pulse 1s infinite; box-shadow: 0 0 15px rgba(220, 38, 38, 0.8);" aria-label="Breakdown vehicle">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 2L1 21h22L12 2zm0 3.5L20.3 19H3.7L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
            </svg>
          </div>`,
    iconSize: [42, 42], iconAnchor: [21, 21], popupAnchor: [0, -22],
  });
}

function MapBounds({ lorries, routes }: { lorries: Lorry[]; routes: RouteSegment[] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [
      ...lorries.map((l) => [l.current_latitude, l.current_longitude] as [number, number]),
      ...routes.flatMap((r) => r.points)
    ];
    if (points.length > 0) {
      map.fitBounds(points, { padding: [42, 42], maxZoom: 12 });
    } else {
      map.setView([13.0827, 80.2707], 11);
    }
  }, [map, lorries, routes]);
  return null;
}

function formatLocationFreshness(lastUpdate?: string | null): string {
  if (!lastUpdate) return 'No live location';
  const diffMs = Date.now() - new Date(lastUpdate).getTime();
  if (isNaN(diffMs) || diffMs < 0) return 'No live location';

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin <= 10) {
    if (diffMin < 1) return '<1m ago';
    return `${diffMin}m ago`;
  }
  return 'No live location';
}

function getVisualState(lorry: Lorry): VehicleVisualState {
  if (lorry.status === 'maintenance') return 'maintenance';
  if (lorry.status === 'inactive') return 'inactive';
  if (lorry.assignment_status === 'assigned') return 'assigned-active';
  return 'available-active';
}

function getRouteForLorry(lorry: Lorry, plan?: LorryPlan): [number, number][] {
  const start: [number, number] = [lorry.current_latitude, lorry.current_longitude];
  return plan?.route?.length ? [start, ...plan.route.map((point) => [point.lat, point.lng] as [number, number])] : [start];
}

export function Map({ lorries, shipments, plans, latestAssignmentRoutes = [] }: FleetMapProps) {
  const routes = useMemo<RouteSegment[]>(() => {
    if (plans.length > 0) {
      return plans.map((plan) => ({
        id: plan.lorry.id,
        points: getRouteForLorry(plan.lorry, plan),
      }));
    }
    // Fallback to persisted routes
    return latestAssignmentRoutes;
  }, [plans, latestAssignmentRoutes]);

  return <div className="fleet-map-shell">
    <div className="fleet-map-legend" aria-label="Vehicle status legend">
      {(Object.keys(statusStyles) as VehicleVisualState[]).map((status) => (
        <span key={status} className="fleet-map-legend-item">
          <span className="fleet-map-status-dot" style={{
            backgroundColor: statusStyles[status].color,
            border: statusStyles[status].stroke ? `2px solid ${statusStyles[status].stroke}` : 'none'
          }} />
          {statusStyles[status].label}
        </span>
      ))}
      <span className="fleet-map-legend-item">
        <span className="fleet-map-status-dot" style={{ backgroundColor: '#dc2626', border: '1px solid #fef08a' }} />
        🚨 Breakdown SOS
      </span>
      <span className="fleet-map-live-indicator text-gray-500">Positions from last sync</span>
    </div>
    <MapContainer center={[13.0827, 80.2707]} zoom={11} scrollWheelZoom className="fleet-leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapBounds lorries={lorries} routes={routes} />
      
      {routes.map((route, index) => route.points.length > 1 && (
        <Polyline
          key={route.id}
          positions={route.points}
          pathOptions={{
            color: index === 0 ? '#0284c7' : '#f59e0b',
            weight: index === 0 ? 5 : 3,
            opacity: index === 0 ? 0.95 : 0.65,
            dashArray: index === 0 ? undefined : '6 6',
          }}
        />
      ))}
      
      {shipments.flatMap((shipment) => [
        { id: `${shipment.id}-pickup`, position: [shipment.pickup_latitude, shipment.pickup_longitude] as [number, number], color: '#10b981', label: `🟢 Pickup: ${shipment.shipment_id}`, detail: shipment.pickup_location_name },
        { id: `${shipment.id}-delivery`, position: [shipment.destination_latitude, shipment.destination_longitude] as [number, number], color: '#ef4444', label: `🏁 Destination: ${shipment.shipment_id}`, detail: shipment.destination_name },
      ]).map((stop) => (
        <CircleMarker key={stop.id} center={stop.position} radius={8} pathOptions={{ color: '#ffffff', fillColor: stop.color, fillOpacity: 1, weight: 3 }}>
          <Popup><strong>{stop.label}</strong><br />Location: {stop.detail}</Popup>
        </CircleMarker>
      ))}

      {lorries.map((lorry) => {
        const visualState = getVisualState(lorry);
        const { label, color, stroke } = statusStyles[visualState];
        const freshness = formatLocationFreshness(lorry.last_location_update);
        const isLive = freshness !== 'No live location';
        const isBreakdown = Boolean(lorry.is_breakdown);

        return (
          <Marker
            key={lorry.id}
            position={[lorry.current_latitude, lorry.current_longitude]}
            icon={isBreakdown ? createBreakdownIcon() : createVehicleIcon(visualState)}
          >
            <Popup>
              <div className="fleet-popup-content space-y-1.5 min-w-[180px]">
                <div className="flex items-center justify-between">
                  <span className="fleet-popup-heading">{lorry.lorry_id}</span>
                  {isBreakdown && (
                    <span className="px-2 py-0.5 text-[10px] font-black bg-red-600 text-white rounded animate-pulse">
                      🚨 SOS
                    </span>
                  )}
                </div>

                {isBreakdown ? (
                  <div className="p-1.5 rounded bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
                    🚨 BREAKDOWN REPORTED
                    {lorry.breakdown_at && (
                      <span className="block text-[10px] text-red-500 font-normal mt-0.5">
                        Since {new Date(lorry.breakdown_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="fleet-popup-status" style={{ color: stroke || color }}>
                    <span style={{ backgroundColor: color, border: stroke ? `1px solid ${stroke}` : 'none' }} /> {label}
                  </div>
                )}

                <p className="text-xs"><strong>Location:</strong> {lorry.current_location_name}</p>
                {lorry.assignment_status === 'assigned' && lorry.current_shipment_id && (
                  <p className="text-xs"><strong>Shipment:</strong> {lorry.current_shipment_id}</p>
                )}
                {lorry.speed_kmh != null && <p className="text-xs"><strong>Speed:</strong> {Math.round(lorry.speed_kmh)} km/h</p>}
                <p className="text-xs">
                  <strong>GPS:</strong>{' '}
                  <span className={isLive ? 'text-emerald-500 font-bold' : 'text-gray-400'}>
                    {freshness}
                  </span>
                </p>
                {lorry.last_location_update && (
                  <small className="text-gray-400 block text-[10px]">
                    Sync: {new Date(lorry.last_location_update).toLocaleTimeString()}
                  </small>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  </div>;
}
