import { useCallback, useEffect, useMemo, useRef } from "react";
import { Fragment } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import { Maximize2 } from "lucide-react";
import "leaflet/dist/leaflet.css";

import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
} from "../../config/mapConfig";
import { palette } from "../../styles/theme";
import type { Emergency } from "../../types/emergency.types";
import type { LatLng } from "../../types/route.types";
import type { TrafficSignal } from "../../types/signal.types";
import type { TrackedEV } from "../../types/tracking.types";
import type { Vehicle } from "../../types/vehicle.types";
import { isValidLatLng, toLatLngTuple } from "../../utils/mapHelpers";
import EVMarker from "./EVMarker";
import RouteOverlay from "./RouteOverlay";

export interface LiveMapProps {
  /** Vehicles on a live trip */
  evs?: TrackedEV[];
  /** Candidate vehicles (dispatch screen) */
  vehicles?: Vehicle[];
  emergencies?: Emergency[];
  signals?: TrafficSignal[];
  /** An EV's emergencyId, or a candidate vehicle's id */
  selectedId?: string | null;
  /** Defaults to the selected EV's own route */
  route?: LatLng[] | null;
  onSelectEV?: (emergencyId: string) => void;
  onSelectVehicleId?: (vehicleId: string) => void;
  /** Must give the map a height, e.g. "h-[380px]" */
  className?: string;
}

/* Stable defaults so omitted props do not change identity on every render */
const NO_EVS: TrackedEV[] = [];
const NO_VEHICLES: Vehicle[] = [];
const NO_EMERGENCIES: Emergency[] = [];
const NO_SIGNALS: TrafficSignal[] = [];

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/* ---------- Behaviour inside the map ---------- */

/**
 * - Keeps the map correct when its container changes size without a window
 *   resize (e.g. the sidebar collapsing), which Leaflet does not notice.
 * - Wheel zoom stays off until the map is clicked, so scrolling the page
 *   past a map does not get captured by it.
 */
function MapBehavior() {
  const map = useMap();

  useEffect(() => {
    const el = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    const el = map.getContainer();
    const enable = () => map.scrollWheelZoom.enable();
    const disable = () => map.scrollWheelZoom.disable();

    disable();
    map.on("click", enable);
    el.addEventListener("mouseleave", disable);

    return () => {
      map.off("click", enable);
      el.removeEventListener("mouseleave", disable);
    };
  }, [map]);

  return null;
}

/**
 * Fits the view whenever `focusKey` changes (a vehicle appears or is
 * selected, a route arrives), but never on plain position updates, so the
 * camera does not fight a user who is panning. The button re-fits on demand.
 */
function FitView({
  points,
  focusKey,
}: {
  points: [number, number][];
  focusKey: string;
}) {
  const map = useMap();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pointsRef = useRef(points);

  // Declared before the fit effect, so it runs first on every commit
  useEffect(() => {
    pointsRef.current = points;
  });

  const fit = useCallback(() => {
    const pts = pointsRef.current;
    if (pts.length === 0) return;

    if (pts.length === 1) {
      map.setView(pts[0], Math.max(map.getZoom(), 14));
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
  }, [map]);

  useEffect(() => {
    fit();
  }, [fit, focusKey]);

  // Clicks on the button must not reach the map underneath
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={fit}
      disabled={points.length === 0}
      aria-label="Fit map to vehicles and route"
      title="Fit to vehicles and route"
      className="absolute bottom-3 left-3 z-[1000] inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] shadow-[var(--shadow-md)] transition-colors hover:bg-[var(--bg-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Maximize2 size={14} aria-hidden />
      Fit view
    </button>
  );
}

/* ---------- Map ---------- */

