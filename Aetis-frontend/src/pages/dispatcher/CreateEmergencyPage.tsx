import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, PhoneCall } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import EmergencyForm from "../../components/emergency/EmergencyForm";
import { ROUTES, buildDispatchPath } from "../../routes/routePaths";
import { emergencyApi } from "../../services/api/emergencyApi";
import type { CreateEmergencyPayload } from "../../types/emergency.types";

const HELPLINES = [
  { number: "108", label: "Medical / Ambulance" },
  { number: "100", label: "Police" },
  { number: "101", label: "Fire" },
] as const;

function CreateEmergencyPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "New Emergency | AETIS";
  }, []);

  const handleSubmit = async (payload: CreateEmergencyPayload) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const emergency = await emergencyApi.createEmergency(payload);
      // Next step in the workflow: pick and dispatch a vehicle
      navigate(buildDispatchPath(emergency.id), { replace: true });
    } catch {
      setError("Could not register the emergency. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={ROUTES.DISPATCHER.DASHBOARD}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl text-[var(--text-primary)] sm:text-3xl">
          Create emergency request
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Enter the caller's details exactly as received. A vehicle is selected
          in the next step.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="card p-5 sm:p-6"
          aria-label="Emergency details"
        >
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
            >
              {error}
            </div>
          )}

          <EmergencyForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </motion.section>

        <aside className="space-y-4" aria-label="Guidance">
          <div className="card-dark p-5">
            <div className="flex items-center gap-2">
              <PhoneCall size={18} aria-hidden />
              <h2 className="text-base text-[var(--text-inverse)]">
                Emergency helplines
              </h2>
            </div>
            <ul className="mt-4 space-y-3">
              {HELPLINES.map((h) => (
                <li
                  key={h.number}
                  className="flex items-center justify-between rounded-[var(--radius-md)] bg-white/5 px-4 py-3"
                >
                  <span className="text-sm text-[var(--text-inverse-muted)]">
                    {h.label}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-lg font-semibold text-[var(--color-sand-200)]">
                    {h.number}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card-sand p-5">
            <h2 className="text-base">Before you submit</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
              <li>Confirm the caller's location and a nearby landmark.</li>
              <li>Set severity honestly. It decides signal priority.</li>
              <li>Add patient condition so the hospital can prepare early.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default CreateEmergencyPage;