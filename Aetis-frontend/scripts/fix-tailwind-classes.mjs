// Run once from the project root:  npm run fix:classes
//
// Fixes class names used in earlier files that Tailwind v3 can misread:
//  - font-[var(--font-display)]  can be read as a font WEIGHT, not a font family
//  - shadow-[var(--shadow-md)]   can be read as a shadow COLOUR, so no shadow is drawn
//  - bg-[var(--x)]/60            opacity cannot be applied to a CSS variable,
//                                so the modal and drawer backdrops were see-through
// It is safe to run again: it only touches the old forms.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const RULES = [
  [/font-\[var\(--font-(display|mono|sans)\)\]/g, "font-[family-name:var(--font-$1)]"],
  [/shadow-\[var\(--(shadow-[a-z0-9-]+)\)\]/g, "shadow-[shadow:var(--$1)]"],
  [/bg-\[var\(--color-teal-900\)\]\/60/g, "bg-[rgba(4,24,34,0.6)]"],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if ([".ts", ".tsx"].includes(extname(full))) yield full;
  }
}

let changed = 0;

for (const file of walk(ROOT)) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [pattern, replacement] of RULES) after = after.replace(pattern, replacement);

  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
    console.log("updated", file.slice(ROOT.length + 1));
  }
}

console.log(changed === 0 ? "Nothing to change." : `Done. ${changed} file(s) updated.`);