#!/usr/bin/env node
/**
 * JobFlow AI Extension — Icon Generator
 *
 * Generates icon16.png, icon48.png, icon128.png from icons/icon.svg.
 *
 * Prerequisites (run once in this folder):
 *   npm install sharp
 *
 * Usage:
 *   node generate-icons.js
 *
 * Note: run with --input-type=commonjs if your project root has "type":"module":
 *   node --input-type=commonjs generate-icons.js
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.error("❌  'sharp' not installed. Run: npm install sharp");
    process.exit(1);
  }

  const svg = readFileSync(join(__dirname, "icons", "icon.svg"));
  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const out = join(__dirname, "icons", `icon${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log(`✅  icons/icon${size}.png`);
  }

  console.log("\nIcons generated. Load the extension in Chrome:");
  console.log("  1. Open chrome://extensions");
  console.log("  2. Enable Developer Mode");
  console.log("  3. Click 'Load unpacked' → select this Chrome Extension folder");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
