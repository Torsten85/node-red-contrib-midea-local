/**
 * Development build script for node-red-contrib-midea-local.
 *
 * Watches src/ for changes, compiles TypeScript, and copies HTML files.
 * Usage: bun run scripts/dev.ts
 *
 * @module
 */

import { watch } from "node:fs";
import { cp } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname!, "..");
const SRC_NODES = join(ROOT, "src", "nodes");
const DIST_NODES = join(ROOT, "dist", "nodes");

async function build(): Promise<void> {
  const start = performance.now();

  // Build TypeScript files
  const result = Bun.spawnSync({
    cmd: [
      "bun", "build",
      join(SRC_NODES, "midea-device.ts"),
      join(SRC_NODES, "midea-in.ts"),
      join(SRC_NODES, "midea-out.ts"),
      "--outdir", DIST_NODES,
      "--target", "node",
      "--format", "cjs",
      "--external", "node:*",
      "--external", "midea-local",
    ],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    console.error("Build failed!");
    return;
  }

  // Copy HTML files
  const glob = new Bun.Glob("*.html");
  for await (const file of glob.scan(SRC_NODES)) {
    await cp(join(SRC_NODES, file), join(DIST_NODES, file));
  }

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`✓ Build complete in ${elapsed}ms`);
}

// Initial build
await build();

// Watch for changes
console.log("Watching src/ for changes...\n");

watch(join(ROOT, "src"), { recursive: true }, (_event, filename) => {
  if (!filename) return;
  console.log(`\nChanged: ${filename}`);
  build();
});
