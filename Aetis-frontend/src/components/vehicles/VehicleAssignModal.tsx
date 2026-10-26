import { AlertTriangle } from "lucide-react";

import type { Emergency, EmergencyType } from "../../types/emergency.types";
import type { Vehicle, VehicleType } from "../../types/vehicle.types";
import {
  EMERGENCY_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
} from "../../utils/constants";
import { formatDuration } from "../../utils/formatters";
import Button from "../common/Button";
import Modal from "../common/Modal";
import SeverityBadge from "../emergency/SeverityBadge";

export interface VehicleAssignModalProps {
  open: boolean;
  vehicle: Vehicle | null;
  emergency: Emergency | null;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Which vehicle type normally answers which service */
const EXPECTED_VEHICLE: Record<EmergencyType, VehicleType> = {
  medical: "ambulance",
  police: "police",
  fire: "fire",
};

function VehicleAssignModal({
  open,
  vehicle,
  emergency,
  isSubmitting,
  onConfirm,
  onClose,
}: VehicleAssignModalProps) {
  const ready = vehicle !== null && emergency !== null;

  // Closing is blocked mid-request so a dispatch cannot be half-confirmed
  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const mismatch =
    ready && EXPECTED_VEHICLE[emergency.type] !== vehicle.type;

  return (
    <Modal
      open={open && ready}
      title={vehicle ? `Dispatch ${vehicle.label}` : "Dispatch vehicle"}
      size="md"
      onClose={handleClose}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={onConfirm}
            isLoading={isSubmitting}
          >
            {isSubmitting
              ? "Dispatching..."
              : mismatch
                ? "Dispatch anyway"
                : "Confirm dispatch"}
          </Button>
        </div>
      }
    >
      {ready && (
        <div className="space-y-5">
          {mismatch && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
            >
              <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
              <p>
                {vehicle.label} is a{" "}
                <strong>{VEHICLE_TYPE_LABELS[vehicle.type] ?? vehicle.type}</strong>{" "}
                unit, but this is a{" "}
                <strong>{EMERGENCY_TYPE_LABELS[emergency.type]}</strong>{" "}
                request. Continue only if you are sure this is the right
                vehicle.
              </p>
            </div>
          )}

          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--text-muted)]">Vehicle</dt>
              <dd className="font-semibold">
                {vehicle.label}
                <span className="font-normal text-[var(--text-secondary)]">
                  {" "}
                  · {VEHICLE_TYPE_LABELS[vehicle.type] ?? vehicle.type}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-[var(--text-muted)]">Estimated arrival</dt>
              <dd className="font-semibold">
                {Number.isFinite(vehicle.etaSeconds)
                  ? formatDuration(vehicle.etaSeconds)
                  : "Not available"}
              </dd>
            </div>

            <div>
              <dt className="text-[var(--text-muted)]">Emergency</dt>
              <dd className="flex flex-wrap items-center gap-2 font-semibold">
                {EMERGENCY_TYPE_LABELS[emergency.type]}
                <SeverityBadge severity={emergency.severity} size="sm" />
              </dd>
            </div>

            <div>
              <dt className="text-[var(--text-muted)]">Reference</dt>
              <dd className="font-[family-name:var(--font-mono)] text-xs">{emergency.id}</dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-[var(--text-muted)]">Location</dt>
              <dd className="font-semibold">{emergency.location.address}</dd>
            </div>
          </dl>

          <p className="text-xs text-[var(--text-secondary)]">
            The driver is notified straight away and the route is planned. You
            can follow the vehicle on the tracking screen.
          </p>
        </div>
      )}
    </Modal>
  );
}

export default VehicleAssignModal;