import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Flame,
  Headphones,
  Settings,
  ShieldCheck,
  Truck,
} from "lucide-react";

import type { UserRole } from "../../types/user.types";
import { ROLE_LABELS } from "../../utils/constants";

export interface RoleSelectorProps {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}

interface RoleOption {
  role: UserRole;
  icon: LucideIcon;
  hint: string;
}

const OPTIONS: RoleOption[] = [
  { role: "dispatcher", icon: Headphones, hint: "Handle calls and dispatch" },
  { role: "driver", icon: Truck, hint: "Receive assignments" },
  { role: "hospital", icon: Building2, hint: "Prepare for arrivals" },
  { role: "police", icon: ShieldCheck, hint: "Police station" },
  { role: "fire", icon: Flame, hint: "Fire station" },
  { role: "admin", icon: Settings, hint: "Manage the system" },
];

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Role picker built on native radio inputs, so arrow keys, focus handling and
 * screen-reader semantics come from the browser. The role chosen here is sent
 * with the login request; the backend must still verify it matches the account.
 */
function RoleSelector({ value, onChange, disabled = false }: RoleSelectorProps) {
  const groupName = useId();

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        I am signing in as
      </legend>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OPTIONS.map(({ role, icon: Icon, hint }) => {
          const selected = value === role;

          return (
            <label
              key={role}
              className={cx(
                "block",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={role}
                checked={selected}
                onChange={() => onChange(role)}
                className="peer sr-only"
              />

              <span
                className={cx(
                  "flex h-full flex-col items-start gap-1.5 rounded-[var(--radius-md)] border px-3 py-3 transition-colors",
                  "peer-focus-visible:shadow-[var(--shadow-focus)]",
                  selected
                    ? "border-[var(--action-primary)] bg-[var(--color-teal-50)]"
                    : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-muted)]"
                )}
              >
                <Icon
                  size={20}
                  aria-hidden
                  className={
                    selected
                      ? "text-[var(--color-teal-600)]"
                      : "text-[var(--text-muted)]"
                  }
                />
                <span className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-xs leading-snug text-[var(--text-secondary)]">
                  {hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default RoleSelector;