/**
 * Auto-generates the static import block in registry.ts.
 *
 * Run: npm run generate-registry
 *
 * Scans nodes/*/config.json, builds import statements and register() calls,
 * then patches registry.ts between the __REGISTRY_START__ / __REGISTRY_END__
 * markers. This keeps Edge-compatible static imports while making it dead
 * simple to add a new node (just create the folder, then run this).
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodesDir = join(__dirname, "../../nodes");
const registryPath = join(__dirname, "registry.ts");

function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// Discover all node directories that have both config.json and index.ts
const nodeDirs = readdirSync(nodesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => {
    const hasConfig = existsSync(join(nodesDir, d.name, "config.json"));
    const hasIndex = existsSync(join(nodesDir, d.name, "index.ts"));
    if (hasConfig && !hasIndex) console.warn(`⚠ ${d.name}: has config.json but no index.ts — skipping`);
    if (!hasConfig && hasIndex) console.warn(`⚠ ${d.name}: has index.ts but no config.json — skipping`);
    return hasConfig && hasIndex;
  })
  .map((d) => d.name)
  .sort();

console.log(`Found ${nodeDirs.length} nodes: ${nodeDirs.join(", ")}`);

// Build import lines
const imports: string[] = [];
const registers: string[] = [];

for (const dir of nodeDirs) {
  const varName = toCamelCase(dir);
  imports.push(`import ${varName}Config from "../../nodes/${dir}/config.json" with { type: "json" };`);
  imports.push(`import { default as ${varName}Handler } from "../../nodes/${dir}/index.js";`);
  registers.push(`register(${varName}Config as NodeConfig, ${varName}Handler);`);
}

const importBlock = imports.join("\n");
const registerBlock = registers.join("\n");

// Read current registry.ts and patch between markers
let source = readFileSync(registryPath, "utf-8");

const startMarker = "// __REGISTRY_START__";
const endMarker = "// __REGISTRY_END__";
const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not find __REGISTRY_START__ / __REGISTRY_END__ markers in registry.ts");
  process.exit(1);
}

const before = source.slice(0, startIdx + startMarker.length);
const after = source.slice(endIdx);

source = `${before}\n${importBlock}\n${after}`;

// Now patch the register() calls — find the block after "Register all imported nodes"
const registerMarker = "// Register all imported nodes";
const registerIdx = source.indexOf(registerMarker);
if (registerIdx === -1) {
  console.error("Could not find register marker in registry.ts");
  process.exit(1);
}

// Find the next blank line or "// ──" section divider after register calls
const afterRegister = source.slice(registerIdx + registerMarker.length);
const nextSectionMatch = afterRegister.match(/\n\n\/\/ ──/);
const nextSectionIdx = nextSectionMatch?.index ?? afterRegister.length;

const beforeRegisters = source.slice(0, registerIdx + registerMarker.length);
const afterRegisters = source.slice(registerIdx + registerMarker.length + nextSectionIdx);

source = `${beforeRegisters}\n${registerBlock}\n${afterRegisters}`;

writeFileSync(registryPath, source, "utf-8");
console.log(`✓ Updated registry.ts with ${nodeDirs.length} nodes`);
