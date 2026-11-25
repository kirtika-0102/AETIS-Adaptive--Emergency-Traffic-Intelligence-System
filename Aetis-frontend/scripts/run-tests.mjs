import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outFile = path.join(root, ".test-bundle.mjs");

await build({
  entryPoints: [path.join(root, "tests/frontendContracts.test.ts")],
  outfile: outFile,
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22",
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_USE_MOCK_DATA": '"false"',
    "import.meta.env.VITE_API_BASE_URL": '"/api/v1"',
    "import.meta.env.VITE_WS_URL": '"/ws"',
  },
});

const result = spawnSync(process.execPath, ["--test", outFile], {
  stdio: "inherit",
});
fs.rmSync(outFile, { force: true });
process.exit(result.status ?? 1);
