import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Plus, Search } from "lucide-react";

import Badge from "../../components/common/Badge";
import Input from "../../components/common/Input";
import Modal from "../../components/common/Modal";
import Table, { type TableColumn } from "../../components/common/Table";
import { adminApi } from "../../services/api/adminApi";
import type {
  AdminSignalRow,
  CreateSignalPayload,
  SignalStatus,
} from "../../types/signal.types";
import { formatDateTime } from "../../utils/formatters";

const BUFFER_MIN = 20;
const BUFFER_MAX = 180;
/** A signal that has not reported in this long is treated as offline */
const HEARTBEAT_STALE_MS = 2 * 60 * 1000;

const STATUS_TONE: Record<SignalStatus, "success" | "warning" | "danger" | "neutral"> =
  {
    normal: "success",
    priority: "danger",
    pending: "warning",
    fault: "neutral",
  };

const STATUS_LABEL: Record<SignalStatus, string> = {
  normal: "Normal",
  priority: "Priority active",
  pending: "Priority pending",
  fault: "Fault",
};

const EMPTY_FORM = {
  name: "",
  controllerId: "",
  latitude: "",
  longitude: "",
};

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};
  const lat = Number(f.latitude);
  const lng = Number(f.longitude);

  if (f.name.trim().length < 3) errors.name = "Enter the junction name.";
  if (!f.controllerId.trim()) errors.controllerId = "Enter the controller ID.";
  if (f.latitude.trim() === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.latitude = "Latitude must be between -90 and 90.";
  }
  if (f.longitude.trim() === "" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.longitude = "Longitude must be between -180 and 180.";
  }
  return errors;
}

const isOffline = (s: AdminSignalRow) =>
  !s.lastHeartbeatAt ||
  Date.now() - new Date(s.lastHeartbeatAt).getTime() > HEARTBEAT_STALE_MS;

