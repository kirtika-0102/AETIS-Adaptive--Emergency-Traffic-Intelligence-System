/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the AETIS backend REST API, e.g. http://localhost:8080/api */
  readonly VITE_API_BASE_URL: string;

  /** WebSocket endpoint for live tracking and signal updates, e.g. ws://localhost:8080/ws */
  readonly VITE_WS_URL: string;

  /** API key for the map / routing provider */
  readonly VITE_MAP_API_KEY: string;

  /** Default map center latitude and longitude */
  readonly VITE_MAP_DEFAULT_LAT: string;
  readonly VITE_MAP_DEFAULT_LNG: string;

  /** Toggle mock data while the backend is not connected ("true" | "false") */
  readonly VITE_USE_MOCK_DATA: string;

  /** App environment label */
  readonly VITE_APP_ENV: "development" | "staging" | "production";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}