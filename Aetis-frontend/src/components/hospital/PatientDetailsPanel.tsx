import type { ReactNode } from "react";
import { Lock, MapPin } from "lucide-react";

import type { Emergency } from "../../types/emergency.types";
import type { PatientInfo } from "../../types/hospital.types";

export interface PatientDetailsPanelProps {
  patient: PatientInfo;
  emergency: Emergency;
  className?: string;
}

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Trimmed text, or null when there is nothing worth showing */
const clean = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Age 0 is a real value (an infant), so this never uses a truthiness check */
function formatAge(age?: number | null): string {
  if (age == null || !Number.isFinite(age)) return "Not given";
  if (age < 1) return "Under 1 year";
  if (age < 2) return "1 year";
  return `${Math.round(age)} years`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold">{children}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PatientDetailsPanel({
  patient,
  emergency,
  className,
}: PatientDetailsPanelProps) {
  const isMedical = emergency.type === "medical";
  const heading = isMedical ? "Patient details" : "Incident details";

  const name = clean(patient?.name);
  const gender = clean(patient?.gender);
  const condition = clean(patient?.condition);
  const description = clean(emergency.description);
  const notes = clean(patient?.notes);
  const resources = (patient?.requiredResources ?? []).filter(
    (r) => clean(r) !== null
  );
  const vitals = (patient?.vitals ?? []).filter(
    (v) => clean(v.label) !== null && clean(v.value) !== null
  );

  return (
    <section aria-label={heading} className={cx("card p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg">{heading}</h2>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--color-sand-200)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
          <Lock size={12} aria-hidden />
          Confidential
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Use this information only to prepare for this arrival.
      </p>

      {isMedical && (
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <Field label="Name">{name ?? "Not given"}</Field>
          <Field label="Age">{formatAge(patient?.age)}</Field>
          <Field label="Gender">
            {gender ? GENDER_LABELS[gender] ?? gender : "Not stated"}
          </Field>
        </dl>
      )}

      <div className="mt-5 rounded-[var(--radius-md)] bg-[var(--bg-surface-muted)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {isMedical ? "Condition" : "Summary"}
        </h3>
        <p className="mt-1.5 whitespace-pre-line break-words text-sm">
          {condition ?? "Not provided"}
        </p>
      </div>

      {(isMedical || resources.length > 0) && (
        <Block title="Resources to prepare">
          {resources.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {resources.map((r, i) => (
                <li
                  key={`${r}-${i}`}
                  className="rounded-full border border-[var(--color-teal-200)] bg-[var(--color-teal-50)] px-3 py-1 text-sm font-semibold text-[var(--color-teal-700)]"
                >
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              None requested.
            </p>
          )}
        </Block>
      )}

      {description && (
        <Block title="Situation">
          <p className="whitespace-pre-line break-words text-sm text-[var(--text-secondary)]">
            {description}
          </p>
        </Block>
      )}

      {vitals.length > 0 && (
        <Block title="Vitals">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {vitals.map((v, i) => (
              <Field key={`${v.label}-${i}`} label={v.label}>
                {v.value}
              </Field>
            ))}
          </dl>
        </Block>
      )}

      {notes && (
        <Block title="Additional notes">
          <p className="whitespace-pre-line break-words text-sm text-[var(--text-secondary)]">
            {notes}
          </p>
        </Block>
      )}

      <Block title="Pickup location">
        <p className="flex items-start gap-1.5 break-words text-sm">
          <MapPin
            size={15}
            aria-hidden
            className="mt-0.5 shrink-0 text-[var(--text-muted)]"
          />
          {emergency.location.address}
        </p>
      </Block>
    </section>
  );
}

export default PatientDetailsPanel;