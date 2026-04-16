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

const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const nodesDir = path.join(__dirname, "../../nodes");
const registryPath = path.join(__dirname, "registry.ts");

function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Discover all node directories that have both config.json and index.ts
const nodeDirs = fs
  .readdirSync(nodesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => {
    const hasConfig = fs.existsSync(path.join(nodesDir, d.name, "config.json"));
    const hasIndex = fs.existsSync(path.join(nodesDir, d.name, "index.ts"));
    if (hasConfig && !hasIndex) console.warn(`⚠ ${d.name}: has config.json but no index.ts — skipping`);
    if (!hasConfig && hasIndex) console.warn(`⚠ ${d.name}: has index.ts but no config.json — skipping`);
    return hasConfig && hasIndex;
  })
  .map((d) => d.name)
  .sort();

console.log(`Found ${nodeDirs.length} nodes: ${nodeDirs.join(", ")}`);

// Build handler import lines and config require lines
const handlerImports: string[] = [];
const configRequires: string[] = [];
const registerCalls: string[] = [];

for (const dir of nodeDirs) {
  const varName = toCamelCase(dir);
  handlerImports.push(`import ${varName}Handler from "../../nodes/${dir}/index.js";`);
  configRequires.push(`const ${varName}Config = require("../../nodes/${dir}/config.json") as NodeConfig;`);
  registerCalls.push(`register(${varName}Config, ${varName}Handler);`);
}

// Read current registry.ts and patch between markers
let source = fs.readFileSync(registryPath, "utf-8");

// Patch handler imports between __REGISTRY_START__ / __REGISTRY_END__
const startMarker = "// __REGISTRY_START__";
const endMarker = "// __REGISTRY_END__";
const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not find __REGISTRY_START__ / __REGISTRY_END__ markers in registry.ts");
  process.exit(1);
}

source =
  source.slice(0, startIdx + startMarker.length) +
  "\n" +
  handlerImports.join("\n") +
  "\n" +
  source.slice(endIdx);

// Patch config requires between __CONFIGS_START__ / __CONFIGS_END__
const cfgStart = "// __CONFIGS_START__";
const cfgEnd = "// __CONFIGS_END__";
const cfgStartIdx = source.indexOf(cfgStart);
const cfgEndIdx = source.indexOf(cfgEnd);

if (cfgStartIdx === -1 || cfgEndIdx === -1) {
  console.error("Could not find __CONFIGS_START__ / __CONFIGS_END__ markers in registry.ts");
  process.exit(1);
}

source =
  source.slice(0, cfgStartIdx + cfgStart.length) +
  "\n" +
  configRequires.join("\n") +
  "\n" +
  source.slice(cfgEndIdx);

// Patch register calls between __REGISTER_START__ / __REGISTER_END__
const regStart = "// __REGISTER_START__";
const regEnd = "// __REGISTER_END__";
const regStartIdx = source.indexOf(regStart);
const regEndIdx = source.indexOf(regEnd);

if (regStartIdx === -1 || regEndIdx === -1) {
  console.error("Could not find __REGISTER_START__ / __REGISTER_END__ markers in registry.ts");
  process.exit(1);
}

source =
  source.slice(0, regStartIdx + regStart.length) +
  "\n" +
  registerCalls.join("\n") +
  "\n" +
  source.slice(regEndIdx);

fs.writeFileSync(registryPath, source, "utf-8");
console.log(`✓ Updated registry.ts with ${nodeDirs.length} nodes`);
