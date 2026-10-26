import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BellRing,
  Camera,
  History,
  LayoutDashboard,
  LogOut,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  TrafficCone,
  Truck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROUTES, getHomeRouteForRole } from "../../routes/routePaths";
import type { UserRole } from "../../types/user.types";
import { ROLE_LABELS } from "../../utils/constants";

export interface SidebarProps {
  collapsed: boolean;
  /** Desktop only. When omitted (mobile drawer) the collapse button is hidden. */
  onToggleCollapse?: () => void;
  /** Called after any link is clicked, e.g. to close the mobile drawer */
  onNavigate?: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (default true) */
  end?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const TRACKING: NavItem = {
  to: ROUTES.TRACKING.ROOT,
  label: "Live tracking",
  icon: MapPinned,
  end: false, // also active on /tracking/:emergencyId
};

/** Navigation per role. Mirrors the access rules in AppRouter. */
function getNavSections(role: UserRole): NavSection[] {
  switch (role) {
    case "dispatcher":
      return [
        {
          items: [
            { to: ROUTES.DISPATCHER.DASHBOARD, label: "Dashboard", icon: LayoutDashboard },
            { to: ROUTES.DISPATCHER.CREATE_EMERGENCY, label: "New emergency", icon: PlusCircle },
            TRACKING,
            { to: ROUTES.DISPATCHER.TRAFFIC_SIGNALS, label: "Traffic signals", icon: TrafficCone },
            { to: ROUTES.DISPATCHER.HISTORY, label: "History", icon: History },
          ],
        },
      ];

    case "driver":
      return [
        {
          items: [
            { to: ROUTES.DRIVER.HOME, label: "My assignment", icon: LayoutDashboard },
            TRACKING,
          ],
        },
      ];

    case "hospital":
    case "police":
    case "fire":
      return [
        {
          items: [
            { to: ROUTES.HOSPITAL.DASHBOARD, label: "Incoming", icon: BellRing },
            TRACKING,
          ],
        },
      ];

    case "admin":
      return [
        {
          title: "Administration",
          items: [
            { to: ROUTES.ADMIN.DASHBOARD, label: "Overview", icon: LayoutDashboard },
            { to: ROUTES.ADMIN.USERS, label: "Users", icon: Users },
            { to: ROUTES.ADMIN.VEHICLES, label: "Vehicles", icon: Truck },
            { to: ROUTES.ADMIN.SIGNALS, label: "Signals", icon: TrafficCone },
            { to: ROUTES.ADMIN.CAMERAS, label: "Cameras", icon: Camera },
            { to: ROUTES.ADMIN.ANALYTICS, label: "Analytics", icon: BarChart3 },
          ],
        },
        {
          title: "Monitoring",
          items: [
            TRACKING,
            { to: ROUTES.DISPATCHER.DASHBOARD, label: "Dispatcher view", icon: LayoutDashboard },
          ],
        },
      ];

    default:
      return [];
  }
}

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

function Sidebar({ collapsed, onToggleCollapse, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const sections = user ? getNavSections(user.role) : [];
  const homePath = user ? getHomeRouteForRole(user.role) : ROUTES.HOME;

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      onNavigate?.();
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  return (
    <div className="flex h-full flex-col text-[var(--text-inverse)]">
      {/* ---------- Brand ---------- */}
      <div
        className={cx(
          "flex h-[var(--topbar-height)] shrink-0 items-center border-b border-[var(--border-inverse)]",
          collapsed ? "justify-center" : "px-5"
        )}
      >
        <Link
          to={homePath}
          onClick={onNavigate}
          aria-label="AETIS dashboard home"
          className="inline-flex flex-col leading-none"
        >
          <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight">
            {collapsed ? "A" : "AETIS"}
          </span>
          {!collapsed && (
            <span className="mt-1 text-[11px] text-[var(--text-inverse-muted)]">
              Safer Roads. Faster Response.
            </span>
          )}
        </Link>
      </div>

      {/* ---------- Navigation ---------- */}
      <nav
        aria-label="Main menu"
        className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin"
      >
        {sections.map((section, index) => (
          <div key={section.title ?? index} className={index > 0 ? "mt-6" : ""}>
            {section.title && !collapsed && (
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-[var(--text-inverse-muted)] opacity-70">
                {section.title}
              </p>
            )}
            {section.title && collapsed && index > 0 && (
              <div
                aria-hidden
                className="mx-3 mb-3 border-t border-[var(--border-inverse)]"
              />
            )}

            <ul className="space-y-1">
              {section.items.map(({ to, label, icon: Icon, end = true }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cx(
                        "group relative flex items-center gap-3 rounded-[var(--radius-md)] py-2.5 text-sm font-semibold transition-colors",
                        collapsed ? "justify-center px-0" : "px-3",
                        isActive
                          ? "bg-white/10 text-[var(--text-inverse)]"
                          : "text-[var(--text-inverse-muted)] hover:bg-white/5 hover:text-[var(--text-inverse)]"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute inset-y-2 left-0 w-1 rounded-full bg-[var(--color-clay-500)]"
                          />
                        )}
                        <Icon size={20} aria-hidden className="shrink-0" />
                        <span className={collapsed ? "sr-only" : "truncate"}>
                          {label}
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ---------- Account ---------- */}
      <div className="shrink-0 border-t border-[var(--border-inverse)] p-3">
        {user && (
          <div
            className={cx(
              "mb-2 flex items-center gap-3 rounded-[var(--radius-md)] p-2",
              collapsed && "justify-center"
            )}
          >
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-clay-500)] text-sm font-bold text-white"
            >
              {getInitials(user.name)}
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-[var(--text-inverse-muted)]">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          disabled={isSigningOut}
          title={collapsed ? "Sign out" : undefined}
          className={cx(
            "flex w-full items-center gap-3 rounded-[var(--radius-md)] py-2.5 text-sm font-semibold text-[var(--text-inverse-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-inverse)] disabled:opacity-60",
            collapsed ? "justify-center px-0" : "px-3"
          )}
        >
          <LogOut size={20} aria-hidden className="shrink-0" />
          <span className={collapsed ? "sr-only" : ""}>
            {isSigningOut ? "Signing out..." : "Sign out"}
          </span>
        </button>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : undefined}
            className={cx(
              "mt-1 flex w-full items-center gap-3 rounded-[var(--radius-md)] py-2.5 text-sm font-semibold text-[var(--text-inverse-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-inverse)]",
              collapsed ? "justify-center px-0" : "px-3"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen size={20} aria-hidden className="shrink-0" />
            ) : (
              <>
                <PanelLeftClose size={20} aria-hidden className="shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default Sidebar;