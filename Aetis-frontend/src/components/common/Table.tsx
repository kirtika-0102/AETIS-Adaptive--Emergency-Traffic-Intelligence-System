import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  /** Custom cell. Without it, row[key] is rendered as text. */
  render?: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Accessible name for the table */
  caption?: string;
  skeletonRows?: number;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const ALIGN_CLASSES = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

/** Clicks and keys on these inside a row must not trigger onRowClick */
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button']";

function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isLoading = false,
  emptyMessage = "Nothing to show.",
  caption,
  skeletonRows = 5,
}: TableProps<T>) {
  const showSkeleton = isLoading && rows.length === 0;
  const showEmpty = !isLoading && rows.length === 0;

  const handleClick = (e: MouseEvent<HTMLTableRowElement>, row: T) => {
    const interactive = (e.target as HTMLElement).closest(INTERACTIVE);
    if (interactive && e.currentTarget.contains(interactive)) return;
    onRowClick?.(row);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  const renderCell = (col: TableColumn<T>, row: T): ReactNode => {
    if (col.render) return col.render(row);
    const value = (row as unknown as Record<string, unknown>)[col.key];
    return value == null ? "" : String(value);
  };

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table
        className="w-full min-w-[640px] border-collapse text-left text-sm"
        aria-busy={isLoading}
      >
        {caption && <caption className="sr-only">{caption}</caption>}

        <thead className="bg-[var(--bg-surface-muted)]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cx(
                  "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]",
                  ALIGN_CLASSES[col.align ?? "left"],
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody
          className={cx(
            "transition-opacity",
            isLoading && rows.length > 0 && "opacity-60"
          )}
        >
          {showSkeleton &&
            Array.from({ length: skeletonRows }, (_, r) => (
              <tr key={`skeleton-${r}`} className="border-t border-[var(--border-subtle)]">
                {columns.map((col, c) => (
                  <td key={col.key} className="px-4 py-4">
                    <div
                      className="h-3.5 animate-pulse rounded-full bg-[var(--color-sand-200)]"
                      style={{ width: `${50 + ((r * 7 + c * 13) % 40)}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}

          {showEmpty && (
            <tr className="border-t border-[var(--border-subtle)]">
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-[var(--text-secondary)]"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? (e) => handleClick(e, row) : undefined}
              onKeyDown={onRowClick ? (e) => handleKeyDown(e, row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cx(
                "border-t border-[var(--border-subtle)] transition-colors",
                onRowClick &&
                  "cursor-pointer hover:bg-[var(--bg-surface-muted)] focus-visible:bg-[var(--bg-surface-muted)]"
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    "px-4 py-3 align-middle",
                    ALIGN_CLASSES[col.align ?? "left"],
                    col.className
                  )}
                >
                  {renderCell(col, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;