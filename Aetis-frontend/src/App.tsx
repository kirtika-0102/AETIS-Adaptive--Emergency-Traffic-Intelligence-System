import { Suspense } from "react";

import AppRouter from "./routes/AppRouter";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ErrorBoundary from "./components/common/ErrorBoundary";
import Loader from "./components/common/Loader";

/**
 * Root component for AETIS.
 *
 * Provider order matters:
 *  1. ThemeProvider  - design tokens / palette available everywhere
 *  2. AuthProvider   - user session, role, JWT (connects to Auth Service later)
 *  3. SocketProvider - live GPS, signal status and alerts; depends on auth token
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <Suspense fallback={<Loader fullScreen />}>
              <AppRouter />
            </Suspense>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;