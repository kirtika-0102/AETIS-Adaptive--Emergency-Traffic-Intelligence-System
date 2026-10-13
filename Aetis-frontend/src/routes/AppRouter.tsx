import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import PublicLayout from "../layouts/PublicLayout";

import ProtectedRoute, { GuestRoute } from "./ProtectedRoute";
import { ALL_ROLES, DESTINATION_ROLES, ROUTES } from "./routePaths";

/* ---------- Lazy-loaded pages (code splitting per role) ---------- */

// Public / auth
const LandingPage = lazy(() => import("../pages/landing/LandingPage"));
const LoginPage = lazy(() => import("../pages/auth/LoginPage"));
const UnauthorizedPage = lazy(() => import("../pages/auth/UnauthorizedPage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));

// Dispatcher
const DispatcherDashboard = lazy(
  () => import("../pages/dispatcher/DispatcherDashboard")
);
const CreateEmergencyPage = lazy(
  () => import("../pages/dispatcher/CreateEmergencyPage")
);
const DispatchVehiclePage = lazy(
  () => import("../pages/dispatcher/DispatchVehiclePage")
);
const LiveTrackingPage = lazy(
  () => import("../pages/dispatcher/LiveTrackingPage")
);
const TrafficSignalsPage = lazy(
  () => import("../pages/dispatcher/TrafficSignalsPage")
);
const EmergencyHistoryPage = lazy(
  () => import("../pages/dispatcher/EmergencyHistoryPage")
);

// Driver
const DriverHome = lazy(() => import("../pages/driver/DriverHome"));
const DriverNavigation = lazy(() => import("../pages/driver/DriverNavigation"));
const CompleteEmergencyPage = lazy(
  () => import("../pages/driver/CompleteEmergencyPage")
);

// Hospital / Police / Fire
const HospitalDashboard = lazy(
  () => import("../pages/hospital/HospitalDashboard")
);
const IncomingEmergencyDetail = lazy(
  () => import("../pages/hospital/IncomingEmergencyDetail")
);

// Admin
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
const ManageUsersPage = lazy(() => import("../pages/admin/ManageUsersPage"));
const ManageVehiclesPage = lazy(
  () => import("../pages/admin/ManageVehiclesPage")
);
const ManageSignalsPage = lazy(
  () => import("../pages/admin/ManageSignalsPage")
);
const ManageCamerasPage = lazy(
  () => import("../pages/admin/ManageCamerasPage")
);
const AnalyticsReportsPage = lazy(
  () => import("../pages/admin/AnalyticsReportsPage")
);

/**
 * Route map for AETIS.
 *
 * Structure:
 *  - PublicLayout    -> landing page
 *  - AuthLayout      -> login (guests only)
 *  - DashboardLayout -> everything behind login, split by role guards
 *
 * Layouts must render <Outlet /> for their nested pages.
 */
function AppRouter() {
  return (
    <Routes>
      {/* ---------- Public ---------- */}
      <Route element={<PublicLayout />}>
        <Route path={ROUTES.HOME} element={<LandingPage />} />
      </Route>

      {/* ---------- Auth (guests only) ---------- */}
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        </Route>
      </Route>

      {/* ---------- Authenticated area ---------- */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          {/* Shared: any signed-in role */}
          <Route path={ROUTES.UNAUTHORIZED} element={<UnauthorizedPage />} />

          {/* Live tracking: all roles */}
          <Route element={<ProtectedRoute allowedRoles={ALL_ROLES} />}>
            <Route path={ROUTES.TRACKING.ROOT} element={<LiveTrackingPage />} />
            <Route
              path={ROUTES.TRACKING.DETAIL}
              element={<LiveTrackingPage />}
            />
          </Route>

          {/* Dispatcher (admin can supervise) */}
          <Route
            element={<ProtectedRoute allowedRoles={["dispatcher", "admin"]} />}
          >
            <Route
              path={ROUTES.DISPATCHER.DASHBOARD}
              element={<DispatcherDashboard />}
            />
            <Route
              path={ROUTES.DISPATCHER.CREATE_EMERGENCY}
              element={<CreateEmergencyPage />}
            />
            <Route
              path={ROUTES.DISPATCHER.DISPATCH_VEHICLE}
              element={<DispatchVehiclePage />}
            />
            <Route
              path={ROUTES.DISPATCHER.TRAFFIC_SIGNALS}
              element={<TrafficSignalsPage />}
            />
            <Route
              path={ROUTES.DISPATCHER.HISTORY}
              element={<EmergencyHistoryPage />}
            />
          </Route>

          {/* Driver */}
          <Route element={<ProtectedRoute allowedRoles={["driver"]} />}>
            <Route path={ROUTES.DRIVER.HOME} element={<DriverHome />} />
            <Route
              path={ROUTES.DRIVER.NAVIGATION}
              element={<DriverNavigation />}
            />
            <Route
              path={ROUTES.DRIVER.COMPLETE}
              element={<CompleteEmergencyPage />}
            />
          </Route>

          {/* Hospital / Police / Fire destinations */}
          <Route
            element={
              <ProtectedRoute allowedRoles={[...DESTINATION_ROLES, "admin"]} />
            }
          >
            <Route
              path={ROUTES.HOSPITAL.DASHBOARD}
              element={<HospitalDashboard />}
            />
            <Route
              path={ROUTES.HOSPITAL.EMERGENCY_DETAIL}
              element={<IncomingEmergencyDetail />}
            />
          </Route>

          {/* Admin only */}
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path={ROUTES.ADMIN.DASHBOARD} element={<AdminDashboard />} />
            <Route path={ROUTES.ADMIN.USERS} element={<ManageUsersPage />} />
            <Route
              path={ROUTES.ADMIN.VEHICLES}
              element={<ManageVehiclesPage />}
            />
            <Route
              path={ROUTES.ADMIN.SIGNALS}
              element={<ManageSignalsPage />}
            />
            <Route
              path={ROUTES.ADMIN.CAMERAS}
              element={<ManageCamerasPage />}
            />
            <Route
              path={ROUTES.ADMIN.ANALYTICS}
              element={<AnalyticsReportsPage />}
            />
          </Route>
        </Route>
      </Route>

      {/* ---------- Fallbacks ---------- */}
      <Route path="/home" element={<Navigate to={ROUTES.HOME} replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default AppRouter;