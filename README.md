# OpenToken

Token-saving companion for OpenCode. Intercepts, filters, and compresses tool outputs before they reach the model.

**Typical savings: 50-90% on tool output tokens.**

## How It Works

```
OpenCode tool call → [compression pipeline] → model sees clean output
```

OpenToken installs as an OpenCode plugin and hooks into the tool execution lifecycle. Every tool output passes through a multi-stage pipeline that strips noise, removes redundancy, and compresses large outputs — all transparently.

## Active Layers

| # | Layer | What It Does |
|---|-------|-------------|
| L1 | Command rewrite | Adds `--silent`, `--quiet`, `--oneline` to noisy commands |
| L2 | Block minified | Skips reads of `.min.js`, `dist/`, `node_modules/` |
| L3 | Size caps | Blocks writes >100KB, edits >50KB |
| L5 | LSP-first | Blocks grep/glob for code symbols, suggests LSP tools |
| L6 | Family filters | Specialized filters for git, npm, cargo, test, and fs output |
| L7 | Tool compression | Read outlines, grep dedup, glob noise removal |
| L8 | Binary detect | Suppresses binary output |
| L9 | Output block | Suppresses output >500KB |
| L10 | Strip thinking | Removes `<antThinking>`, `<reasoning>` blocks |
| L11 | Whitespace cleanup | Strips nulls, empty values, timestamps |
| L12 | Key aliasing | `description`→`desc`, `configuration`→`config` |
| L13 | Cross-call dedup | Identical output within 16 calls → single reference |
| L14 | Progressive disclosure | Large output → offload to temp file + summary pointer |
| L15 | Auto-escalation | Compression intensity increases as context fills |
| L16 | AST skeleton | Replaces full file reads with symbol outlines |
| L17 | Diff folding | Collapses unchanged diff context lines |
| L18 | Log folding | Collapses repeated consecutive log lines |
| L19 | JSON sampling | Large JSON arrays → schema + representative samples |
| L20 | Reversible compression | Aggressive compression with on-disk original store |
| L21 | Content router | Detects content type, fires only relevant stages |
| L23 | Symbol index | Background codebase indexing at session start |
| L24 | Session memory | Injects previous session summary on restart |

## Safety Guarantees

| Rule | Behavior |
|------|----------|
| Short outputs | <200 lines or <50KB → pass through unchanged |
| Conservative | If filtered output ≥ original size → return original |
| Secrets | Redacted BEFORE any filtering (33+ patterns) |
| Binary | Detected and suppressed |

## Requirements

- **Bun** runtime (>=1.2.0)
- **OpenCode** with plugin support

## Install

```bash
npm install opentoken
```

Then add to your OpenCode config:

```json
{
  "plugins": {
    "opentoken": {
      "path": "node_modules/opentoken/src/index.ts"
    }
  }
}
```

## Data Storage

All state is stored in `~/.config/opentoken/`:

| File | Purpose | Cleanup |
|------|---------|---------|
| `metrics.jsonl` | Per-call token savings | Append-only (grows over time) |
| `session-memory.json` | Previous session summary | Overwritten each session |
| `offload/` | Progressive disclosure temp files | Auto-cleaned after 1 hour |
| `rewind/` | Reversible compression store | Auto-cleaned after 1 hour |
| `index/symbols.json` | Symbol index cache | Overwritten each session |

## License

MIT
