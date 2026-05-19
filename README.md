# OpenToken

Token-saving companion for OpenCode. **24-layer compression pipeline** that intercepts, filters, and compresses tool outputs before they reach the model.

**Target: 70-99% token reduction on tool outputs.**

## Architecture

```
OpenCode tool call → [24 layers] → model sees clean output
```

### The 24 Layers

| # | Layer | Technique | Source | Savings |
|---|-------|-----------|--------|---------|
| L1 | Command rewrite | `npm install` → `npm install --silent`, 14+ patterns | rtk | 10-30% |
| L2 | Block minified | Skip `.min.js`, `dist/`, `node_modules/` | warden | 5-15% |
| L3 | Size caps | Block writes >100KB, edits >50KB | warden | prevents waste |
| L4 | Subagent budget | Read byte limits, call count caps | warden | 20-40% |
| L5 | LSP-first enforcement | Block grep for symbols, force LSP | lsp-enforcement | 80% |
| L6 | Family filters | Bash output by family (git/npm/cargo/test/fs) | ecotokens | 60-90% |
| L7 | Tool compression | Read outlines, grep dedup, glob noise removal | — | 50-80% |
| L8 | Binary detect | NUL byte scan, suppress binary output | warden | 100% on binary |
| L9 | Output block | Suppress >500KB entirely | warden | prevents overflow |
| L10 | Strip thinking | Remove `<antThinking>`, `<reasoning>` blocks | warden | 5-20% |
| L11 | Whitespace cleanup | Strip nulls, empties, timestamps, IDs, hashes | smithers | 10-30% |
| L12 | Key aliasing | `description`→`desc`, `configuration`→`config` | smithers | 5-15% |
| L13 | Cross-call dedup | Same output within 16 calls → collapse | squeez | 100% on dupes |
| L14 | Progressive disc | >200 lines → offload to temp file + pointer | context-mode | 80-95% |
| L15 | Auto-escalation | 50%→lean, 70%→ultra, 85%→ceiling ratchet | pith | adaptive |
| L16 | AST skeleton | Replace full reads with symbol outlines | pith/claw | 88% |
| L17 | Diff folding | Collapse unchanged diff context lines | claw-compactor | 15-82% |
| L18 | Log folding | Collapse repeated log lines | claw-compactor | 15-82% |
| L19 | JSON sampling | Schema discovery + representative sampling | claw-compactor | 82% |
| L20 | Reversible compress | Hash store + retrieve on demand | claw-compactor | enables 82% |
| L21 | Content router | Detect type, fire relevant stages only | claw-compactor | <50ms |
| L22 | Think-in-code | Write scripts instead of reading files | context-mode | 200x |
| L23 | Symbol index | `find_symbol`, `get_function_source` | token-savior | 99.9% |
| L24 | Session memory | Prev session summary + cache-lock skip | squeez | ~300 tok |

## Safety Guarantees

| Rule | Behavior |
|------|----------|
| Short outputs | <200 lines or <50KB → pass through unchanged |
| Errors/failures | Never modified, always preserved in full |
| Secrets | Redacted BEFORE any filtering (33+ patterns) |
| Fallback | If filtered ≥ original → return original |
| UTF-8 safe | Never truncate mid-character |
| Binary | Detected and suppressed, not passed to model |

## Install

### Global (recommended)

```bash
git clone https://github.com/MrGray17/opentoken.git
cd opentoken
bun install

# Copy to global opencode plugins directory
cp -r src ~/.config/opencode/plugins/opentoken
```

### Per-project

```bash
cp -r src /your/project/.opencode/plugins/opentoken
```

## Configuration

Create `~/.config/opentoken/config.json`:

```json
{
  "abbreviations_enabled": true,
  "cache_enabled": true,
  "cache_ttl_seconds": 30,
  "max_lines_short_output": 200,
  "max_bytes_short_output": 51200,
  "subagent_max_read_kb": 10,
  "subagent_max_calls": 25,
  "write_max_kb": 100,
  "edit_max_kb": 50,
  "output_max_kb": 500,
  "dedup_window": 16,
  "offload_max_lines": 200,
  "noise_dirs": ["node_modules", ".git", "dist", "build", ".cache"]
}
```

## Metrics

Token savings tracked in `~/.config/opentoken/metrics.jsonl`:

```json
{"ts":"2026-05-19T...","tool":"bash","family":"git","before_tokens":12000,"after_tokens":800,"saved_pct":93}
```

## Roadmap

See [TO-DO.md](TO-DO.md) for Phase 3 (advanced) techniques.

## License

MIT
