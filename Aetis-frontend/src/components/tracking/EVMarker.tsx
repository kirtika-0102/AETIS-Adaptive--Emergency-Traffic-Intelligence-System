import { useMemo } from "react";
import L from "leaflet";
import { Marker } from "react-leaflet";

import type { LatLng } from "../../types/route.types";
import type { VehicleType } from "../../types/vehicle.types";
import { isValidLatLng, toLatLngTuple } from "../../utils/mapHelpers";

export interface EVMarkerProps {
  position: LatLng;
  /** Shown as the accessible name, and as a tag when selected */
  label: string;
  type: VehicleType;
  selected?: boolean;
  /** Pulsing ring, for vehicles that are moving on a live trip */
  active?: boolean;
  /** When omitted the marker is display-only and not focusable */
  onSelect?: () => void;
}

const COLORS: Record<VehicleType, string> = {
  ambulance: "var(--color-olive-500)",
  police: "var(--color-teal-600)",
  fire: "var(--color-clay-500)",
};

/** 24x24 icon paths: medical cross, shield, flame */
const GLYPHS: Record<VehicleType, string> = {
  ambulance: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z",
  police: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  fire: "M12 2c.5 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2 .8-3.2 2-4.2 0 1.8.8 3 2 3.2-.6-3.4-.4-6 1-10z",
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Labels come from user-entered data and are placed in an HTML string */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

function buildIcon(
  type: VehicleType,
  label: string,
  selected: boolean,
  active: boolean
) {
  const color = COLORS[type] ?? COLORS.ambulance;
  const glyph = GLYPHS[type] ?? GLYPHS.ambulance;
  const size = selected ? 46 : 38;
  const glyphSize = selected ? 22 : 18;

  const pulse = active
    ? `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:0.35;animation:aetis-pulse-ring 1.8s var(--ease-out) infinite;"></span>`
    : "";

  const tag = selected
    ? `<span style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;padding:2px 8px;border-radius:9999px;background:var(--color-teal-800);color:var(--text-inverse);font:700 11px/1.4 var(--font-sans);white-space:nowrap;box-shadow:var(--shadow-sm);">${escapeHtml(label)}</span>`
    : "";

  return L.divIcon({
    className: "aetis-vehicle-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;">${pulse}<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:var(--shadow-md);"><svg width="${glyphSize}" height="${glyphSize}" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="${glyph}"/></svg></span>${tag}</div>`,
  });
}

/**
 * A vehicle on the map. The icon is rebuilt only when its look changes, not
 * on every position update, so live movement stays smooth.
 */
function EVMarker({
  position,
  label,
  type,
  selected = false,
  active = false,
  onSelect,
}: EVMarkerProps) {
  const icon = useMemo(
    () => buildIcon(type, label, selected, active),
    [type, label, selected, active]
  );

  if (!isValidLatLng(position)) return null;

  return (
    <Marker
      position={toLatLngTuple(position)}
      icon={icon}
      title={label}
      keyboard={Boolean(onSelect)}
      interactive={Boolean(onSelect)}
      riseOnHover
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={onSelect ? { click: () => onSelect() } : undefined}
    />
  );
}

export default EVMarker;