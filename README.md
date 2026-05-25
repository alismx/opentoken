<div align="center">
  <h1>OpenToken</h1>
  <p><strong>Token-saving companion for OpenCode.</strong> Intercepts, filters, and compresses tool outputs <em>and</em> model responses — before they reach the context window.</p>
  <p>
    <a href="https://github.com/MrGray17/opentoken/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
    <img src="https://img.shields.io/badge/bun-%3E%3D1.2.0-fbb744.svg" alt="Bun >=1.2.0">
    <a href="https://github.com/MrGray17/opentoken/stargazers"><img src="https://img.shields.io/github/stars/MrGray17/opentoken" alt="GitHub Stars"></a>
  </p>
  <p>
    <strong>Input pipeline:</strong> 70–90% savings on tool output tokens — <strong>Output pipeline:</strong> max conciseness with zero risk.
  </p>
</div>

> **🏆 862,301 tokens saved in a single 22-hour session — $25.88. Verified.**

---

## Table of Contents

- [Real Production Numbers](#real-production-numbers)
- [How It Works](#how-it-works)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Output Saving](#output-saving)
- [TUI Status Bar](#tui-status-bar)
- [Safety Guarantees](#safety-guarantees)
- [Diagnostics](#diagnostics)
- [Data Storage](#data-storage)
- [Security](#security)
- [Architecture Reference](#architecture-reference)
- [Development](#development)
- [License](#license)

---

## Real Production Numbers

Data from a single 22-hour session (977 tool calls) with default settings:

| Metric | Value |
|---|---|
| Total input tokens | 1,193,253 |
| Total output tokens | 330,952 |
| **Total saved** | **862,301 tokens** |
| Average savings | **72% per call** |
| Avg saved per call | 884 tokens |

### By Tool

| Tool | Calls | Saved | Avg Savings |
|---|---|---|---|
| `read` | 318 | 624,244 | 99% |
| `bash` | 640 | 218,265 | 41% |
| `grep` | 12 | 10,044 | 84% |
| `glob` | 7 | 9,748 | 75% |

### Real Money Impact

At typical pricing ($5/MTok input, $25/MTok output):

| | Without OpenToken | With OpenToken | Savings |
|---|---|---|---|
| Input cost | $5.97 | $1.65 | $4.32 |
| Output cost | $29.83 | $8.27 | $21.56 |
| **Total cost** | **$35.80** | **$9.92** | **$25.88** |

**~$26 saved per session.** At 100 sessions/day: **$2,600/day → ~$78,000/month**.

---

## How It Works

OpenToken operates as an OpenCode plugin with two independent pipelines:

```
Tool call ──→ [ Input pipeline ] ──→ model sees cleaned output
                                          ↓
Model response ──→ [ Output pipeline ] ──→ trimmed response
```

**Input pipeline** — intercepts every tool output (read, bash, grep, glob) and runs it through 30+ compression stages: secret redaction, binary detection, thinking-block stripping, key aliasing, TOON conversion, minification, LTSC/LZW compression, deduplication, progressive disclosure, and more. Each stage ends with a conservative length guard: if output grew, the original is returned.

**Output pipeline** — caps model response length via `maxOutputTokens`, injects a conciseness directive into the system prompt, and post-processes completed responses to strip thinking blocks, ANSI codes, boilerplate phrases, and shorten URLs. Also applied: LTSC and LZW lossless compression — all under the same 0-risk conservative filter.

---

## Features

### Input Pipeline (tool outputs)
- **Secret redaction** — 33+ patterns compiled into a single alternation regex, runs before any other processing
- **Binary detection** — 64 KB NUL byte scan; extracts UTF-8 text or suppresses entirely
- **Thinking block stripping** — `<antThinking>`, `<thinking>`, `<reasoning>`, `<scratchpad>`, `<inner_monologue>`
- **JSON minification** — lossless whitespace removal from JSON output
- **Key aliasing** — maps 80+ long JSON keys to short aliases (`description` → `desc`)
- **TOON format** — JSON arrays of objects → tabular CSV-like format. 40–50% savings
- **LTSC + LZW compression** — LZ77-style + dictionary compression for repetitive content
- **AST skeleton extraction** — replaces full file reads with structural signatures (functions, classes, imports). ~88% reduction
- **Log noise normalization** — replaces timestamps, PIDs, elapsed times with static placeholders
- **Progressive disclosure** — large outputs offloaded to temp file + summary pointer
- **Family-specific filters** — 8 specialized handlers for git, npm, cargo, test, fs, docker, pip, make
- **Auto-escalation** — ratchets compression intensity as context fills (50% → LEAN, 70% → ULTRA, 85% → CEILING)

### Output Pipeline (model responses)
- **System conciseness directive** — appended to system prompt to encourage brevity
- **Output budget cap** — `maxOutputTokens` set to 4096 by default
- **Response compression** — boilerplate elimination (18 start/end-anchored patterns), thinking block stripping, ANSI stripping, whitespace normalization, URL shortening
- **Lossless token compression** — LTSC + LZW applied to response text
- **Metrics tracking** — per-response token savings recorded when metrics are enabled

### Zero Risk Guarantee
Every transformation ends with a conservative comparison — if the filtered output is longer than or equal to the original, the original is returned untouched. No surprises.

---

## Quick Start

### Requirements

- **Bun** runtime >= 1.2.0
- **OpenCode** with plugin support

### Install via curl (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/refs/heads/main/install.sh | bash
```

Install a specific version:

```bash
OPENTOKEN_VERSION=1.1.0 curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/refs/heads/main/install.sh | bash
```

Verify checksum (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/main/SHA256SUMS | sha256sum -c - --ignore-missing
```

### Manual Install

```bash
git clone https://github.com/MrGray17/opentoken.git ~/.config/opencode/plugins/opentoken
cd ~/.config/opencode/plugins/opentoken
bun install
```

The plugin auto-loads when OpenCode starts. No extra config required.

### Verify It's Working

Run any OpenCode command — you'll see stderr output:

```
[OpenToken] Plugin loading...
[OpenToken] Loaded. Symbol index: true, Metrics: true
```

---

## Configuration

Create `~/.config/opentoken/config.json` (all fields optional):

```json
{
  "maxOutputBytes": 10485760,
  "maxProcessingMs": 5000,
  "enableMetrics": true,
  "enableSymbolIndex": true,
  "enableHistoryCompression": false,
  "enableSessionMemory": false,
  "enableTui": true,
  "tuiUseEmoji": true,
  "enableOutputSaving": true,
  "allowLockFileReads": false,
  "conservativeUseTokens": false
}
```

### Reference

| Field | Default | Description |
|---|---|---|
| `maxOutputBytes` | 10485760 (10 MB) | Hard limit — reject tool outputs larger than this |
| `maxProcessingMs` | 5000 | Timeout per pipeline stage (ms) |
| `safeReadRoot` | Project root | Only allow reads under this directory |
| `enableMetrics` | `true` | Track per-call token savings to disk (JSONL) |
| `enableSymbolIndex` | `true` | Build and query code symbol index at startup |
| `enableHistoryCompression` | `false` | Enable compression for history/memory hooks (opt-in) |
| `historyCompressionWindow` | 12 | Messages to keep full-fidelity when history compression is active |
| `enableSessionMemory` | `false` | Cross-session memory persistence (opt-in) |
| `enableTui` | `true` | Show the TUI clock widget in the prompt area |
| `tuiUseEmoji` | `true` | TUI: use emoji vs ASCII fallback |
| `enableOutputSaving` | `true` | Reduce model response tokens via directives, budget caps, and compression |
| `allowLockFileReads` | `false` | Allow reading lock files despite minified/generated blocking |
| `conservativeUseTokens` | `false` | Use token count (slower) vs byte count (faster) for safety comparison |

---

## Output Saving

When `enableOutputSaving` is `true` (default), OpenToken applies three techniques to reduce model response tokens:

**1. System Directive** — prepends a conciseness instruction to the system prompt:
```
Be concise. Prefer code over explanation. Omit pleasantries, hedging, and restatements.
```

**2. Output Budget** — caps `maxOutputTokens` at 4096 tokens, preventing the model from generating excessively long responses.

**3. Response Compression** — post-processes completed responses through a dedicated pipeline:

| Stage | Description |
|---|---|
| Thinking block strip | Removes `<antThinking>`, `<thinking>`, `<reasoning>` blocks |
| ANSI escape strip | Strips color codes and terminal control sequences |
| Whitespace normalization | Collapses 3+ newlines, strips trailing spaces |
| Boilerplate elimination | 18 start/end-anchored patterns (greetings, closings, restatements, filler transitions) |
| URL shortening | Strips query params and hash from URLs over 100 chars |
| Conservative guard | Returns original if compressed output is longer |

All stages are try/catch wrapped — failures silently fall through with the original text.

---

## TUI Status Bar

When enabled, OpenToken displays a minimal clock widget in the prompt area:

```
14:32
```

The widget updates every second. It replaces the prior stats-heavy display (removed to save tokens on the TUI slot itself).

Disable with `"enableTui": false` in `config.json`. Switch to ASCII-only with `"tuiUseEmoji": false`.

---

## Safety Guarantees

| Rule | Behavior |
|---|---|
| **Short output bypass** | `<80 lines or <2 KB` → pass through unchanged |
| **Conservative comparison** | If filtered output ≥ original size → return original |
| **Secrets-first** | Redacted BEFORE any other processing (33 patterns compiled to single alternation regex) |
| **Binary detection** | NUL byte scan on first 64 KB → suppress or extract text |
| **Graceful degradation** | Every pipeline stage is try/catch wrapped — a single failure never crashes the session |
| **Input validation** | Tool names are whitelisted; file paths validated against project root |
| **Size limits** | 10 MB hard limit on tool output (configurable) |
| **Path traversal protection** | All file paths resolved and checked against the allowed root |

---

## Diagnostics

OpenToken exposes status and error metrics through stderr and files.

### Opentoken Stats

Session-level summary of all metrics to date:

```bash
~/.config/opentoken/stats-summary.json
opentoken stats
```

### Error Log

If `enableMetrics` is on, per-call data is appended to:

```bash
~/.config/opentoken/metrics.jsonl
```

Each line is a JSON object with `ts`, `tool`, `family`, `before_tokens`, `after_tokens`, `saved_pct`, `sessionID`, and `role`.

### Session History

Session memory (if enabled) is stored in:

```bash
~/.config/opentoken/session-memory.json
```

---

## Data Storage

| File | Path | Purpose |
|---|---|---|
| Config | `~/.config/opentoken/config.json` | User settings |
| Metrics | `~/.config/opentoken/metrics.jsonl` | Per-call token savings (rotated at 10 MB, keeps 5) |
| Errors | `~/.config/opentoken/error.jsonl` | Pipeline failures |
| Symbol index | `~/.config/opentoken/symbol-index.json` | Cached code symbol index |
| Session start | `~/.config/opentoken/session-start.json` | Last session ID and start time |
| Memory | `~/.config/opentoken/session-memory.json` | Cross-session memory (opt-in) |
| Rewind store | `~/.config/opentoken/rewind/*.tmp` | Reversible compression offload files |
| Progressive store | `~/.config/opentoken/progressive/*.tmp` | Progressive disclosure offload files |

All files use `0o600` permissions, directories use `0o700`.

---

## Security

- **Secrets redaction** — 33+ patterns including AWS keys, GitHub tokens, OpenAI/Anthropic keys, JWTs, private keys, connection strings, and bearer tokens
- **Secrets run first** — redaction is the very first pipeline stage; no other transformation touches raw output before redaction
- **No exec/eval** — no dynamic code execution of any kind; all pipelines are pure function chains
- **No telemetry** — OpenToken never phones home. All data stays local
- **Safe file handling** — atomic tmp+rename writes, restricted permissions, path traversal protection
- **Graceful failure** — every stage wrapped in try/catch; plugin never breaks the host process

---

## Architecture Reference

```
src/
├── index.ts                 Plugin entry, pipeline orchestration, hook registration
├── outputcomp.ts            Output compression pipeline (boilerplate, whitespace, URL shortening)
├── precall.ts               Pre-call filters: command rewriting, minified file blocking, size caps
├── postcall.ts              Post-call processors: binary detection, JSON minify, key alias, TOON, logs, tables
├── ltsc.ts                  Lossless Token Sequence Compression (LZ77-style)
├── lzw.ts                   LZW token substitution compression
├── folding.ts               Diff + log folding
├── dedup.ts                 Cross-call deduplication
├── autoescalate.ts          Progressive compression as context fills
├── progressive.ts           Summary-first output, full on demand
├── rewind.ts                Reversible compression + semantic abbreviation
├── skeleton.ts              AST skeleton extraction
├── symbolindex.ts           Code symbol index and query
├── toon.ts                  JSON-to-tabular format conversion
├── memory.ts                Session memory persistence
├── router.ts                Content-aware compression router
├── lspfirst.ts              LSP-first enforcement
├── jsonsample.ts            JSON statistical sampling
├── statusline.ts            Session summary builder
├── tui.tsx                  TUI clock widget (Solid.js)
├── session.ts               Session state tracking + memory
│
├── families/
│   ├── detect.ts            Command family detection
│   ├── git.ts               git diff/log/status filters
│   ├── npm.ts               npm install/test filters
│   ├── cargo.ts             cargo build/test filters
│   ├── test.ts              go test / pytest filters
│   ├── fs.ts                find/ls/tree filters
│   ├── docker.ts            docker build/pull/push filters
│   ├── make.ts              make/cmake compilation progress filters
│   ├── pip.ts               pip install RLE collapse
│   └── generic.ts           Fallback generic compression
│
├── filters/
│   ├── read.ts              Read output filters (skeleton extraction)
│   ├── grep.ts              Grep output dedup
│   └── glob.ts              Glob output dedup
│
└── utils/
    ├── secrets.ts           Secret redaction (33+ patterns)
    ├── tokens.ts            Token estimation utilities
    ├── metrics.ts           Metrics recording (JSONL, rotation at 10MB)
    ├── stats.ts             Stats aggregation and summaries
    ├── cache.ts             LRU cache for read outputs
    ├── errors.ts            Error logging
    ├── session-store.ts     Session-scoped state store (30-min TTL, max 10)
    └── ...other utilities
```

---

## Development

### Setup

```bash
git clone <repo>
cd opentoken
bun install
```

### Commands

| Command | Description |
|---|---|
| `bun test` | Run all tests (Bun test runner) |
| `bun run typecheck` | TypeScript strict check (`tsc --noEmit`) |
| `bun run lint` | Biome check (tabs, double quotes, imports) |
| `bun run lint:fix` | Auto-fix with Biome |
| `bun run format` | Biome format (tabs, double quotes) |
| `bun run checks:regex` | ReDoS pattern scan |

### CI Pipeline

```
typecheck → lint → checks:regex → test
```

### Testing Conventions

- Bun test runner: `import { describe, expect, it } from "bun:test"`
- No `test.skip` / `it.skip` / `.only` in committed code
- Tests import modules directly from `src/` — no build step needed

### Linking Locally

```bash
cp -r .opencode/ ~/.config/opencode/plugins/opentoken
```

The `.opencode/plugins/opentoken/` directory mirrors `src/` for distribution. Keep it in sync.

### Important Gotchas

- **`CONTRIBUTING.md` is stale** — lists `families/bash.ts` and `filters/compile.ts` which don't exist. Current files match the architecture tree above.
- **Lockfiles**: only `bun.lock` is tracked; `package-lock.json` is gitignored.
- **Biome**: tab indentation, double quotes, `organizeImports` on assist.

---

## License

MIT
