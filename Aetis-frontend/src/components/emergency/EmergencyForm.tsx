import { useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ArrowRight } from "lucide-react";

import type { SeverityLevel } from "../../styles/theme";
import type {
  CreateEmergencyPayload,
  EmergencyType,
  PatientGender,
} from "../../types/emergency.types";
import { SEVERITY_LABELS } from "../../utils/constants";
import { isValidPhone } from "../../utils/validators";
import Button from "../common/Button";
import Input from "../common/Input";
import Select from "../common/Select";
import EmergencyTypeSelector from "./EmergencyTypeSelector";

export interface EmergencyFormProps {
  onSubmit: (payload: CreateEmergencyPayload) => void | Promise<void>;
  isSubmitting: boolean;
}

/* ---------- Static data ---------- */

const MAX_DESCRIPTION = 500;

const RESOURCE_OPTIONS = [
  "ICU bed",
  "Trauma team",
  "Cardiac team",
  "Oxygen support",
  "Blood bank",
  "Burn unit",
] as const;

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const SEVERITY_OPTIONS: {
  level: SeverityLevel;
  hint: string;
  dot: string;
}[] = [
  {
    level: "critical",
    hint: "Life-threatening, help needed immediately",
    dot: "bg-[var(--severity-critical)]",
  },
  { level: "high", hint: "Serious and urgent", dot: "bg-[var(--severity-high)]" },
  { level: "medium", hint: "Needs prompt help", dot: "bg-[var(--severity-medium)]" },
  { level: "low", hint: "Stable, no immediate danger", dot: "bg-[var(--severity-low)]" },
];

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/* ---------- Form state ---------- */

interface FormState {
  type: EmergencyType | "";
  severity: SeverityLevel | "";
  callerName: string;
  callerPhone: string;
  address: string;
  latitude: string;
  longitude: string;
  description: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  condition: string;
  resources: string[];
}

type TextKey =
  | "callerName"
  | "callerPhone"
  | "address"
  | "latitude"
  | "longitude"
  | "description"
  | "patientName"
  | "patientAge"
  | "patientGender"
  | "condition";

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  type: "",
  severity: "",
  callerName: "",
  callerPhone: "",
  address: "",
  latitude: "",
  longitude: "",
  description: "",
  patientName: "",
  patientAge: "",
  patientGender: "",
  condition: "",
  resources: [],
};

/** Order in which the first invalid field receives focus */
const FIELD_ORDER: (keyof FormState)[] = [
  "type",
  "severity",
  "callerName",
  "callerPhone",
  "address",
  "latitude",
  "longitude",
  "condition",
  "patientAge",
];

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!f.type) errors.type = "Choose which emergency service was called.";
  if (!f.severity) errors.severity = "Choose a severity level.";

  if (f.callerName.trim().length < 2) {
    errors.callerName = "Enter the caller's name, or \"Unknown\".";
  }
  if (!isValidPhone(f.callerPhone.trim())) {
    errors.callerPhone = "Enter a valid phone number.";
  }
  if (f.address.trim().length < 5) {
    errors.address = "Enter the location, including a nearby landmark.";
  }

  const latRaw = f.latitude.trim();
  const lngRaw = f.longitude.trim();
  if (latRaw || lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (!latRaw) {
      errors.latitude = "Enter both coordinates, or leave both blank.";
    } else if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.latitude = "Latitude must be between -90 and 90.";
    }

    if (!lngRaw) {
      errors.longitude = "Enter both coordinates, or leave both blank.";
    } else if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.longitude = "Longitude must be between -180 and 180.";
    }
  }

  if (f.type === "medical") {
    if (f.condition.trim().length < 3) {
      errors.condition = "Describe the patient's condition, or enter \"Unknown\".";
    }
    const ageRaw = f.patientAge.trim();
    if (ageRaw) {
      const age = Number(ageRaw);
      if (!Number.isInteger(age) || age < 0 || age > 120) {
        errors.patientAge = "Enter an age between 0 and 120.";
      }
    }
  }

  return errors;
}

/* ---------- Severity picker (only used by this form) ---------- */

interface SeverityPickerProps {
  id: string;
  value: SeverityLevel | "";
  onChange: (level: SeverityLevel) => void;
  error?: string;
}

