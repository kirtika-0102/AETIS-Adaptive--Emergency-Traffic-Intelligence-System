import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Plus, Search } from "lucide-react";

import Badge from "../../components/common/Badge";
import Input from "../../components/common/Input";
import Modal from "../../components/common/Modal";
import Select from "../../components/common/Select";
import Table, { type TableColumn } from "../../components/common/Table";
import { useAuth } from "../../hooks/useAuth";
import { useDebounce } from "../../hooks/useDebounce";
import { ALL_ROLES, DESTINATION_ROLES } from "../../routes/routePaths";
import { adminApi } from "../../services/api/adminApi";
import type {
  AdminUser,
  CreateUserPayload,
  UserRole,
  UserStatus,
} from "../../types/user.types";
import { ROLE_LABELS, USER_STATUS_LABELS } from "../../utils/constants";
import { formatDateTime } from "../../utils/formatters";
import { isValidEmail, isValidPhone } from "../../utils/validators";

const PAGE_SIZE = 10;

const STATUS_TONE: Record<UserStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  pending: "warning",
  suspended: "neutral",
};

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  role: "dispatcher" as UserRole,
  employeeId: "",
  organization: "",
};

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

const needsOrganization = (role: UserRole) => DESTINATION_ROLES.includes(role);
const needsEmployeeId = (role: UserRole) =>
  role === "dispatcher" || role === "driver";

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};
  if (f.name.trim().length < 2) errors.name = "Enter the full name.";
  if (!isValidEmail(f.email.trim())) errors.email = "Enter a valid email.";
  if (!isValidPhone(f.phone.trim())) errors.phone = "Enter a valid phone number.";
  if (needsEmployeeId(f.role) && !f.employeeId.trim()) {
    errors.employeeId = "Employee or badge ID is required for this role.";
  }
  if (needsOrganization(f.role) && !f.organization.trim()) {
    errors.organization = "Enter the hospital or station name.";
  }
  return errors;
}

const filterSelectClass =
  "rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm focus:border-[var(--action-primary)] focus:outline-none";

const roleOptions = ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

interface PendingConfirm {
  user: AdminUser;
  next: "active" | "suspended";
}

