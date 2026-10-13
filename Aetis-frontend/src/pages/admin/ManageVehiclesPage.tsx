import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Plus, Search } from "lucide-react";

import Badge from "../../components/common/Badge";
import Input from "../../components/common/Input";
import Modal from "../../components/common/Modal";
import Select from "../../components/common/Select";
import Table, { type TableColumn } from "../../components/common/Table";
import { adminApi } from "../../services/api/adminApi";
import type {
  AdminDriverOption,
  AdminVehicleRow,
  CreateVehiclePayload,
  VehicleType,
} from "../../types/vehicle.types";
import { VEHICLE_TYPE_LABELS } from "../../utils/constants";

const BUSY_STATUSES = new Set(["dispatched", "en_route", "arrived"]);

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  available: "success",
  dispatched: "warning",
  en_route: "danger",
  arrived: "info",
  offline: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  dispatched: "Dispatched",
  en_route: "En route",
  arrived: "Arrived",
  offline: "Offline",
};

const EMPTY_FORM = {
  label: "",
  type: "ambulance" as VehicleType,
  registrationNumber: "",
  homeBase: "",
};

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

const typeOptions = (Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map(
  (t) => ({ value: t, label: VEHICLE_TYPE_LABELS[t] })
);

const normalizePlate = (value: string) =>
  value.toUpperCase().replace(/[\s-]/g, "");

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};
  if (f.label.trim().length < 2) errors.label = "Enter a vehicle label, e.g. AMB-07.";
  if (!/^[A-Z0-9]{6,12}$/.test(normalizePlate(f.registrationNumber))) {
    errors.registrationNumber = "Enter a valid registration number.";
  }
  if (!f.homeBase.trim()) errors.homeBase = "Enter the base station or hospital.";
  return errors;
}

