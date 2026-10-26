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
  AdminCameraRow,
  CameraDirection,
  CameraStatus,
  CreateCameraPayload,
} from "../../types/camera.types";
import { CAMERA_DIRECTION_LABELS } from "../../utils/constants";
import { formatDateTime } from "../../utils/formatters";

const STATUS_TONE: Record<CameraStatus, "success" | "warning" | "neutral"> = {
  online: "success",
  degraded: "warning",
  offline: "neutral",
};

const STATUS_LABEL: Record<CameraStatus, string> = {
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
};

const STREAM_URL_PATTERN = /^(rtsp|rtsps|http|https):\/\/\S+$/i;

const EMPTY_FORM = {
  name: "",
  signalId: "",
  direction: "north" as CameraDirection,
  streamUrl: "",
};

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

const directionOptions = (
  Object.keys(CAMERA_DIRECTION_LABELS) as CameraDirection[]
).map((d) => ({ value: d, label: CAMERA_DIRECTION_LABELS[d] }));

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};
  if (f.name.trim().length < 3) errors.name = "Enter a camera name.";
  if (!f.signalId) errors.signalId = "Choose the signal this camera watches.";
  if (!STREAM_URL_PATTERN.test(f.streamUrl.trim())) {
    errors.streamUrl = "Enter an rtsp:// or http(s):// stream address.";
  }
  return errors;
}

interface TestResult {
  id: string;
  ok: boolean;
  message: string;
}

function ManageCamerasPage() {
  const [cameras, setCameras] = useState<AdminCameraRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  /* register */
  const [registerOpen, setRegisterOpen] = useState(false);
  const [signalOptions, setSignalOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const refresh = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    document.title = "Manage Cameras | AETIS";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    adminApi
      .getCameras()
      .then((data) => {
        if (cancelled) return;
        setCameras(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load cameras.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Signal list for the register form, loaded when the modal opens
  useEffect(() => {
    if (!registerOpen) return;
    let cancelled = false;

    adminApi
      .getSignalOptions()
      .then((data) => {
        if (!cancelled) setSignalOptions(data);
      })
      .catch(() => {
        if (!cancelled) setRegisterError("Could not load signals.");
      });

    return () => {
      cancelled = true;
    };
  }, [registerOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.signalName.toLowerCase().includes(q)
    );
  }, [cameras, search]);

  /* ---------- Row actions ---------- */
  const handleToggleDetection = async (c: AdminCameraRow) => {
    setBusyId(c.id);
    setNotice(null);
    try {
      await adminApi.setCameraDetection(c.id, !c.detectionEnabled);
      setNotice(
        c.detectionEnabled
          ? `Detection paused on ${c.name}.`
          : `Detection resumed on ${c.name}.`
      );
      setError(null);
      refresh();
    } catch {
      setError("Could not change detection for this camera.");
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (c: AdminCameraRow) => {
    setBusyId(c.id);
    setTestResult(null);
    try {
      const res = await adminApi.testCameraConnection(c.id);
      setTestResult({ id: c.id, ok: res.ok, message: res.message });
    } catch {
      setTestResult({
        id: c.id,
        ok: false,
        message: "The test could not be completed.",
      });
    } finally {
      setBusyId(null);
    }
  };

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

    const payload: CreateCameraPayload = {
      name: form.name.trim(),
      signalId: form.signalId,
      direction: form.direction,
      streamUrl: form.streamUrl.trim(),
    };

    setIsRegistering(true);
    setRegisterError(null);
    try {
      await adminApi.createCamera(payload);
      setRegisterOpen(false);
      setNotice(`${payload.name} was connected.`);
      refresh();
    } catch {
      setRegisterError(
        "Could not connect this camera. Check the stream address and try again."
      );
    } finally {
      setIsRegistering(false);
    }
  };

  /* ---------- Table ---------- */
  const columns: TableColumn<AdminCameraRow>[] = [
    {
      key: "name",
      header: "Camera",
      render: (c) => (
        <div>
          <p className="font-semibold">{c.name}</p>
          <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-secondary)]">
            {c.id}
          </p>
        </div>
      ),
    },
    {
      key: "signal",
      header: "Signal",
      render: (c) => (
        <div>
          <p>{c.signalName}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Faces {CAMERA_DIRECTION_LABELS[c.direction].toLowerCase()}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
          {!c.detectionEnabled && <Badge tone="warning">Detection paused</Badge>}
        </div>
      ),
    },
    {
      key: "lastDetectionAt",
      header: "Last detection",
      render: (c) =>
        c.lastDetectionAt ? formatDateTime(c.lastDetectionAt) : "None yet",
    },
    {
      key: "actions",
      header: "Actions",
      render: (c) => {
        const busy = busyId === c.id;
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTest(c)}
                disabled={busy}
                className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
              >
                Test connection
              </button>
              <button
                type="button"
                onClick={() => handleToggleDetection(c)}
                disabled={busy}
                className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  c.detectionEnabled
                    ? "border-[var(--color-clay-200)] text-[var(--color-clay-600)] hover:bg-[var(--color-clay-50)]"
                    : "border-[var(--border-default)] hover:bg-[var(--bg-surface-muted)]"
                }`}
              >
                {c.detectionEnabled ? "Pause detection" : "Resume detection"}
              </button>
            </div>
            {testResult?.id === c.id && (
              <p
                role="status"
                className={`text-xs ${
                  testResult.ok
                    ? "text-[var(--color-olive-700)]"
                    : "text-[var(--color-clay-600)]"
                }`}
              >
                {testResult.message}
              </p>
            )}
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
            Cameras
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Cameras at signals watch for approaching emergency vehicles and
            report back to the detection service.
          </p>
        </div>
        <button
          type="button"
          onClick={openRegister}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[shadow:var(--shadow-sm)] transition-colors hover:bg-[var(--action-accent-hover)]"
        >
          <Plus size={18} aria-hidden />
          Connect camera
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
          placeholder="Search by camera or signal"
          aria-label="Search cameras"
          className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none"
        />
      </div>

      <section className="card overflow-hidden">
        <Table
          columns={columns}
          rows={filtered}
          rowKey={(c) => c.id}
          isLoading={isLoading}
          emptyMessage="No cameras match this search."
        />
      </section>

      {/* ---------- Register modal ---------- */}
      <Modal
        open={registerOpen}
        title="Connect camera"
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
            label="Camera name"
            name="name"
            value={form.name}
            onChange={setField("name")}
            error={formErrors.name}
            placeholder="CAM-101"
            required
          />
          <Select
            label="Signal"
            value={form.signalId}
            onChange={setField("signalId")}
            error={formErrors.signalId}
            placeholder="Choose a signal"
            options={signalOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            label="Direction it watches"
            value={form.direction}
            onChange={setField("direction")}
            options={directionOptions}
          />
          <Input
            label="Stream address"
            name="streamUrl"
            value={form.streamUrl}
            onChange={setField("streamUrl")}
            error={formErrors.streamUrl}
            placeholder="rtsp://..."
            hint="Stored securely on the server. It is never shown again after saving."
            autoComplete="off"
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
              {isRegistering ? "Connecting..." : "Connect camera"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default ManageCamerasPage;