function SeverityPicker({ id, value, onChange, error }: SeverityPickerProps) {
  const groupName = useId();
  const errorId = `${id}-error`;

  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-describedby={error ? errorId : undefined}
      className="min-w-0 focus:outline-none"
    >
      <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        Severity
        <span aria-hidden className="ml-0.5 text-[var(--color-clay-500)]">
          *
        </span>
      </legend>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SEVERITY_OPTIONS.map(({ level, hint, dot }) => {
          const selected = value === level;

          return (
            <label key={level} className="block cursor-pointer">
              <input
                type="radio"
                name={groupName}
                value={level}
                checked={selected}
                onChange={() => onChange(level)}
                required
                className="peer sr-only"
              />
              <span
                className={cx(
                  "flex h-full flex-col gap-1 rounded-[var(--radius-md)] border px-3 py-3 transition-colors",
                  "peer-focus-visible:shadow-[shadow:var(--shadow-focus)]",
                  selected
                    ? "border-[var(--action-primary)] bg-[var(--color-teal-50)]"
                    : error
                      ? "border-[var(--color-clay-500)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-muted)]"
                      : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-muted)]"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", dot)} />
                  {SEVERITY_LABELS[level]}
                </span>
                <span className="text-xs leading-snug text-[var(--text-secondary)]">
                  {hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs font-medium text-[var(--color-clay-600)]"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

/* ---------- Form ---------- */

function EmergencyForm({ onSubmit, isSubmitting }: EmergencyFormProps) {
  const uid = useId();
  const fid = (key: string) => `${uid}-${key}`;

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  const errorCount = Object.values(errors).filter(Boolean).length;
  const isMedical = form.type === "medical";

  const clearError = (key: keyof FormState) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const setText =
    (key: TextKey) =>
    (
      e: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      const value =
        key === "description"
          ? e.target.value.slice(0, MAX_DESCRIPTION)
          : e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      clearError(key);
    };

  const setType = (type: EmergencyType) => {
    setForm((prev) => ({ ...prev, type }));
    clearError("type");
  };

  const setSeverity = (severity: SeverityLevel) => {
    setForm((prev) => ({ ...prev, severity }));
    clearError("severity");
  };

  const toggleResource = (name: string) =>
    setForm((prev) => ({
      ...prev,
      resources: prev.resources.includes(name)
        ? prev.resources.filter((r) => r !== name)
        : [...prev.resources, name],
    }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const found = validate(form);
    setErrors(found);

    const firstInvalid = FIELD_ORDER.find((key) => found[key]);
    if (firstInvalid) {
      document.getElementById(fid(firstInvalid))?.focus();
      return;
    }
    // Narrowing for TypeScript; validate() already guarantees both are set
    if (!form.type || !form.severity) return;

    const location: CreateEmergencyPayload["location"] = {
      address: form.address.trim(),
    };
    if (form.latitude.trim() && form.longitude.trim()) {
      location.lat = Number(form.latitude);
      location.lng = Number(form.longitude);
    }

    const payload: CreateEmergencyPayload = {
      type: form.type,
      severity: form.severity,
      callerName: form.callerName.trim(),
      callerPhone: form.callerPhone.trim(),
      location,
      description: form.description.trim() || undefined,
    };

    if (form.type === "medical") {
      payload.patient = {
        name: form.patientName.trim() || undefined,
        age: form.patientAge.trim() ? Number(form.patientAge) : undefined,
        gender: (form.patientGender || undefined) as PatientGender | undefined,
        condition: form.condition.trim(),
        requiredResources: form.resources,
      };
    }

    void onSubmit(payload);
  };

  const textareaId = fid("description");
  const hintId = `${textareaId}-hint`;

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="New emergency request">
      {/* A disabled fieldset disables every control inside it while submitting */}
      <fieldset disabled={isSubmitting} className="min-w-0 space-y-8">
        {errorCount > 0 && (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
          >
            Please correct {errorCount} {errorCount === 1 ? "field" : "fields"}{" "}
            below.
          </div>
        )}

        {/* ---------- Service and severity ---------- */}
        <div className="space-y-5">
          <h2 className="text-lg">Service and severity</h2>
          <EmergencyTypeSelector
            id={fid("type")}
            value={form.type}
            onChange={setType}
            error={errors.type}
          />
          <SeverityPicker
            id={fid("severity")}
            value={form.severity}
            onChange={setSeverity}
            error={errors.severity}
          />
        </div>

        {/* ---------- Caller ---------- */}
        <div className="space-y-5">
          <h2 className="text-lg">Caller</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              id={fid("callerName")}
              label="Caller's name"
              name="callerName"
              value={form.callerName}
              onChange={setText("callerName")}
              error={errors.callerName}
              hint="Enter Unknown if the caller will not say."
              autoComplete="off"
              required
            />
            <Input
              id={fid("callerPhone")}
              label="Caller's phone"
              name="callerPhone"
              type="tel"
              inputMode="tel"
              value={form.callerPhone}
              onChange={setText("callerPhone")}
              error={errors.callerPhone}
              autoComplete="off"
              required
            />
          </div>
        </div>

        {/* ---------- Location ---------- */}
        <div className="space-y-5">
          <h2 className="text-lg">Location</h2>
          <Input
            id={fid("address")}
            label="Address"
            name="address"
            value={form.address}
            onChange={setText("address")}
            error={errors.address}
            hint="Include a nearby landmark or the nearest junction."
            autoComplete="off"
            required
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              id={fid("latitude")}
              label="Latitude (optional)"
              name="latitude"
              type="number"
              step="any"
              inputMode="decimal"
              value={form.latitude}
              onChange={setText("latitude")}
              error={errors.latitude}
              autoComplete="off"
            />
            <Input
              id={fid("longitude")}
              label="Longitude (optional)"
              name="longitude"
              type="number"
              step="any"
              inputMode="decimal"
              value={form.longitude}
              onChange={setText("longitude")}
              error={errors.longitude}
              autoComplete="off"
            />
          </div>
          <p className="-mt-2 text-xs text-[var(--text-secondary)]">
            Add coordinates only if the caller's position is already known. If
            left blank, AETIS locates the address.
          </p>
        </div>

        {/* ---------- Situation ---------- */}
        <div>
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]"
          >
            Situation{" "}
            <span className="font-normal text-[var(--text-muted)]">
              (optional)
            </span>
          </label>
          <textarea
            id={textareaId}
            name="description"
            rows={4}
            value={form.description}
            onChange={setText("description")}
            aria-describedby={hintId}
            placeholder="What happened, how many people are involved, any hazards"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none disabled:cursor-not-allowed disabled:bg-[var(--bg-surface-muted)]"
          />
          <p
            id={hintId}
            className="mt-1 text-right text-xs text-[var(--text-muted)]"
          >
            {form.description.length}/{MAX_DESCRIPTION}
          </p>
        </div>

        {/* ---------- Patient (medical only) ---------- */}
        {isMedical && (
          <div className="space-y-5 rounded-[var(--radius-lg)] bg-[var(--bg-surface-muted)] p-5">
            <div>
              <h2 className="text-lg">Patient details</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Shared with the receiving hospital so it can prepare before the
                patient arrives.
              </p>
            </div>

            <Input
              id={fid("condition")}
              label="Condition"
              name="condition"
              value={form.condition}
              onChange={setText("condition")}
              error={errors.condition}
              hint="For example: chest pain, road accident, breathing difficulty. Enter Unknown if unclear."
              autoComplete="off"
              required
            />

            <div className="grid gap-5 sm:grid-cols-3">
              <Input
                id={fid("patientName")}
                label="Name (optional)"
                name="patientName"
                value={form.patientName}
                onChange={setText("patientName")}
                autoComplete="off"
                className="sm:col-span-1"
              />
              <Input
                id={fid("patientAge")}
                label="Age (optional)"
                name="patientAge"
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                value={form.patientAge}
                onChange={setText("patientAge")}
                error={errors.patientAge}
                autoComplete="off"
              />
              <Select
                id={fid("patientGender")}
                label="Gender (optional)"
                value={form.patientGender}
                onChange={setText("patientGender")}
                options={GENDER_OPTIONS}
                placeholder="Not stated"
              />
            </div>

            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                Resources to prepare{" "}
                <span className="font-normal text-[var(--text-muted)]">
                  (optional)
                </span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {RESOURCE_OPTIONS.map((name) => (
                  <label
                    key={name}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.resources.includes(name)}
                      onChange={() => toggleResource(name)}
                      className="h-4 w-4 accent-[var(--color-teal-600)]"
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {/* ---------- Submit ---------- */}
        <div>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            rightIcon={<ArrowRight size={18} aria-hidden />}
          >
            {isSubmitting ? "Registering..." : "Continue to dispatch"}
          </Button>
          <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">
            Next, you choose which vehicle to send.
          </p>
        </div>
      </fieldset>
    </form>
  );
}

export default EmergencyForm;