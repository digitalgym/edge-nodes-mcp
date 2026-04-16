# Edge Nodes MCP

An MCP server where every automation node is a standalone Vercel Edge Function.
Claude discovers nodes, wires them into workflows, and executes them — no UI, no drag-and-drop, just natural language.

**n8n nodes as edge functions. Claude as the workflow engine.**

---

## How It Works

```
You tell Claude what you want
        |
        v
  MCP Server (5 tools)
  |-- list_nodes          "what can I use?"
  |-- get_node_config     "what does this node need?"
  |-- execute_node        "run this one node"
  |-- build_workflow      "chain these nodes together"
  |-- run_workflow        "execute the whole chain"
        |
        v
  Node Registry (auto-discovers nodes/*/)
  |-- http-request          Make any HTTP/API call
  |-- twilio-sms            Send SMS via Twilio
  |-- google-places-lookup  Verify AU addresses via Google Places
  |-- grok-prompt           Send prompts to xAI Grok
  |-- slack-post            Post messages to Slack
  |-- discord-send          Send to Discord (webhook or bot)
  |-- supabase-query        Database CRUD via Supabase REST
  |-- webhook-trigger       Receive and parse incoming webhooks
```

Each node is a folder with two files: a `config.json` (schema) and an `index.ts` (handler).
The MCP server auto-discovers them all.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ (v22 recommended)
- [Vercel CLI](https://vercel.com/docs/cli) (for deployment)
- [Docker](https://www.docker.com/) (optional, for containerised stdio transport)
- A Vercel account (for edge deployment)

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url> edge-nodes-mcp
cd edge-nodes-mcp
npm install
```

### 2. Add your credentials

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the keys for the nodes you want to use.
You don't need all of them — only the ones relevant to your workflows.

```env
# Required for twilio-sms node
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+614...

# Required for grok-prompt node
XAI_API_KEY=xai-...

# Required for google-places-lookup node
GOOGLE_API_KEY=AIza...

# Required for slack-post node
SLACK_BOT_TOKEN=xoxb-...

# Required for supabase-query node
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### 3. Verify it works

```bash
# Type-check
npm run build

# Run the MCP server locally (stdio mode)
npx tsx mcp/src/stdio.ts
```

If you see `Edge Nodes MCP server running on stdio` on stderr, you're good.

---

## Connecting to Claude

There are three ways to connect this MCP server to Claude, depending on your setup.

### Option A: Local stdio (simplest for development)

Add to your Claude config file:

**Claude Desktop:** `~/AppData/Roaming/Claude/claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac)

**Cursor:** `.cursor/mcp.json` in your project root

**Claude Code:** `.mcp.json` in your project root

```json
{
  "mcpServers": {
    "edge-nodes": {
      "command": "npx",
      "args": ["tsx", "mcp/src/stdio.ts"],
      "cwd": "D:/Documents/edge-nodes-mcp",
      "env": {
        "TWILIO_ACCOUNT_SID": "your-sid",
        "TWILIO_AUTH_TOKEN": "your-token",
        "TWILIO_FROM_NUMBER": "+614..."
      }
    }
  }
}
```

> **Note:** You can either put credentials in the `env` block above, or rely on
> a `.env.local` file in the project root — the stdio transport reads
> `process.env` at runtime.

### Option B: Docker stdio

Build once, run anywhere. No Node.js required on the host.

```bash
docker build -t edge-nodes-mcp .
```

Then in your Claude config:

```json
{
  "mcpServers": {
    "edge-nodes": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--env-file", "D:/Documents/edge-nodes-mcp/.env.local",
        "edge-nodes-mcp"
      ]
    }
  }
}
```

### Option C: Remote via Vercel (SSE)

Deploy to Vercel, then connect via URL. No local process needed.

```bash
./deploy.sh
# or: npx vercel --prod
```

Set your credentials on Vercel:

```bash
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN
# ... etc
```

Then in your Claude config:

```json
{
  "mcpServers": {
    "edge-nodes": {
      "url": "https://your-project.vercel.app/api/mcp/sse"
    }
  }
}
```

---

## Using It

Once connected, just talk to Claude naturally. It has five tools available:

### Discover what's available

> "What nodes do I have?"

Claude calls `list_nodes` and shows you all registered nodes with their descriptions.

### Check what a node needs

> "What inputs does the twilio-sms node need?"

Claude calls `get_node_config` and shows you the full schema — required inputs,
optional inputs, credentials, and outputs.

### Run a single node

> "Send an SMS to +61400000000 saying 'Job confirmed for tomorrow 9am'"

Claude calls `execute_node` with `twilio-sms`, filling in the `to` and `body` inputs.

### Build a multi-step workflow

> "Fetch the weather for Brisbane from the BOM API, then post it to Slack #daily-updates"

Claude calls `build_workflow` to create a two-step workflow JSON:
1. `http-request` to fetch weather data
2. `slack-post` to send it, using `{{steps.fetch.data.body}}` to reference step 1's output

### Execute a workflow

> "Run that workflow"

Claude calls `run_workflow`, which executes each step in sequence. Each step can
reference previous step outputs via template syntax:

```
{{steps.<stepId>.data.<field>}}
```

---

## Workflow Example

Here's what a built workflow JSON looks like:

```json
{
  "id": "wf_1713250000000",
  "name": "Weather to Slack",
  "description": "Fetch Brisbane weather and post to Slack",
  "steps": [
    {
      "id": "fetch",
      "node": "http-request",
      "input": {
        "url": "https://api.weatherapi.com/v1/current.json?key=xxx&q=Brisbane",
        "method": "GET"
      }
    },
    {
      "id": "notify",
      "node": "slack-post",
      "input": {
        "channel": "#daily-updates"
      },
      "inputMappings": {
        "text": "{{steps.fetch.data.body.current.condition.text}} in Brisbane, {{steps.fetch.data.body.current.temp_c}}C"
      }
    }
  ],
  "createdAt": "2025-04-16T02:00:00.000Z"
}
```

`inputMappings` lets any step reference any previous step's output data. The
workflow engine resolves these templates at runtime before passing input to each node.

---

## Direct Node Execution (REST API)

Every node is also callable as a standalone HTTP endpoint when deployed to Vercel:

```bash
# Execute a node directly
curl -X POST https://your-project.vercel.app/api/node?name=http-request \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "url": "https://httpbin.org/get",
      "method": "GET"
    }
  }'
