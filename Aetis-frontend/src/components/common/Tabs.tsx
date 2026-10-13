import { useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";

export interface TabItem {
  id: string;
  label: string;
  /** Optional count pill shown after the label */
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  "aria-label"?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Underlined tab bar. Arrow keys, Home and End move between tabs (and select
 * them); only the active tab is in the Tab order. The sliding indicator uses a
 * per-instance layoutId, so several Tabs can share a page.
 */
function Tabs({
  tabs,
  activeId,
  onChange,
  className,
  "aria-label": ariaLabel,
}: TabsProps) {
  const uid = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectIndex = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    onChange(tab.id);
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;

    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;

    if (next === null) return;
    e.preventDefault();
    selectIndex(next);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        "flex gap-1 overflow-x-auto border-b border-[var(--border-default)] no-scrollbar",
        className
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;

        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cx(
              "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors",
              active
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {tab.label}

            {tab.count !== undefined && (
              <span
                className={cx(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold leading-none",
                  active
                    ? "bg-[var(--color-clay-500)] text-white"
                    : "bg-[var(--color-sand-200)] text-[var(--text-secondary)]"
                )}
              >
                {tab.count}
              </span>
            )}

            {active && (
              <motion.span
                layoutId={`${uid}-tab-indicator`}
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--color-clay-500)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;