function ManageUsersPage() {
  const { user: me } = useAuth();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Manage Users | AETIS";
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    adminApi
      .getUsers({
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setTotal(res.total);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load users.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, roleFilter, statusFilter, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refresh = () => setReloadKey((k) => k + 1);

  /* ---------- Row actions ---------- */
  const handleVerify = async (u: AdminUser) => {
    setBusyId(u.id);
    setNotice(null);
    try {
      await adminApi.verifyUser(u.id);
      setNotice(`${u.name} is now verified and active.`);
      setError(null);
      refresh();
    } catch {
      setError("Could not verify this account. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmStatus = async () => {
    if (!confirm) return;
    const { user: target, next } = confirm;

    setBusyId(target.id);
    setNotice(null);
    try {
      await adminApi.setUserStatus(target.id, next);
      setNotice(
        next === "suspended"
          ? `${target.name} has been suspended.`
          : `${target.name} has been reactivated.`
      );
      setError(null);
      setConfirm(null);
      refresh();
    } catch {
      setError("Could not update this account. Please try again.");
      setConfirm(null);
    } finally {
      setBusyId(null);
    }
  };

  /* ---------- Create user ---------- */
  const setField =
    (key: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
      setFormErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();

    const errors = validate(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: CreateUserPayload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      role: form.role,
      employeeId: needsEmployeeId(form.role) ? form.employeeId.trim() : undefined,
      organization: needsOrganization(form.role)
        ? form.organization.trim()
        : undefined,
    };

    setIsCreating(true);
    setCreateError(null);
    try {
      await adminApi.createUser(payload);
      setCreateOpen(false);
      setNotice(`Invitation sent to ${payload.email}.`);
      refresh();
    } catch {
      setCreateError("Could not create this account. Check the details and try again.");
    } finally {
      setIsCreating(false);
    }
  };

  /* ---------- Table ---------- */
  const columns: TableColumn<AdminUser>[] = [
    {
      key: "name",
      header: "User",
      render: (u) => (
        <div>
          <p className="font-semibold">{u.name}</p>
          <p className="text-xs text-[var(--text-secondary)]">{u.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => (
        <div>
          <p>{ROLE_LABELS[u.role]}</p>
          {u.organization && (
            <p className="text-xs text-[var(--text-secondary)]">
              {u.organization}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "employeeId",
      header: "Employee ID",
      render: (u) =>
        u.employeeId ? (
          <span className="font-[family-name:var(--font-mono)] text-xs">{u.employeeId}</span>
        ) : (
          "-"
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONE[u.status]}>{USER_STATUS_LABELS[u.status]}</Badge>
          {!u.verified && <Badge tone="warning">Unverified</Badge>}
        </div>
      ),
    },
    {
      key: "lastLoginAt",
      header: "Last sign-in",
      render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (u) => {
        const isSelf = me?.id === u.id;
        const busy = busyId === u.id;

        return (
          <div className="flex flex-wrap gap-2">
            {!u.verified && (
              <button
                type="button"
                onClick={() => handleVerify(u)}
                disabled={busy}
                className="rounded-[var(--radius-sm)] bg-[var(--action-secondary)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--action-secondary-hover)] disabled:opacity-50"
              >
                Verify
              </button>
            )}
            {u.status === "suspended" ? (
              <button
                type="button"
                onClick={() => setConfirm({ user: u, next: "active" })}
                disabled={busy}
                className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
              >
                Reactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm({ user: u, next: "suspended" })}
                disabled={busy || isSelf}
                title={isSelf ? "You cannot suspend your own account" : undefined}
                className="rounded-[var(--radius-sm)] border border-[var(--color-clay-200)] px-3 py-1.5 text-xs font-semibold text-[var(--color-clay-600)] transition-colors hover:bg-[var(--color-clay-50)] disabled:opacity-50"
              >
                Suspend
              </button>
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
            Users
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Only verified accounts can sign in. Verify each dispatcher and driver
            against their employee records first.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--action-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[shadow:var(--shadow-sm)] transition-colors hover:bg-[var(--action-accent-hover)]"
        >
          <Plus size={18} aria-hidden />
          Add user
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

      {/* ---------- Filters ---------- */}
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
            placeholder="Search by name, email or ID"
            aria-label="Search users"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--action-primary)] focus:outline-none"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | "")}
          aria-label="Filter by role"
          className={filterSelectClass}
        >
          <option value="">All roles</option>
          {roleOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as UserStatus | "")}
          aria-label="Filter by status"
          className={filterSelectClass}
        >
          <option value="">All statuses</option>
          {(Object.keys(USER_STATUS_LABELS) as UserStatus[]).map((s) => (
            <option key={s} value={s}>
              {USER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* ---------- Table ---------- */}
      <section className="card overflow-hidden">
        <Table
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="No users match these filters."
        />

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-5 py-3 text-sm sm:flex-row">
          <p className="text-[var(--text-secondary)]">
            {total === 0
              ? "No results"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(
                  page * PAGE_SIZE,
                  total
                )} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-1.5 font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-[var(--text-secondary)]">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-1.5 font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Create modal ---------- */}
      <Modal
        open={createOpen}
        title="Add user"
        onClose={() => !isCreating && setCreateOpen(false)}
      >
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          {createError && (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
            >
              {createError}
            </div>
          )}

          <Input
            label="Full name"
            name="name"
            value={form.name}
            onChange={setField("name")}
            error={formErrors.name}
            required
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={setField("email")}
            error={formErrors.email}
            required
          />
          <Input
            label="Phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={setField("phone")}
            error={formErrors.phone}
            required
          />
          <Select
            label="Role"
            value={form.role}
            onChange={setField("role")}
            options={roleOptions}
          />

          {needsEmployeeId(form.role) && (
            <Input
              label="Employee / badge ID"
              name="employeeId"
              value={form.employeeId}
              onChange={setField("employeeId")}
              error={formErrors.employeeId}
              hint="Used to verify this person against official records."
              required
            />
          )}
          {needsOrganization(form.role) && (
            <Input
              label="Hospital or station name"
              name="organization"
              value={form.organization}
              onChange={setField("organization")}
              error={formErrors.organization}
              required
            />
          )}

          <p className="text-xs text-[var(--text-secondary)]">
            An invitation with a link to set a password is sent to this email.
            The account stays unverified until you verify it.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={isCreating}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="rounded-[var(--radius-md)] bg-[var(--action-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--action-primary-hover)] disabled:opacity-60"
            >
              {isCreating ? "Sending..." : "Create and invite"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---------- Suspend / reactivate confirmation ---------- */}
      <Modal
        open={confirm !== null}
        title={
          confirm?.next === "suspended" ? "Suspend account" : "Reactivate account"
        }
        size="sm"
        onClose={() => busyId === null && setConfirm(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirm(null)}
              disabled={busyId !== null}
              className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-surface-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmStatus}
              disabled={busyId !== null}
              className={`rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                confirm?.next === "suspended"
                  ? "bg-[var(--color-clay-600)] hover:bg-[var(--color-clay-700)]"
                  : "bg-[var(--action-secondary)] hover:bg-[var(--action-secondary-hover)]"
              }`}
            >
              {confirm?.next === "suspended" ? "Suspend" : "Reactivate"}
            </button>
          </div>
        }
      >
        {confirm && (
          <p className="text-sm text-[var(--text-secondary)]">
            {confirm.next === "suspended"
              ? `${confirm.user.name} will be signed out and unable to log in until reactivated.`
              : `${confirm.user.name} will be able to sign in again.`}
          </p>
        )}
      </Modal>
    </div>
  );
}

export default ManageUsersPage;