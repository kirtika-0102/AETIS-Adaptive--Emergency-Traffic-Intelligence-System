import Badge from "../common/Badge";

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface VehicleStatusBadgeProps {
  /** Accepts any string so an unexpected backend value cannot crash the UI */
  status: string;
  size?: "sm" | "md";
  className?: string;
}

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  available: { label: "Available", tone: "success" },
  dispatched: { label: "Dispatched", tone: "warning" },
  en_route: { label: "En route", tone: "danger" },
  arrived: { label: "Arrived", tone: "info" },
  offline: { label: "Offline", tone: "neutral" },
};

/** Unknown statuses are shown as written, in a neutral style */
function VehicleStatusBadge({ status, size = "md", className }: VehicleStatusBadgeProps) {
  const known = STATUS[status];

  return (
    <Badge
      tone={known?.tone ?? "neutral"}
      size={size}
      dot
      className={className}
    >
      {known?.label ?? status}
    </Badge>
  );
}

export default VehicleStatusBadge;