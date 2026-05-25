<div align="center">
  <h1>OpenToken</h1>
  <p><strong>Token-saving companion for OpenCode.</strong> Intercepts, filters, and compresses tool outputs before they reach the model.</p>
  <p>
    <a href="https://github.com/MrGray17/opentoken/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
    <img src="https://img.shields.io/badge/bun-%3E%3D1.2.0-fbb744.svg" alt="Bun >=1.2.0">
    <a href="https://github.com/MrGray17/opentoken/stargazers"><img src="https://img.shields.io/github/stars/MrGray17/opentoken" alt="GitHub Stars"></a>
  </p>
  <p><strong>Typical savings: 70–90% on tool output tokens.</strong></p>
</div>

> **🏆 862,301 tokens saved in one session — $26.00. Verified.**

---

## Table of Contents

- [Real Production Numbers](#real-production-numbers)
- [How It Works](#how-it-works)
- [Compression Layers](#compression-layers)
- [Command Families](#command-families)
- [Per-Tool Performance](#per-tool-performance)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Safety Guarantees](#safety-guarantees)
- [Diagnostics](#diagnostics)
- [Data Storage](#data-storage)
- [Security](#security)
- [Development](#development)
- [License](#license)

---

## Real Production Numbers

Data from a single 22-hour session (977 tool calls):

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

### Savings Breakdown

| Technique | Contribution |
|---|---|
| AST skeleton extraction (read) | ~60% of read savings |
| Family-specific filters (bash) | ~25% of bash savings |
| Whitespace + key aliasing | ~5–10% across all tools |
| TOON format (JSON → tabular) | ~5% on JSON outputs |
| LTSC (LZ77-style) | ~3% on repetitive content |
| Cross-tool dedup | ~2% on duplicates |
| Auto-escalation | Variable — increases under pressure |

The remaining ~28% is content already small (short outputs, <80 lines) or that cannot be compressed further (code, structured data).

---

## How It Works

```
OpenCode tool call → [ compression pipeline ] → model sees cleaned output
```

OpenToken installs as an OpenCode plugin and hooks into the tool execution lifecycle. Every tool output passes through a multi-stage pipeline that strips noise, removes redundancy, and compresses large outputs — all transparently to the model and the user.

### Architecture

```
                    ┌─────────────────────────┐
                    │   OpenCode Session       │
                    │   (tool.execute)         │
                    └────────┬────────────────┘
                             │
                             ▼
                    ┌─────────────────────────┐
                    │   Pre-Call Filters       │
                    │   • Command rewriting    │
                    │   • Minified file block  │
                    │   • Size caps            │
                    │   • LSP-First routing    │
                    └────────┬────────────────┘
                             │
                             ▼
                    ┌─────────────────────────┐
                    │   Content Router         │
                    │   (detect type/file)     │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      ┌────────────┐ ┌────────────┐ ┌────────────┐
      │  bash      │ │  read      │ │  grep/glob │
      │  pipeline  │ │  pipeline  │ │  pipeline  │
      └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
            │              │              │
            ▼              ▼              ▼
      ┌─────────────────────────────────────────┐
      │   Post-Call Compression (shared)        │
      │   • Secrets → Binary → Thinking strip   │
      │   • Key aliasing → TOON → Whitespace    │
      │   • Family filter → Dedup → LZW → LTSC │
      │   • Auto-escalation → Conservative cmp  │
      └─────────────────┬───────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  Model receives     │
              │  compressed output  │
              └─────────────────────┘
```

### Pipeline Stages by Tool

| Tool | Pipeline |
|---|---|
| **bash** | Secrets → Binary → Suppress → Strip thinking → ANSI strip → Clean whitespace → Key aliasing → TOON → Normalize → Minify JSON → Minimize tables → Normalize logs → Diff/log fold → JSON sample → Family detect → Family filter → Reversible → Auto-escalation → LTSC → LZW |
| **read** | Secrets → Binary → Suppress → Strip thinking → Cache → Skeleton extraction → Clean whitespace → Key aliasing → TOON → Normalize → Minify JSON → Minimize tables → Normalize logs → Diff/log fold → JSON sample → Reversible → Auto-escalation → LTSC → LZW |
| **grep** | Secrets → Suppress → Strip thinking → Minify JSON → Minimize tables → Normalize logs → Grep filter → Progressive disclosure → Reversible → Auto-escalation → LTSC → LZW |
| **glob** | *(same as grep)* → Glog filter → ... |

---

## Compression Layers

OpenToken applies up to **35 distinct compression layers** depending on content type and tool. Each layer is independently configured, fail-safe, and conservative.

| # | Layer | Module | What It Does |
|---|---|---|---|
| L1 | Command rewrite | `precall.ts` | Auto-adds `--silent`, `--quiet`, `--oneline` to 17+ command types |
| L2 | Minified file block | `precall.ts` | Skips reads of `.min.js`, `dist/`, `build/`, `node_modules/`, lock files |
| L3 | Size caps | `precall.ts` | Blocks writes >50 KB, edits >20 KB |
| L4 | Secret redaction | `utils/secrets.ts` | Redacts 33+ patterns (API keys, tokens, passwords, JWTs) |
| L5 | LSP-first enforcement | `lspfirst.ts` | Blocks grep/glob on code symbol patterns; routes to LSP tools |
| L6 | Family-specific filters | `families/*.ts` | 8 specialized filters (git, npm, cargo, test, fs, docker, pip, make) |
| L7 | Tool-specific compression | `filters/*.ts` | Read skeleton outlines, grep dedup, glob noise removal |
| L8 | Binary detection | `postcall.ts` | 64 KB NUL byte scan; extracts UTF-8 text or suppresses |
| L9 | Output suppression | `postcall.ts` | Blocks output >100 KB entirely |
| L10 | Thinking block stripping | `postcall.ts` | Removes `<antThinking>`, `<reasoning>`, `<scratchpad>`, `<inner_monologue>` |
| L11 | Whitespace/null cleanup | `postcall.ts` | Strips null values, empty objects/arrays, timestamps, hashes |
| L12 | Key aliasing | `postcall.ts` | Maps 80+ long JSON keys to short aliases (`description` → `desc`) |
| L13 | URL shortening | `postcall.ts` | Strips query parameters and hash from URLs >100 chars |
| L14 | Base64 stripping | `postcall.ts` | Replaces inline `data:...;base64,...` with short placeholder |
| L15 | Cross-call dedup | `dedup.ts` | Identical/similar output within 16-call window → single reference line |
| L16 | Progressive disclosure | `progressive.ts` | Large output (>80 lines, >8 KB) offloaded to temp file + summary pointer |
| L17 | Auto-escalation | `autoescalate.ts` | Ratchets compression intensity as context fills (50% → LEAN, 70% → ULTRA, 85% → CEILING) |
| L18 | AST skeleton extraction | `skeleton.ts` | Replaces full file reads with structural signatures (functions, classes, imports). ~88% reduction |
| L19 | Diff folding | `folding.ts` | Collapses unchanged diff context lines |
| L20 | Log folding | `folding.ts` | Collapses repeated log lines (Python, K8s, syslog formats) |
| L21 | JSON statistical sampling | `jsonsample.ts` | Large JSON arrays → schema discovery + representative samples |
| L22 | Reversible compression | `rewind.ts` | Aggressive head(10)+tail(5) extraction; full original stored on disk for retrieval |
| L23 | Content-aware router | `router.ts` | Detects content type (code, json, diff, log, etc.) → fires only relevant stages |
| L24 | Stack trace compression | `postcall.ts` | Detects stack frames; collapses middle frames, keeps top + bottom |
| L25 | Symbol index | `symbolindex.ts` | Background codebase indexing at session start — enables symbol-based queries |
| L26 | Session memory | `memory.ts` | Persists previous session summary; injects top-3 relevant on restart |
| L27 | TOON format conversion | `toon.ts` | JSON arrays of objects → tabular CSV-like format. 40–50% savings |
| L28 | Whitespace normalization | `postcall.ts` | Collapses 3+ newlines, strips trailing whitespace, normalizes tabs |
| L29 | Log noise normalization | `postcall.ts` | Replaces timestamps, PIDs, elapsed times with static placeholders |
| L30 | Table minimization | `postcall.ts` | Strips padding/alignment from CLI tables |
| L31 | JSON minification | `postcall.ts` | Lossless whitespace removal from JSON output |
| L32 | ANSI escape stripping | `postcall.ts` | Removes terminal color codes and control sequences |
| L33 | LTSC (Lossless Token Sequence Compression) | `ltsc.ts` | LZ77-style — finds repeated substrings, replaces with dictionary meta-tokens. 18–27% savings |
| L34 | LZW token substitution | `lzw.ts` | Dictionary compression for repetitive content (stack traces, error logs) |
| L35 | Cross-tool dedup | `dedup.ts` | Identical content from different tools → single reference |

> **Conservative filter**: Every pipeline ends with a comparison — if filtered output ≥ original size, the original is returned untouched.

---

## Command Families

OpenToken detects the command being executed and applies a tailored filter:

| Family | Commands | What It Does |
|---|---|---|
| **git** | `git status`, `diff`, `log`, `show`, `blame` | Extracts only changed/untracked files, diff hunks, commit SHAs |
| **npm** | `npm install`, `test`, `run`, `npx` | Strips dependency trees, keeps added/changed/removed + warnings/errors |
| **cargo** | `cargo build`, `test`, `clippy`, `check` | Strips compile progress; keeps errors, warnings, test results |
| **test** | `pytest`, `jest`, `vitest`, `go test` | Strips pass lines; keeps failures, assertions, summary table |
| **fs** | `ls`, `find`, `tree`, `cat` (source files) | Groups by directory, strips noise dirs, deduplicates paths. `cat` routes through AST skeleton |
| **docker** | `docker build`, `pull`, `push` | Strips progress bars, layer hashes, extraction status |
| **pip** | `pip install` | RLE-collapses "Requirement already satisfied" lines |
| **make** | `make`, `cmake` | Folds `[N%]` compilation progress — unless adjacent to warnings/errors |
| **generic** | Everything else | Head(20)+tail(20) preservation, stack trace compression, UTF-8 safe truncation |

---

## Per-Tool Performance

| Tool | Pipeline Length | Key Savings Mechanism | Typical Savings |
|---|---|---|---|
| `read` | 20 stages | AST skeleton extraction (88% reduction) | 95–99% |
| `bash` | 20 stages | Family-specific filters + TOON + LTSC | 40–60% |
| `grep` | 12 stages | Grep dedup + grouping + progressive disclosure | 75–85% |
| `glob` | 12 stages | Noise directory filtering + grouping + progressive disclosure | 70–80% |

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

Verify checksum:

```bash
bash install.sh --sha256 <expected-sha256>
```

### Manual install

```bash
mkdir -p ~/.config/opencode/plugins/opentoken
curl -fsSL https://github.com/MrGray17/opentoken/archive/refs/heads/main.tar.gz \
  | tar xz --strip-components=1 -C ~/.config/opencode/plugins/opentoken
```

### Install via npm

```bash
npm install github:MrGray17/opentoken
```

Then add to your OpenCode config:

```json
{
  "plugin": ["opentoken"]
}
```

### Per-project (local copy)

```bash
mkdir -p .opencode/plugins
cp -r node_modules/opentoken/src .opencode/plugins/opentoken
```

### Verify

Use the `opentoken_health` MCP tool to confirm the plugin is active:

```
🌸 opentoken health check

  Total errors: 0
  No errors recorded ✅

  Config: metrics=true, symbols=true
  Context: lean
```

---

## Configuration

Create `~/.config/opentoken/config.json` (all fields optional):

```json
{
  "maxOutputBytes": 10485760,
  "maxProcessingMs": 5000,
  "safeReadRoot": "/path/to/project",
  "enableMetrics": true,
  "enableSymbolIndex": true,
  "conservativeUseTokens": false,
  "enableTui": true
}
```

### Reference

| Field | Default | Description |
|---|---|---|
| `maxOutputBytes` | 10485760 (10 MB) | Hard limit — reject outputs larger than this |
| `maxProcessingMs` | 5000 | Timeout per pipeline stage (ms) |
| `safeReadRoot` | Project root | Only allow reads under this directory |
| `enableMetrics` | `true` | Track per-call token savings to disk |
| `enableSymbolIndex` | `true` | Build and query code symbol index at startup |
| `conservativeUseTokens` | `false` | Use token count (slower) vs. byte count (faster) for safety comparison |
| `enableTui` | `true` | Show the TUI status bar in the prompt area |

---

## TUI Status Bar

When enabled, OpenToken displays a real-time status bar in the prompt area:

```
🌸 opentoken saved 2.4K tokens   1h 23m  14:32
```

- **Token savings** — cumulative for the current session
- **Duration** — elapsed session time
- **Clock** — current time, updates every second

Disable with `"enableTui": false` in `config.json`.

---

## Safety Guarantees

| Rule | Behavior |
|---|---|
| **Short output bypass** | <80 lines or <20 KB → pass through unchanged |
| **Conservative comparison** | If filtered output ≥ original size → return original |
| **Secrets-first** | Redacted BEFORE any other processing (33 patterns compiled to single alternation regex) |
| **Binary detection** | NUL byte scan on first 64 KB → suppress or extract text |
| **Graceful degradation** | Every pipeline stage is try/catch wrapped — a single failure never crashes the session |
| **Input validation** | Tool names are whitelisted; file paths validated against project root |
| **Size limits** | 10 MB hard limit on tool output (configurable) |
| **Path traversal protection** | All file paths resolved and checked against the allowed root |

---

## Diagnostics

Two MCP tools are available for debugging and monitoring.

### `opentoken_stats`

Shows per-session token savings summary. Supports optional time-based filtering:

```
🌸 opentoken stats

  Calls:        142
  Tokens in:    48.2K
  Tokens out:   3.1K
  Tokens saved: 45.1K (94%)

  By tool:
    read           89 calls  saved  42.3K ( 96%)
    bash           45 calls  saved   2.7K ( 72%)
    grep            8 calls  saved    89 ( 45%)
```

Filter by session: `opentoken_stats({ since: "all" })` to aggregate across all sessions.

### `opentoken_health`

Shows plugin health — error counts, stage failures, and config status:

```
🌸 opentoken health check

  Total errors: 0
  No errors recorded ✅

  Config: metrics=true, symbols=true
  Context: lean
```

---

## Data Storage

All state is stored in `~/.config/opentoken/`:

| File | Purpose | Cleanup |
|---|---|---|
| `metrics.jsonl` | Per-call metrics (tool, family, tokens before/after, savings %) | Rotated at 10 MB, keeps 5 files |
| `error.jsonl` | Pipeline stage failure traces | Rotated at 5 MB, keeps 3 files |
| `stats-summary.json` | Aggregated statistics summary | Overwritten on each `opentoken_stats` call |
| `session-memory.json` | Previous session summary for cross-session injection | Overwritten each session |
| `offload/` | Progressive disclosure temp files | Auto-cleaned after 1 hour |
| `rewind/` | Reversible compression hash store | Auto-cleaned after 1 hour |
| `index/symbols.json` | Code symbol index cache | Overwritten each session |

File permissions: `0o600` for data files, `0o700` for directories.

---

## Security

OpenToken is designed with defense-in-depth:

- **Path traversal protection** — File paths are validated to resolve within the project directory
- **Input validation** — Tool names are whitelisted and sanitized
- **Output size limits** — Prevents memory exhaustion from oversized tool outputs
- **Graceful degradation** — Every pipeline stage is wrapped in error handling; a single failure never crashes the session
- **Secret redaction** — Runs first in every pipeline, before any other processing (33 patterns compiled into a single alternation regex for performance)
- **SHA256 checksum verification** — `install.sh` downloads to a temp tarball, computes SHA256, and supports `--sha256 <hash>` for automatic integrity verification
- **File permission hardening** — Session state, metrics, and error files are created with `0o600` (owner-only read/write); config directories use `0o700`
- **Reproducible dependencies** — `bun.lock` locks exact dependency versions for reproducible installs, preventing supply chain changes between commits

---

## Development

### Setup

```bash
git clone https://github.com/MrGray17/opentoken.git
cd opentoken
bun install
```

### Testing

```bash
bun test           # Run all tests
bun test --watch   # Watch mode
```

### Type checking

```bash
bun run typecheck  # tsc --noEmit
```

### Code structure

```
src/
├── index.ts              Plugin entry, pipeline orchestration
├── precall.ts            Pre-execution command rewriting and validation
├── postcall.ts           Post-execution output cleaning and compression
├── router.ts             Content-aware compression stage routing
├── session.ts            Per-session state and metrics tracking
├── folding.ts            Diff and log line folding
├── dedup.ts              Cross-call output deduplication
├── lzw.ts                LZW token substitution compression
├── ltsc.ts               Lossless Token Sequence Compression (LZ77-style)
├── progressive.ts        Large output offloading with summary pointers
├── autoescalate.ts       Context-pressure-based compression escalation
├── toon.ts               JSON-to-tabular format conversion
├── history.ts            Conversation history compression
├── memory.ts             Cross-session persistent memory
├── skeleton.ts           AST skeleton extraction for file reads
├── symbolindex.ts        Codebase symbol index
├── jsonsample.ts         JSON statistical sampling
├── rewind.ts             Reversible aggressive compression
├── lspfirst.ts           LSP-first enforcement for code queries
├── statusline.ts         Token savings status line
├── tui.tsx               TUI status bar widget (Solid.js)
├── families/             Command-family-specific output filters
│   ├── git.ts, npm.ts, cargo.ts, test.ts, fs.ts
│   ├── docker.ts, pip.ts, make.ts, generic.ts
│   └── detect.ts
├── filters/              Tool-specific output filters
│   ├── read.ts, grep.ts, glob.ts
└── utils/                Shared utilities
    ├── secrets.ts, tokens.ts, cache.ts
    ├── metrics.ts, stats.ts, errors.ts
    └── session-store.ts
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests (`bun test`) and type checking (`bun run typecheck`)
5. Open a pull request

---

## License

[MIT](LICENSE) © MrGray17