function ManageSignalsPage() {
  const [signals, setSignals] = useState<AdminSignalRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  /* priority buffer */
  const [buffer, setBuffer] = useState("60");
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [isSavingBuffer, setIsSavingBuffer] = useState(false);

  /* register */
  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  /* enable / disable */
  const [toggleTarget, setToggleTarget] = useState<AdminSignalRow | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const refresh = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    document.title = "Manage Signals | AETIS";
  }, []);

  useEffect(() => {
    let cancelled = false;

    adminApi
      .getSignalSettings()
      .then((s) => {
        if (!cancelled) setBuffer(String(s.bufferSeconds));
      })
      .catch(() => {
        /* keep the default shown; saving still works */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    adminApi
      .getSignals()
      .then((data) => {
        if (cancelled) return;
        setSignals(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load signals.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return signals;
    return signals.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.controllerId.toLowerCase().includes(q)
    );
  }, [signals, search]);

  /* ---------- Priority buffer ---------- */
  const handleSaveBuffer = async (e: FormEvent) => {
    e.preventDefault();

    const seconds = Number(buffer);
    if (!Number.isInteger(seconds) || seconds < BUFFER_MIN || seconds > BUFFER_MAX) {
      setBufferError(
        `Enter a whole number between ${BUFFER_MIN} and ${BUFFER_MAX}.`
      );
      return;
    }

    setIsSavingBuffer(true);
    setBufferError(null);
    try {
      await adminApi.updateSignalSettings({ bufferSeconds: seconds });
      setNotice(`Priority buffer set to ${seconds} seconds.`);
    } catch {
      setBufferError("Could not save the buffer. Please try again.");
    } finally {
      setIsSavingBuffer(false);
    }
  };

  /* ---------- Register ---------- */
  const setField =
    (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
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

    const payload: CreateSignalPayload = {
      name: form.name.trim(),
      controllerId: form.controllerId.trim(),
      location: { lat: Number(form.latitude), lng: Number(form.longitude) },
    };

    setIsRegistering(true);
    setRegisterError(null);
    try {
      await adminApi.createSignal(payload);
      setRegisterOpen(false);
      setNotice(`${payload.name} was added.`);
      refresh();
    } catch {
      setRegisterError(
        "Could not add this signal. The controller ID may already be registered."
      );
    } finally {
      setIsRegistering(false);
    }
  };

  /* ---------- Enable / disable ---------- */
  const handleToggle = async () => {
    if (!toggleTarget) return;

    setIsToggling(true);
    try {
      await adminApi.setSignalEnabled(toggleTarget.id, !toggleTarget.enabled);
      setNotice(
        toggleTarget.enabled
          ? `${toggleTarget.name} was disabled.`
          : `${toggleTarget.name} was enabled.`
      );
      setError(null);
      setToggleTarget(null);
      refresh();
    } catch {
      setError(
        "Could not change this signal. It may be part of an active emergency route."
      );
      setToggleTarget(null);
    } finally {
      setIsToggling(false);
    }
  };

  /* ---------- Table ---------- */
  const columns: TableColumn<AdminSignalRow>[] = [
    {
      key: "name",
      header: "Signal",
      render: (s) => (
        <div>
          <p className="font-semibold">{s.name}</p>
          <p className="font-[var(--font-mono)] text-xs text-[var(--text-secondary)]">
            {s.id}
          </p>
        </div>
      ),
    },
    {
      key: "controllerId",
      header: "Controller",
      render: (s) => (
        <span className="font-[var(--font-mono)] text-xs">{s.controllerId}</span>
      ),
    },
    {
      key: "cameraCount",
      header: "Cameras",
      render: (s) => String(s.cameraCount),
    },
    {
      key: "status",
      header: "State",
      render: (s) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          {!s.enabled && <Badge tone="neutral">Disabled</Badge>}
        </div>
      ),
    },
    {
      key: "heartbeat",
      header: "Last heartbeat",
      render: (s) => (
        <span className={isOffline(s) ? "text-[var(--color-clay-600)]" : ""}>
          {s.lastHeartbeatAt ? formatDateTime(s.lastHeartbeatAt) : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (s) => (
        <button
          type="button"
          onClick={() => setToggleTarget(s)}
          disabled={s.status === "priority" || s.status === "pending"}
          title={
            s.status === "priority" || s.status === "pending"
              ? "Not available while priority is active"
              : undefined
          }
          className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            s.enabled
              ? "border-[var(--color-clay-200)] text-[var(--color-clay-600)] hover:bg-[var(--color-clay-50)]"
              : "border-[var(--border-default)] hover:bg-[var(--bg-surface-muted)]"
          }`}
        >
          {s.enabled ? "Disable" : "Enable"}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl text-[var(--text-primary)] sm:text-3xl">
            Traffic signals
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Register junctions and control how early signals open for an
            approaching vehicle.
          </p>
        </div>
        <button
          type="button"
          onClick={openRegister}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--action-accent-hover)]"
        >
          <Plus size={18} aria-hidden />
          Add signal
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

      {/* ---------- Priority buffer ---------- */}
      <section className="card p-5" aria-label="Priority buffer">
        <h2 className="text-lg">Priority buffer</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Signals open this many seconds before the estimated arrival time, so the
queue ahead has cleared by the time the vehicle gets there. Applies to all signals.
        </p>

        <form
          onSubmit={handleSaveBuffer}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          noValidate
        >
          <div className="sm:w-56">
            <Input
              label="Buffer (seconds)"
              name="buffer"
              type="number"
              min={BUFFER_MIN}
              max={BUFFER_MAX}
              value={buffer}
              onChange={(e) => {
                setBuffer(e.target.value);
                setBufferError(null);
              }}
              error={bufferError ?? undefined}
            />
          </div>
          <button
            type="submit"
            disabled={isSavingBuffer}
            className="rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)] disabled:opacity-60"
          >
            {isSavingBuffer ? "Saving..." : "Save buffer"}
          </button>
        </form>
      </section>

      <div className="relative max-w-sm">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, ID or controller"
          aria-label="Search signals"
          className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none"
        />
      </div>

      <section className="card overflow-hidden">
        <Table
          columns={columns}
          rows={filtered}
          rowKey={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No signals match this search."
        />
      </section>

      {/* ---------- Register modal ---------- */}
      <Modal
        open={registerOpen}
        title="Add signal"
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
            label="Junction name"
            name="name"
            value={form.name}
            onChange={setField("name")}
            error={formErrors.name}
            placeholder="NH-24 / Indirapuram Crossing"
            required
          />
          <Input
            label="Controller ID"
            name="controllerId"
            value={form.controllerId}
            onChange={setField("controllerId")}
            error={formErrors.controllerId}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Latitude"
              name="latitude"
              type="number"
              value={form.latitude}
              onChange={setField("latitude")}
              error={formErrors.latitude}
              required
            />
            <Input
              label="Longitude"
              name="longitude"
              type="number"
              value={form.longitude}
              onChange={setField("longitude")}
              error={formErrors.longitude}
              required
            />
          </div>

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
              {isRegistering ? "Adding..." : "Add signal"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---------- Enable / disable confirmation ---------- */}
      <Modal
        open={toggleTarget !== null}
        title={toggleTarget?.enabled ? "Disable signal" : "Enable signal"}
        size="sm"
        onClose={() => !isToggling && setToggleTarget(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setToggleTarget(null)}
              disabled={isToggling}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={isToggling}
              className={`rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                toggleTarget?.enabled
                  ? "bg-[var(--color-clay-600)] hover:bg-[var(--color-clay-700)]"
                  : "bg-[var(--action-secondary)] hover:bg-[var(--action-secondary-hover)]"
              }`}
            >
              {toggleTarget?.enabled ? "Disable" : "Enable"}
            </button>
          </div>
        }
      >
        {toggleTarget && (
          <p className="text-sm text-[var(--text-secondary)]">
            {toggleTarget.enabled
              ? `${toggleTarget.name} will keep its normal timing and will not be opened for emergency vehicles. Routes will not count on it.`
              : `${toggleTarget.name} will take part in emergency priority again.`}
          </p>
        )}
      </Modal>
    </div>
  );
}

export default ManageSignalsPage;