```

```bash
# With credentials
curl -X POST https://your-project.vercel.app/api/node?name=twilio-sms \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "to": "+61400000000",
      "body": "Test message"
    },
    "credentials": {
      "TWILIO_ACCOUNT_SID": "AC...",
      "TWILIO_AUTH_TOKEN": "...",
      "TWILIO_FROM_NUMBER": "+614..."
    }
  }'
```

Credentials in the request body override environment variables. If you've set them
in Vercel env vars already, you can omit the credentials block.

This is useful for:
- Calling nodes from external webhooks (Vapi, Twilio, etc.)
- Testing nodes independently
- Building custom frontends

---

## Adding a New Node

Drop a folder into `nodes/`, run one command, done.

### 1. Create the folder

```
nodes/my-new-node/
  config.json
  index.ts
```

### 2. Define the schema (`config.json`)

```json
{
  "name": "my-new-node",
  "displayName": "My New Node",
  "description": "One-line description of what it does",
  "category": "Utility",
  "icon": "wrench",
  "version": "1.0.0",
  "inputs": [
    {
      "name": "message",
      "type": "string",
      "required": true,
      "description": "The message to process"
    },
    {
      "name": "format",
      "type": "string",
      "required": false,
      "description": "Output format",
      "default": "text"
    }
  ],
  "outputs": [
    {
      "name": "result",
      "type": "string",
      "description": "The processed output"
    }
  ],
  "credentials": [
    {
      "envVar": "MY_SERVICE_API_KEY",
      "label": "My Service API Key",
      "required": true,
      "description": "API key from https://myservice.com/settings"
    }
  ],
  "tags": ["custom", "utility"]
}
```

**Field reference:**
| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique ID, matches folder name |
| `displayName` | Yes | Human-readable name |
| `description` | Yes | What the node does (shown in `list_nodes`) |
| `category` | Yes | Grouping: `Utility`, `Communication`, `Data`, `AI`, `Trigger` |
| `icon` | Yes | Emoji or icon name |
| `version` | Yes | Semver |
| `inputs` | Yes | Array of input field definitions |
| `outputs` | Yes | Array of output field definitions |
| `credentials` | Yes | Array of required env vars (can be empty `[]`) |
| `tags` | No | Array of strings for search/filtering |

### 3. Implement the handler (`index.ts`)

```typescript
import type { NodeHandler } from "../../mcp/src/types.js";

