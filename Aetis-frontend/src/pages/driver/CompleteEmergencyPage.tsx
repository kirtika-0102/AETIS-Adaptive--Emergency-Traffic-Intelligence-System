import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Loader from "../../components/common/Loader";
import SeverityBadge from "../../components/emergency/SeverityBadge";
import { ROUTES, buildDriverNavigationPath } from "../../routes/routePaths";
import { emergencyApi } from "../../services/api/emergencyApi";
import type {
  CompleteEmergencyPayload,
  CompletionOutcome,
  Emergency,
} from "../../types/emergency.types";
import { EMERGENCY_TYPE_LABELS } from "../../utils/constants";

const OUTCOMES: { value: CompletionOutcome; label: string; hint: string }[] = [
  {
    value: "handed_over",
    label: "Handed over",
    hint: "Patient or case handed to the destination team",
  },
  {
    value: "no_patient",
    label: "No patient found",
    hint: "Reached the location but nobody needed transport",
  },
  {
    value: "false_alarm",
    label: "False alarm",
    hint: "The request was not a genuine emergency",
  },
];

const MAX_NOTES = 500;

function CompleteEmergencyPage() {
  const { emergencyId } = useParams<{ emergencyId: string }>();
  const navigate = useNavigate();

  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [outcome, setOutcome] = useState<CompletionOutcome>("handed_over");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Complete Emergency | AETIS";
    if (!emergencyId) return;

    let cancelled = false;

    emergencyApi
      .getEmergencyById(emergencyId)
      .then((e) => {
        if (!cancelled) setEmergency(e);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this assignment.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [emergencyId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!emergencyId || !confirmed) return;

    const payload: CompleteEmergencyPayload = {
      outcome,
      notes: notes.trim() || undefined,
      handoverConfirmed: confirmed,
    };

    setIsSubmitting(true);
    setError(null);
    try {
      await emergencyApi.completeEmergency(emergencyId, payload);
      navigate(ROUTES.DRIVER.HOME, { replace: true });
    } catch {
      setError("Could not close this emergency. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Loader />;

  if (!emergency) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="text-xl">Assignment not found</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {error ?? "This assignment does not exist or was removed."}
        </p>
        <Link
          to={ROUTES.DRIVER.HOME}
          className="mt-6 inline-block text-sm font-semibold text-[var(--action-accent)]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // Already closed, nothing left to submit
  if (emergency.status === "completed" || emergency.status === "cancelled") {
    return (
      <div className="card-sand mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl">Already closed</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          This emergency is {emergency.status}.
        </p>
        <Link
          to={ROUTES.DRIVER.HOME}
          className="mt-6 inline-block text-sm font-semibold text-[var(--action-accent)]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={buildDriverNavigationPath(emergency.id)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to navigation
        </Link>
        <h1 className="mt-3 text-2xl text-[var(--text-primary)] sm:text-3xl">
          Complete emergency
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Closing this request releases your vehicle and returns traffic signals
          to normal.
        </p>
      </div>

      <section className="card p-5" aria-label="Emergency summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-[var(--font-mono)] text-xs text-[var(--text-muted)]">
              {emergency.id}
            </p>
            <h2 className="mt-1 text-lg">
              {EMERGENCY_TYPE_LABELS[emergency.type]}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {emergency.location.address}
            </p>
          </div>
          <SeverityBadge severity={emergency.severity} />
        </div>
      </section>

      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        onSubmit={handleSubmit}
        className="card space-y-6 p-5 sm:p-6"
        noValidate
      >
        {error && (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
          >
            {error}
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-semibold">Outcome</legend>
          <div className="mt-3 space-y-2">
            {OUTCOMES.map((o) => {
              const selected = outcome === o.value;
              return (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 transition-colors ${
                    selected
                      ? "border-[var(--action-primary)] bg-[var(--color-teal-50)]"
                      : "border-[var(--border-default)] hover:bg-[var(--bg-surface-muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="outcome"
                    value={o.value}
                    checked={selected}
                    onChange={() => setOutcome(o.value)}
                    className="mt-1 accent-[var(--color-teal-600)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">
                      {o.label}
                    </span>
                    <span className="block text-xs text-[var(--text-secondary)]">
                      {o.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="notes" className="text-sm font-semibold">
            Notes <span className="font-normal text-[var(--text-muted)]">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
            rows={4}
            placeholder="Anything the dispatcher or destination should know"
            className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-[var(--text-muted)]">
            {notes.length}/{MAX_NOTES}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-teal-600)]"
          />
          <span>
            I confirm the details above are accurate and this emergency can be
            closed.
          </span>
        </label>

        <button
          type="submit"
          disabled={!confirmed || isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-secondary)] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--action-secondary-hover)] disabled:bg-[var(--color-sand-300)] disabled:text-[var(--text-muted)]"
        >
          <CheckCircle2 size={18} aria-hidden />
          {isSubmitting ? "Closing..." : "Close emergency"}
        </button>
      </motion.form>
    </div>
  );
}

export default CompleteEmergencyPage;