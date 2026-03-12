#!/usr/bin/env node
import { execFileSync, spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "index.ts");

// Check if Bun is available
function hasBun() {
  try {
    execFileSync("bun", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hasBun()) {
  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │   termicord requires Bun to run.                        │
  │                                                         │
  │   Install it with:                                      │
  │     npm install -g bun                                  │
  │   or:                                                   │
  │     curl -fsSL https://bun.sh/install | bash            │
  │                                                         │
  │   Then re-run:  npx termicord                           │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
`);
  process.exit(1);
}

const result = spawnSync("bun", ["run", entry], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