function LiveMap({
  evs = NO_EVS,
  vehicles = NO_VEHICLES,
  emergencies = NO_EMERGENCIES,
  signals = NO_SIGNALS,
  selectedId = null,
  route = null,
  onSelectEV,
  onSelectVehicleId,
  className,
}: LiveMapProps) {
  const selectedEV = useMemo(
    () =>
      selectedId ? evs.find((e) => e.emergencyId === selectedId) ?? null : null,
    [evs, selectedId]
  );

  const activeRoute = route ?? selectedEV?.route ?? null;

  /**
   * What the camera frames. With a selected EV: that vehicle, its route and
   * the emergency. Otherwise: everything. Selecting a candidate vehicle does
   * not change this, so the dispatcher keeps seeing all the options.
   */
  const fit = useMemo(() => {
    const points: [number, number][] = [];
    const ids: string[] = [];

    const add = (id: string, p: unknown) => {
      if (isValidLatLng(p)) {
        points.push(toLatLngTuple(p));
        ids.push(id);
      }
    };

    (selectedEV ? [selectedEV] : evs).forEach((e) =>
      add(`ev:${e.emergencyId}`, e.location)
    );
    if (!selectedEV) vehicles.forEach((v) => add(`veh:${v.id}`, v.location));
    emergencies.forEach((e) => add(`em:${e.id}`, e.location));

    const routePoints = (activeRoute ?? []).filter(isValidLatLng);
    routePoints.forEach((p) => points.push(toLatLngTuple(p)));

    return {
      points,
      key: `${[...ids].sort().join("|")}#${routePoints.length > 1 ? "route" : ""}`,
    };
  }, [selectedEV, evs, vehicles, emergencies, activeRoute]);

  return (
    <div
      role="region"
      aria-label="Live map"
      className={cx(
        // "isolate" keeps Leaflet's internal z-indexes below the app's
        // dropdowns and modals
        "relative isolate overflow-hidden bg-[var(--color-teal-800)]",
        className
      )}
    >
      <p className="sr-only">
        {evs.length} {evs.length === 1 ? "vehicle" : "vehicles"} on route,{" "}
        {vehicles.length} candidate{" "}
        {vehicles.length === 1 ? "vehicle" : "vehicles"},{" "}
        {emergencies.length}{" "}
        {emergencies.length === 1 ? "emergency location" : "emergency locations"}
        . Details are listed beside the map.
      </p>

      <MapContainer
        center={MAP_DEFAULT_CENTER}
        zoom={MAP_DEFAULT_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        zoomControl={false}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          url={MAP_TILE_URL}
          attribution={MAP_TILE_ATTRIBUTION}
          maxZoom={MAP_MAX_ZOOM}
        />
        <ZoomControl position="bottomright" />
        <MapBehavior />
        <FitView points={fit.points} focusKey={fit.key} />

        <RouteOverlay
          route={activeRoute}
          destinationName={selectedEV?.destinationName}
          signals={signals}
        />

        {/* Emergency locations */}
        {emergencies.map((e) =>
          isValidLatLng(e.location) ? (
            <Fragment key={e.id}>
              <CircleMarker
                center={toLatLngTuple(e.location)}
                radius={20}
                interactive={false}
                pathOptions={{
                  stroke: false,
                  fillColor: palette.clay[500],
                  fillOpacity: 0.22,
                }}
              />
              <CircleMarker
                center={toLatLngTuple(e.location)}
                radius={9}
                pathOptions={{
                  color: "#ffffff",
                  weight: 3,
                  fillColor: palette.clay[600],
                  fillOpacity: 1,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {`Emergency: ${e.location.address}`}
                </Tooltip>
              </CircleMarker>
            </Fragment>
          ) : null
        )}

        {/* Candidate vehicles */}
        {vehicles.map((v) => (
          <EVMarker
            key={v.id}
            position={v.location}
            label={v.label}
            type={v.type}
            selected={v.id === selectedId}
            onSelect={
              onSelectVehicleId ? () => onSelectVehicleId(v.id) : undefined
            }
          />
        ))}

        {/* Vehicles on a live trip */}
        {evs.map((ev) => (
          <EVMarker
            key={ev.emergencyId}
            position={ev.location}
            label={ev.vehicleLabel}
            type={ev.vehicleType}
            selected={ev.emergencyId === selectedId}
            active
            onSelect={onSelectEV ? () => onSelectEV(ev.emergencyId) : undefined}
          />
        ))}
      </MapContainer>
    </div>
  );
}

export default LiveMap;