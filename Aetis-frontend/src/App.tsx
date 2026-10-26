import { Suspense } from "react";

import ErrorBoundary from "./components/common/ErrorBoundary";
import Loader from "./components/common/Loader";
import { ToastProvider } from "./components/common/Toast";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppRouter from "./routes/AppRouter";

/**
 * Order matters:
 *  1. ThemeProvider  - design tokens
 *  2. ToastProvider  - useToast() for any page below
 *  3. AuthProvider   - startup session check and 401 handling
 *  4. SocketProvider - live connection, only while someone is signed in
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              <Suspense fallback={<Loader fullScreen />}>
                <AppRouter />
              </Suspense>
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;