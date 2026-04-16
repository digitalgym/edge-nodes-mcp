/**
 * Workflow Engine — executes a workflow step-by-step.
 *
 * Resolves input mappings between steps (e.g. "{{steps.step1.data.url}}"),
 * evaluates conditions, and passes output from one step to the next.
 */

import { getNode } from "./registry";
import type { Workflow, WorkflowStep, NodeExecutionOutput } from "./types";

export interface StepResult {
  stepId: string;
  node: string;
  output: NodeExecutionOutput;
  durationMs: number;
  skipped?: boolean;
}

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  steps: StepResult[];
  totalDurationMs: number;
  error?: string;
}

/**
 * Resolve template strings like "{{steps.fetch.data.body}}" against
 * accumulated step results.
 */
function resolveTemplate(template: string, stepResults: Map<string, NodeExecutionOutput>): unknown {
  // If the entire value is a single template ref, return the raw value (preserves types)
  const fullMatch = template.match(/^\{\{steps\.(\w+)\.(.+)\}\}$/);
  if (fullMatch) {
    const [, stepId, path] = fullMatch;
    const result = stepResults.get(stepId);
    if (!result) return template;
    return resolvePath(result as unknown, path);
  }

  // Otherwise do string interpolation for embedded refs
  return template.replace(/\{\{steps\.(\w+)\.(.+?)\}\}/g, (match, stepId, path) => {
    const result = stepResults.get(stepId as string);
    if (!result) return match;
    const val = resolvePath(result as unknown, path as string);
    return val === undefined ? match : String(val);
  });
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Resolve all inputs for a step, applying inputMappings over static input values.
 */
function resolveStepInput(
  step: WorkflowStep,
  stepResults: Map<string, NodeExecutionOutput>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...step.input };

  if (step.inputMappings) {
    for (const [field, template] of Object.entries(step.inputMappings)) {
      resolved[field] = resolveTemplate(template, stepResults);
    }
  }

  return resolved;
}

/**
 * Evaluate a condition string against step results.
 * Simple expression evaluator — supports basic comparisons.
 */
function evaluateCondition(
  condition: string,
  stepResults: Map<string, NodeExecutionOutput>
): boolean {
  // Replace template refs with actual values
  const resolved = condition.replace(/\{\{steps\.(\w+)\.(.+?)\}\}/g, (match, stepId, path) => {
    const result = stepResults.get(stepId as string);
    if (!result) return "undefined";
    const val = resolvePath(result as unknown, path as string);
    return JSON.stringify(val);
  });

  try {
    // Safe-ish eval for simple boolean expressions
    return Boolean(new Function(`"use strict"; return (${resolved});`)());
  } catch {
    return false;
  }
}

/**
 * Resolve credentials for a step — pulls from workflow-level credentials
 * or falls back to environment variables.
 */
function resolveCredentials(
  step: WorkflowStep,
  workflow: Workflow
): Record<string, string> {
  const node = getNode(step.node);
  if (!node) return {};

  const creds: Record<string, string> = {};
  for (const credField of node.config.credentials) {
    // Check workflow-level credential overrides first
    const workflowValue = workflow.credentials?.[credField.envVar];
    if (workflowValue) {
      creds[credField.envVar] = workflowValue;
    } else {
      // Fall back to environment variable
      const envValue = typeof process !== "undefined" ? process.env[credField.envVar] : undefined;
      if (envValue) {
        creds[credField.envVar] = envValue;
      }
    }
  }

  return creds;
}

/**
 * Execute a full workflow.
 */
export async function executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
  const startTime = Date.now();
  const stepResults = new Map<string, NodeExecutionOutput>();
  const results: StepResult[] = [];

  for (const step of workflow.steps) {
    const stepStart = Date.now();

    // Check condition
    if (step.condition) {
      const shouldRun = evaluateCondition(step.condition, stepResults);
      if (!shouldRun) {
        const skipResult: StepResult = {
          stepId: step.id,
          node: step.node,
          output: { success: true, data: { skipped: true } },
          durationMs: Date.now() - stepStart,
          skipped: true,
        };
        results.push(skipResult);
        stepResults.set(step.id, skipResult.output);
        continue;
      }
    }

    // Resolve the node
    const registered = getNode(step.node);
    if (!registered) {
      const errorResult: StepResult = {
        stepId: step.id,
        node: step.node,
        output: { success: false, error: `Node "${step.node}" not found in registry` },
        durationMs: Date.now() - stepStart,
      };
      results.push(errorResult);
      return {
        workflowId: workflow.id,
        success: false,
        steps: results,
        totalDurationMs: Date.now() - startTime,
        error: `Step "${step.id}" failed: node "${step.node}" not found`,
      };
    }

    // Resolve inputs, credentials, and previous step output
    const input = resolveStepInput(step, stepResults);
    const credentials = resolveCredentials(step, workflow);
    const previousStep = results[results.length - 1];
    const previous = previousStep?.output?.data;

    try {
      const output = await registered.handler({ input, credentials, previous });
      const stepResult: StepResult = {
        stepId: step.id,
        node: step.node,
        output,
        durationMs: Date.now() - stepStart,
      };
      results.push(stepResult);
      stepResults.set(step.id, output);

      // Stop workflow on step failure
      if (!output.success) {
        return {
          workflowId: workflow.id,
          success: false,
          steps: results,
          totalDurationMs: Date.now() - startTime,
          error: `Step "${step.id}" (${step.node}) failed: ${output.error}`,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorResult: StepResult = {
        stepId: step.id,
        node: step.node,
        output: { success: false, error: message },
        durationMs: Date.now() - stepStart,
      };
      results.push(errorResult);
      return {
        workflowId: workflow.id,
        success: false,
        steps: results,
        totalDurationMs: Date.now() - startTime,
        error: `Step "${step.id}" (${step.node}) threw: ${message}`,
      };
    }
  }

  return {
    workflowId: workflow.id,
    success: true,
    steps: results,
    totalDurationMs: Date.now() - startTime,
  };
}
