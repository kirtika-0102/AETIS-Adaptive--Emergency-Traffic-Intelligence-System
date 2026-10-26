import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_DEV_PROXY_TARGET || "http://localhost:8080";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Only used when VITE_USE_MOCK_DATA is not true
      proxy: {
        "/api": { target: backend, changeOrigin: true },
        "/ws": { target: backend, changeOrigin: true, ws: true },
      },
    },
    build: { sourcemap: false },
  };
});