# OpenToken — Build Roadmap

## Phase 1: High-Impact Easy Wins ✅ DONE
- [x] #3 Block verbose commands (npm install → npm install --quiet, curl → curl -s)
- [x] #5 Subagent budget enforcement (read byte limits, call counts)
- [x] #6 Block minified/generated files (.min.js, dist/, node_modules/, bundled)
- [x] #7 Size caps on write/edit (100KB write, 50KB edit)
- [x] #14 Large output offload (>500 lines → temp file + pointer)
- [x] #15 XML/Markdown block stripping (<antThinking>, <thinking>)
- [x] #16 Binary detection (NUL byte scan, suppress)
- [x] #17 Output suppression (>500KB → block entirely)
- [x] #20 Key aliasing (replace long JSON keys with short aliases)
- [x] #21 Whitespace/null cleanup (strip redundant fields, timestamps)
- [x] #25 Cross-call deduplication (same output within N calls → collapse)
- [x] #26 Progressive disclosure (summary first, full on demand via MCP)
- [x] #36 Auto-escalation (ratchet compression as context fills)
- [x] #38 Session memory (inject previous session summary on start)
- [x] #43 Cache-lock (session rules hashed, skip if unchanged)

## Phase 2: Elite Techniques ✅ DONE
- [x] #4 AST Skeleton Reads (tree-sitter/regex, 88% per read) — `skeleton.ts`
- [x] #12 Diff Folding (collapse unchanged context lines) — `folding.ts`
- [x] #13 Log Folding (collapse repeated log lines) — `folding.ts`
- [x] #15 JSON Statistical Sampling (schema discovery + sampling) — `jsonsample.ts`
- [x] #16 Reversible Compression (hash store + retrieve tool) — `rewind.ts`
- [x] #20 Content-Aware Router (detect type, fire relevant stages) — `router.ts`
- [x] #2 Think-in-Code Sandbox (write scripts instead of reading files) — `sandbox.ts`
- [x] #1 Structural Symbol Index (find_symbol, get_function_source) — `symbolindex.ts`
- [x] #5 LSP-First Enforcement (block grep for symbols) — `lspfirst.ts`

## Phase 3: Advanced (Complex)
- [ ] #24 Semantic caching (vector similarity for read-only tool results)
- [ ] #27 Persistent memory (SQLite + FTS5 + vector embeddings)
- [ ] #29 Impact analysis (change impact, backward slicing)
- [ ] #30 BM25 + semantic search hybrid (tantivy + candle embeddings)
- [ ] #31 TextRank compression (graph-based sentence scoring)
- [ ] #41 Schema virtualization (compress tool schemas to DietMCP notation)
- [ ] #42 System prompt compression (compress backend instructions)
- [ ] #44 MCP meta-tools (expose 3 meta-tools instead of 37 individual)
- [ ] #46 Reversible compression (14-stage fusion pipeline)
- [ ] #47 Intelligent content routing (route by file type with ML classifier)
- [ ] #48 Tool pruning (remove unused tools from context)
- [ ] #49 History compression (compress conversation history)
- [ ] #50 Declarative YAML filters (config-driven rules engine)

## Architecture Notes
- All techniques designed for OpenCode plugin API (tool.execute.before/after)
- Zero external services — everything local
- Conservative fallback: never worse than original
- Error/failure preservation: never modified
- UTF-8 safe: never truncate mid-character

## Technique Sources
| Technique | Source Tool | Max Savings |
|-----------|-------------|-------------|
| Structural Symbol Navigation | token-savior (815★) | -99.9% |
| Think in Code Sandbox | context-mode | 200x |
| AST Skeleton Reads | pith + claw-compactor | -88% |
| Diff/Log Folding | claw-compactor | Part of 15-82% |
| JSON Sampling | claw-compactor | -82% |
| Reversible Compression | claw-compactor | Enables 82% |
| Content-Aware Router | claw-compactor | <50ms pipeline |
| LSP-First Enforcement | lsp-enforcement-kit | -80% |
| Command Rewrite | rtk | 60-99% |
| Cross-Call Dedup | squeez | 100% on hits |
| Auto-Escalation | pith | Adaptive |
| Session Memory | squeez | ~300 tok/session |