function ManageVehiclesPage() {
  const [vehicles, setVehicles] = useState<AdminVehicleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VehicleType | "">("");

  /* register */
  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  /* assign driver */
  const [assignTarget, setAssignTarget] = useState<AdminVehicleRow | null>(null);
  const [drivers, setDrivers] = useState<AdminDriverOption[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  /* retire / restore */
  const [retireTarget, setRetireTarget] = useState<AdminVehicleRow | null>(null);
  const [isRetiring, setIsRetiring] = useState(false);

  const refresh = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    document.title = "Manage Vehicles | AETIS";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    adminApi
      .getVehicles()
      .then((data) => {
        if (cancelled) return;
        setVehicles(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load vehicles.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Load unassigned drivers only while the assign modal is open
  useEffect(() => {
    if (!assignTarget) return;
    let cancelled = false;

    setDriversLoading(true);
    setDriverId(assignTarget.driver?.id ?? "");
    setAssignError(null);

    adminApi
      .getAvailableDrivers()
      .then((data) => {
        if (!cancelled) setDrivers(data);
      })
      .catch(() => {
        if (!cancelled) setAssignError("Could not load drivers.");
      })
      .finally(() => {
        if (!cancelled) setDriversLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignTarget]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (typeFilter && v.type !== typeFilter) return false;
      if (!q) return true;
      return (
        v.label.toLowerCase().includes(q) ||
        v.registrationNumber.toLowerCase().includes(q) ||
        v.homeBase.toLowerCase().includes(q) ||
        (v.driver?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [vehicles, search, typeFilter]);

  /* ---------- Register ---------- */
  const setField =
    (key: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
      setFormErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const openRegister = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setRegisterError(null);
    setRegisterOpen(true);
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();

    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: CreateVehiclePayload = {
      label: form.label.trim().toUpperCase(),
      type: form.type,
      registrationNumber: normalizePlate(form.registrationNumber),
      homeBase: form.homeBase.trim(),
    };

    setIsRegistering(true);
    setRegisterError(null);
    try {
      await adminApi.createVehicle(payload);
      setRegisterOpen(false);
      setNotice(`${payload.label} was registered.`);
      refresh();
    } catch {
      setRegisterError(
        "Could not register this vehicle. The label or registration may already exist."
      );
    } finally {
      setIsRegistering(false);
    }
  };

  /* ---------- Assign driver ---------- */
  const handleAssign = async () => {
    if (!assignTarget) return;

    setIsAssigning(true);
    setAssignError(null);
    try {
      await adminApi.updateVehicle(assignTarget.id, {
        driverId: driverId || null,
      });
      setNotice(
        driverId
          ? `Driver assigned to ${assignTarget.label}.`
          : `Driver removed from ${assignTarget.label}.`
      );
      setAssignTarget(null);
      refresh();
    } catch {
      setAssignError("Could not update the assignment. Please try again.");
    } finally {
      setIsAssigning(false);
    }
  };

  /* ---------- Retire / restore ---------- */
  const handleRetireToggle = async () => {
    if (!retireTarget) return;

    setIsRetiring(true);
    try {
      await adminApi.updateVehicle(retireTarget.id, {
        retired: !retireTarget.retired,
      });
      setNotice(
        retireTarget.retired
          ? `${retireTarget.label} was restored to service.`
          : `${retireTarget.label} was retired.`
      );
      setError(null);
      setRetireTarget(null);
      refresh();
    } catch {
      setError("Could not update this vehicle. Please try again.");
      setRetireTarget(null);
    } finally {
      setIsRetiring(false);
    }
  };

  /* ---------- Table ---------- */
  const columns: TableColumn<AdminVehicleRow>[] = [
    {
      key: "label",
      header: "Vehicle",
      render: (v) => (
        <div>
          <p className="font-semibold">{v.label}</p>
          <p className="font-[var(--font-mono)] text-xs text-[var(--text-secondary)]">
            {v.registrationNumber}
          </p>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (v) => VEHICLE_TYPE_LABELS[v.type] },
    { key: "homeBase", header: "Base", render: (v) => v.homeBase },
    {
      key: "driver",
      header: "Driver",
      render: (v) =>
        v.driver ? (
          v.driver.name
        ) : (
          <span className="text-[var(--text-muted)]">Unassigned</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (v) =>
        v.retired ? (
          <Badge tone="neutral">Retired</Badge>
        ) : (
          <Badge tone={STATUS_TONE[v.status] ?? "neutral"}>
            {STATUS_LABEL[v.status] ?? v.status}
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (v) => {
        const onEmergency = BUSY_STATUSES.has(v.status);
        const lockedTitle = onEmergency
          ? "Not available while on an active emergency"
          : undefined;

        return (
          <div className="flex flex-wrap gap-2">
            {!v.retired && (
              <button
                type="button"
                onClick={() => setAssignTarget(v)}
                disabled={onEmergency}
                title={lockedTitle}
                className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
              >
                {v.driver ? "Change driver" : "Assign driver"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRetireTarget(v)}
              disabled={onEmergency}
              title={lockedTitle}
              className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                v.retired
                  ? "border-[var(--border-default)] hover:bg-[var(--bg-surface-muted)]"
                  : "border-[var(--color-clay-200)] text-[var(--color-clay-600)] hover:bg-[var(--color-clay-50)]"
              }`}
            >
              {v.retired ? "Restore" : "Retire"}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
            Vehicles
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Every emergency vehicle must have a verified driver before it can be
            dispatched.
          </p>
        </div>
        <button
          type="button"
          onClick={openRegister}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--action-accent-hover)]"
        >
          <Plus size={18} aria-hidden />
          Register vehicle
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-[var(--radius-md)] border border-[var(--color-olive-200)] bg-[var(--color-olive-50)] px-4 py-3 text-sm text-[var(--color-olive-700)]"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 md:max-w-sm">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search label, plate, base or driver"
            aria-label="Search vehicles"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as VehicleType | "")}
          aria-label="Filter by type"
          className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm focus:border-[var(--action-primary)] focus:outline-none"
        >
          <option value="">All types</option>
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <section className="card overflow-hidden">
        <Table
          columns={columns}
          rows={filtered}
          rowKey={(v) => v.id}
          isLoading={isLoading}
          emptyMessage="No vehicles match these filters."
        />
      </section>

      {/* ---------- Register modal ---------- */}
      <Modal
        open={registerOpen}
        title="Register vehicle"
        onClose={() => !isRegistering && setRegisterOpen(false)}
      >
        <form onSubmit={handleRegister} className="space-y-4" noValidate>
          {registerError && (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
            >
              {registerError}
            </div>
          )}

          <Input
            label="Label"
            name="label"
            value={form.label}
            onChange={setField("label")}
            error={formErrors.label}
            placeholder="AMB-07"
            required
          />
          <Select
            label="Type"
            value={form.type}
            onChange={setField("type")}
            options={typeOptions}
          />
          <Input
            label="Registration number"
            name="registrationNumber"
            value={form.registrationNumber}
            onChange={setField("registrationNumber")}
            error={formErrors.registrationNumber}
            required
          />
          <Input
            label="Base station / hospital"
            name="homeBase"
            value={form.homeBase}
            onChange={setField("homeBase")}
            error={formErrors.homeBase}
            required
          />

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRegisterOpen(false)}
              disabled={isRegistering}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRegistering}
              className="rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)] disabled:opacity-60"
            >
              {isRegistering ? "Registering..." : "Register"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---------- Assign driver modal ---------- */}
      <Modal
        open={assignTarget !== null}
        title={assignTarget ? `Driver for ${assignTarget.label}` : "Assign driver"}
        onClose={() => !isAssigning && setAssignTarget(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setAssignTarget(null)}
              disabled={isAssigning}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={isAssigning || driversLoading}
              className="rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)] disabled:opacity-60"
            >
              {isAssigning ? "Saving..." : "Save"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {assignError && (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
            >
              {assignError}
            </div>
          )}

          <Select
            label="Driver"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            placeholder={driversLoading ? "Loading drivers..." : "No driver"}
            options={[
              ...(assignTarget?.driver
                ? [
                    {
                      value: assignTarget.driver.id,
                      label: `${assignTarget.driver.name} (current)`,
                    },
                  ]
                : []),
              ...drivers
                .filter((d) => d.id !== assignTarget?.driver?.id)
                .map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
          <p className="text-xs text-[var(--text-secondary)]">
            Only verified, active drivers without a vehicle are listed. Choose
            "No driver" to unassign.
          </p>
        </div>
      </Modal>

      {/* ---------- Retire / restore confirmation ---------- */}
      <Modal
        open={retireTarget !== null}
        title={retireTarget?.retired ? "Restore vehicle" : "Retire vehicle"}
        size="sm"
        onClose={() => !isRetiring && setRetireTarget(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setRetireTarget(null)}
              disabled={isRetiring}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRetireToggle}
              disabled={isRetiring}
              className={`rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                retireTarget?.retired
                  ? "bg-[var(--action-secondary)] hover:bg-[var(--action-secondary-hover)]"
                  : "bg-[var(--color-clay-600)] hover:bg-[var(--color-clay-700)]"
              }`}
            >
              {retireTarget?.retired ? "Restore" : "Retire"}
            </button>
          </div>
        }
      >
        {retireTarget && (
          <p className="text-sm text-[var(--text-secondary)]">
            {retireTarget.retired
              ? `${retireTarget.label} will be available for dispatch again once a driver is assigned.`
              : `${retireTarget.label} will no longer appear when dispatching vehicles.`}
          </p>
        )}
      </Modal>
    </div>
  );
}

export default ManageVehiclesPage;