const handler: NodeHandler = async ({ input, credentials, previous }) => {
  // 1. Read inputs (type-assert from unknown)
  const message = input.message as string;
  const format = (input.format as string) || "text";

  // 2. Read credentials
  const apiKey = credentials.MY_SERVICE_API_KEY;

  // 3. Validate
  if (!message) {
    return { success: false, error: "'message' is required" };
  }

  // 4. Do your thing
  try {
    const res = await fetch("https://api.myservice.com/process", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, format }),
    });

    if (!res.ok) {
      return { success: false, error: `API error: ${res.status}` };
    }

    const data = await res.json();

    // 5. Return standardised output
    return {
      success: true,
      data: { result: data.output },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
};

export default handler;
```

**Every handler receives:**
| Field | Type | Description |
|-------|------|-------------|
| `input` | `Record<string, unknown>` | The input fields for this execution |
| `credentials` | `Record<string, string>` | Resolved credential values (env var name -> value) |
| `previous` | `Record<string, unknown>` (optional) | Output data from the previous workflow step |

**Every handler returns:**
| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether the node executed successfully |
| `data` | `Record<string, unknown>` (optional) | Output data (referenced by downstream steps) |
| `error` | `string` (optional) | Error message if `success: false` |

### 4. Register it

```bash
npm run generate-registry
```

This scans `nodes/*/` and updates the static imports in `mcp/src/registry.ts`.
The node is immediately available in the MCP server.

### 5. Deploy

```bash
./deploy.sh
```

---

## Included Nodes

### http-request
| | |
|---|---|
| **Category** | Utility |
| **Credentials** | None |
| **Inputs** | `url` (required), `method`, `headers`, `body`, `timeout` |
| **Outputs** | `status`, `headers`, `body`, `ok` |

Generic HTTP client. Supports GET, POST, PUT, PATCH, DELETE with custom headers, JSON body, and configurable timeout.

### twilio-sms
| | |
|---|---|
| **Category** | Communication |
| **Credentials** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| **Inputs** | `to` (required), `body` (required), `from` |
| **Outputs** | `sid`, `status`, `to` |

Send SMS via Twilio REST API. Auto-normalises Australian phone numbers (04XX -> +61...).

### google-places-lookup
| | |
|---|---|
| **Category** | Data |
| **Credentials** | `GOOGLE_API_KEY` |
| **Inputs** | `address` (required), `country` (default: `au`) |
| **Outputs** | `matched`, `formattedAddress`, `streetNumber`, `street`, `suburb`, `state`, `postcode`, `alternatives` |

Verify and autocomplete addresses using Google Places API. Returns structured components. Restricted to AU by default.

### grok-prompt
| | |
|---|---|
| **Category** | AI |
| **Credentials** | `XAI_API_KEY` |
| **Inputs** | `prompt` (required), `system`, `model`, `jsonMode`, `temperature`, `maxTokens` |
| **Outputs** | `content`, `parsed`, `model`, `usage` |

Send prompts to xAI's Grok. Supports system prompts, JSON mode (forces structured output), and temperature control.

### slack-post
| | |
|---|---|
| **Category** | Communication |
| **Credentials** | `SLACK_BOT_TOKEN` |
| **Inputs** | `channel` (required), `text` (required), `threadTs`, `username`, `iconEmoji` |
| **Outputs** | `ts`, `channel` |

Post messages to Slack channels. Supports markdown, threading, and bot identity overrides.

### discord-send
| | |
|---|---|
| **Category** | Communication |
| **Credentials** | `DISCORD_BOT_TOKEN` (optional, only for bot API mode) |
| **Inputs** | `webhookUrl` or `channelId` (one required), `content` (required), `username`, `embeds` |
| **Outputs** | `id`, `sent` |

Send to Discord via webhook URL (no auth needed) or Bot API (needs token). Supports embeds.

### supabase-query
| | |
|---|---|
| **Category** | Data |
| **Credentials** | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| **Inputs** | `table` (required), `operation`, `data`, `filters`, `select`, `limit`, `order` |
| **Outputs** | `rows`, `count` |

Full CRUD against any Supabase table via PostgREST. Supports select, insert, update, upsert, and delete. Safety: update and delete require filters (prevents accidental full-table operations).

### webhook-trigger
| | |
|---|---|
| **Category** | Trigger |
| **Credentials** | None |
| **Inputs** | `payload` (required), `headers`, `extract`, `secret` |
| **Outputs** | `payload`, `extracted`, `verified` |

Receive and parse incoming webhook payloads. Supports secret verification and dot-notation extraction (`data.customer.email`). Use as step 1 in a workflow that processes external events.

---

## Credentials

Credentials are resolved in priority order:

1. **Per-call override** — passed in the `credentials` parameter when calling `execute_node` or `run_workflow`
2. **Vercel environment variables** — set via `vercel env add` (production deploys)
3. **`.env.local` file** — for local development and Docker

Each node's `config.json` declares exactly which credentials it needs. When you
`build_workflow`, the MCP server warns you about any missing credentials before execution.

---

## Project Structure

```
edge-nodes-mcp/
|
|-- api/                              Vercel API routes
|   |-- mcp/[transport]/route.ts      MCP server (SSE + Streamable HTTP)
|   |-- node/route.ts                 Direct node execution endpoint
|
|-- mcp/src/                          MCP control plane
|   |-- server.ts                     Tool registration (5 MCP tools)
|   |-- registry.ts                   Node auto-discovery via static imports
|   |-- workflow-engine.ts            Step-by-step executor with template resolution
|   |-- types.ts                      Shared types (NodeConfig, NodeHandler, Workflow)
|   |-- stdio.ts                      Docker / CLI entry point
|   |-- generate-registry.ts          Regenerate registry after adding nodes
|
|-- nodes/                            One folder per node
|   |-- <node-name>/
|       |-- config.json               Schema: inputs, outputs, credentials
|       |-- index.ts                  Handler: receives input, returns output
|
|-- workflows/                        Saved workflow JSONs (optional)
|-- Dockerfile                        Docker image for stdio transport
|-- deploy.sh                         One-click Vercel deploy
|-- vercel.json                       Vercel routing and function config
|-- tsconfig.json
|-- package.json
```

---

## Deployment

### Vercel (recommended)

```bash
# First time: link to your Vercel project
npx vercel link

# Set credentials
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN
vercel env add TWILIO_FROM_NUMBER
# ... add whatever your nodes need

# Deploy
./deploy.sh

# Or for preview deploys
./deploy.sh --preview
```

The deploy script runs type-checking, regenerates the registry, and deploys.

### Docker

```bash
docker build -t edge-nodes-mcp .
docker run -i --env-file .env.local edge-nodes-mcp
```

The Docker image uses `tsx` to run TypeScript directly (no build step needed).

---

## Development

```bash
# Type-check
npm run build

# Run locally (stdio)
npx tsx mcp/src/stdio.ts

# Regenerate registry after adding/removing nodes
npm run generate-registry

# Run via Vercel dev server (for testing the HTTP routes)
npm run dev
```

---

## FAQ

**Can I use this without Vercel?**
Yes. The stdio transport (`npx tsx mcp/src/stdio.ts` or Docker) works anywhere.
Vercel is only needed if you want the remote SSE endpoint or the direct REST API.

**Can I use OpenAI instead of Grok?**
The `grok-prompt` node talks to xAI's API. To use OpenAI, add an `openai-prompt` node
(same pattern, different base URL and auth header). Or use `http-request` to call any API directly.

**How do workflows pass data between steps?**
Via `inputMappings`. Any step input can reference a previous step's output using
`{{steps.<stepId>.data.<fieldName>}}`. The workflow engine resolves these before
executing each step.

**Can steps run conditionally?**
Yes. Add a `condition` field to any step. It's evaluated as a JavaScript expression
with access to previous step outputs via the same template syntax. The step only
runs if the condition is truthy.

**What if a step fails?**
The workflow stops immediately and returns the error along with all completed step
results. No subsequent steps are executed.
