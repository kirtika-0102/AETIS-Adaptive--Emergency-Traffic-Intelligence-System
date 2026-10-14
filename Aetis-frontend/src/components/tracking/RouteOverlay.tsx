import { useMemo } from "react";
import L from "leaflet";
import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";

import { palette, signalStatusColors } from "../../styles/theme";
import type { LatLng } from "../../types/route.types";
import type { TrafficSignal } from "../../types/signal.types";
import { isValidLatLng, toLatLngTuple } from "../../utils/mapHelpers";

export interface RouteOverlayProps {
  route: LatLng[] | null;
  destinationName?: string;
  signals?: TrafficSignal[];
}

const NO_SIGNALS: TrafficSignal[] = [];

const SIGNAL_LABEL: Record<string, string> = {
  normal: "Normal",
  priority: "Priority active",
  pending: "Priority pending",
  fault: "Fault",
};

const UNKNOWN_SIGNAL_COLOR = "#7a8a92";

/** Static markup, so nothing needs escaping */
const DESTINATION_ICON = L.divIcon({
  className: "aetis-destination-marker",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:var(--color-teal-600);border:3px solid #fff;box-shadow:var(--shadow-md);"><span style="width:8px;height:8px;border-radius:9999px;background:#fff;"></span></span>`,
});

/**
 * Route line, destination and the traffic signals along the way. Rendered
 * inside <MapContainer>. Leaflet draws these with SVG attributes, which cannot
 * use CSS variables, so colours come from the theme file instead.
 */
function RouteOverlay({
  route,
  destinationName,
  signals = NO_SIGNALS,
}: RouteOverlayProps) {
  const points = useMemo(
    () => (route ?? []).filter(isValidLatLng).map(toLatLngTuple),
    [route]
  );

  const hasRoute = points.length > 1;
  const destination = hasRoute ? points[points.length - 1] : null;

  return (
    <>
      {hasRoute && (
        <>
          {/* Light outline under the line keeps it readable on any tile */}
          <Polyline
            positions={points}
            interactive={false}
            pathOptions={{
              color: palette.sand[50],
              weight: 10,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <Polyline
            positions={points}
            interactive={false}
            pathOptions={{
              color: palette.clay[500],
              weight: 5,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </>
      )}

      {signals.map((s) => {
        if (!isValidLatLng(s.location)) return null;

        const color =
          signalStatusColors[s.status as keyof typeof signalStatusColors] ??
          UNKNOWN_SIGNAL_COLOR;
        const center = toLatLngTuple(s.location);
        const highlighted = s.status === "priority" || s.status === "pending";

        return (
          <span key={s.id} hidden>
            {highlighted && (
              <CircleMarker
                center={center}
                radius={16}
                interactive={false}
                pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.25 }}
              />
            )}
            <CircleMarker
              center={center}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                weight: 3,
                fillColor: color,
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {`${s.name} · ${SIGNAL_LABEL[s.status] ?? s.status}`}
              </Tooltip>
            </CircleMarker>
          </span>
        );
      })}

      {destination && (
        <Marker
          position={destination}
          icon={DESTINATION_ICON}
          title={destinationName ? `Destination: ${destinationName}` : "Destination"}
          keyboard={false}
        />
      )}
    </>
  );
}

export default RouteOverlay;