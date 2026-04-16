/**
 * Shared types for the Edge Nodes MCP platform.
 *
 * Every node implements NodeConfig (declared in config.json) and exports
 * a handler matching NodeHandler. The MCP server uses these types to
 * auto-register tools and execute workflows.
 */

// ── Node Config (lives in each node's config.json) ──────────────────────────

export interface NodeCredentialField {
  /** Environment variable name (e.g. "TWILIO_ACCOUNT_SID") */
  envVar: string;
  /** Human-readable label */
  label: string;
  /** Whether this credential is required for the node to function */
  required: boolean;
  /** Brief description shown to the user */
  description?: string;
}

export interface NodeInputField {
  name: string;
  type: "string" | "number" | "boolean" | "json" | "array";
  required: boolean;
  description: string;
  default?: unknown;
}

export interface NodeOutputField {
  name: string;
  type: "string" | "number" | "boolean" | "json" | "array";
  description: string;
}

export interface NodeConfig {
  /** Unique node identifier (matches folder name) */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** What this node does */
  description: string;
  /** Category for grouping (e.g. "Communication", "Data", "AI", "Utility") */
  category: string;
  /** Emoji or icon identifier */
  icon: string;
  /** Semantic version */
  version: string;
  /** Input parameters the node accepts */
  inputs: NodeInputField[];
  /** Output fields the node returns */
  outputs: NodeOutputField[];
  /** Credentials / env vars this node needs */
  credentials: NodeCredentialField[];
  /** Optional tags for discovery */
  tags?: string[];
}

// ── Node Execution ──────────────────────────────────────────────────────────

/** Standardized input passed to every node handler */
export interface NodeExecutionInput {
  /** The input fields for this specific execution */
  input: Record<string, unknown>;
  /** Resolved credentials (env var values) */
  credentials: Record<string, string>;
  /** Output from the previous node in a workflow (if any) */
  previous?: Record<string, unknown>;
}

/** Standardized output every node handler must return */
export interface NodeExecutionOutput {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** The function signature every node's index.ts must export as default */
export type NodeHandler = (ctx: NodeExecutionInput) => Promise<NodeExecutionOutput>;

// ── Workflow Types ──────────────────────────────────────────────────────────

export interface WorkflowStep {
  /** Unique step ID within the workflow */
  id: string;
  /** Which node to execute (matches NodeConfig.name) */
  node: string;
  /** Static input values for this step */
  input: Record<string, unknown>;
  /** Map of input field name → "{{steps.stepId.fieldName}}" template refs */
  inputMappings?: Record<string, string>;
  /** Optional condition: only run if this JS expression evaluates truthy */
  condition?: string;
}

export interface Workflow {
  /** Unique workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this workflow does */
  description: string;
  /** Ordered list of steps (executed sequentially; branches via condition) */
  steps: WorkflowStep[];
  /** Credentials needed across all steps (node name → env var → value) */
  credentials?: Record<string, string>;
  /** When this workflow was created */
  createdAt: string;
}

// ── Registry Entry (built at import time) ───────────────────────────────────

export interface RegisteredNode {
  config: NodeConfig;
  handler: NodeHandler;
}
