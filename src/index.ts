// OpenToken — Token-saving companion for OpenCode
// Production-grade compression pipeline for tool outputs

import type { Plugin } from "@opencode-ai/plugin"
import path from "path"
import os from "os"

// Phase 1 imports
import { preCallFilter } from "./precall"
import { stripThinkingBlocks, detectAndHandleBinary, suppressOversized, aliasJsonKeys, cleanWhitespaceAndNulls } from "./postcall"
import { deduplicate, resetDedup } from "./dedup"
import { progressiveDisclosure, cleanupOffloaded } from "./progressive"
import { applyAutoEscalation, updateContext, getCompressionLevel, resetEscalation } from "./autoescalate"
import {
  loadSessionSummary,
  finalizeSession,
  trackFile,
  trackError,
  trackGitEvent,
  trackToolCall,
  trackTokensSaved,
  getSessionTracker,
} from "./session"
import { detectFamily } from "./families/detect"
import { filterGitOutput } from "./families/git"
import { filterNpmOutput } from "./families/npm"
import { filterCargoOutput } from "./families/cargo"
import { filterTestOutput } from "./families/test"
import { filterFsOutput } from "./families/fs"
import { filterGeneric } from "./families/generic"
import { filterRead } from "./filters/read"
import { filterGrep } from "./filters/grep"
import { filterGlob } from "./filters/glob"
import { redactSecrets } from "./utils/secrets"
import { estimateTokens } from "./utils/tokens"
import { recordMetric } from "./utils/metrics"
import { getCachedRead, setCachedRead } from "./utils/cache"

// Phase 2 imports
import { extractSkeleton } from "./skeleton"
import { foldDiffAndLogs } from "./folding"
import { sampleJson } from "./jsonsample"
import { applyReversibleCompression, cleanupRewind } from "./rewind"
import { analyzeContent, getCompressionPipeline } from "./router"
import { indexDirectory, loadIndex } from "./symbolindex"
import { shouldBlockGrep, shouldBlockGlob, shouldBlockShellGrep, trackLSPUsage, resetLSPState } from "./lspfirst"
import { generateStatusLine, generateSessionSummary, resetStatusLine } from "./statusline"

// ─── CONFIGURATION ───

interface OpenTokenConfig {
  maxOutputBytes: number       // Hard limit — reject outputs larger than this
  maxProcessingMs: number      // Timeout per pipeline stage
  safeReadRoot: string         // Only allow reads under this directory
  enableMetrics: boolean       // Track token savings to disk
  enableSymbolIndex: boolean   // Build and query symbol index at startup
  conservativeUseTokens: boolean // Use token count (slower) vs byte count (faster) for safety check
}

const DEFAULT_CONFIG: OpenTokenConfig = {
  maxOutputBytes: 10 * 1024 * 1024,  // 10MB hard limit
  maxProcessingMs: 5000,              // 5s per stage
  safeReadRoot: "",                   // Empty = use project directory
  enableMetrics: true,
  enableSymbolIndex: true,
  conservativeUseTokens: false,       // Byte count by default (fast)
}

let config: OpenTokenConfig = DEFAULT_CONFIG

async function loadConfig(directory: string): Promise<void> {
  try {
    const configPath = path.join(os.homedir(), ".config", "opentoken", "config.json")
    const file = Bun.file(configPath)
    if (await file.exists()) {
      const userConfig = JSON.parse(await file.text()) as Partial<OpenTokenConfig>
      config = { ...DEFAULT_CONFIG, ...userConfig }
    }
  } catch {
    // Use defaults — config is optional
  }

  // Set safe read root to project directory if not explicitly configured
  if (!config.safeReadRoot) {
    config.safeReadRoot = directory
  }
}

// ─── SECURITY GUARDS ───

function validateToolName(tool: unknown): string {
  if (typeof tool !== "string") return "unknown"
  // Whitelist known tool names
  const known = ["bash", "read", "grep", "glob", "write", "edit", "web_fetch", "web_search"]
  return known.includes(tool) ? tool : tool.replace(/[^a-zA-Z0-9_]/g, "")
}

function sanitizeFilePath(filePath: string, rootDir: string): { safe: boolean; resolved: string; reason?: string } {
  const resolved = path.resolve(rootDir, filePath)
  const normalizedRoot = path.resolve(rootDir)

  // Block path traversal
  if (!resolved.startsWith(normalizedRoot)) {
    return { safe: false, resolved: "", reason: `Path traversal blocked: ${filePath} resolves outside project directory` }
  }

  // Block absolute paths
  if (path.isAbsolute(filePath) && !filePath.startsWith(normalizedRoot)) {
    return { safe: false, resolved: "", reason: `Absolute paths outside project blocked: ${filePath}` }
  }

  return { safe: true, resolved }
}

function validateOutputSize(output: string): { valid: boolean; reason?: string } {
  const bytes = Buffer.byteLength(output, "utf8")
  if (bytes > config.maxOutputBytes) {
    return { valid: false, reason: `Output too large: ${(bytes / 1024 / 1024).toFixed(1)}MB exceeds ${(config.maxOutputBytes / 1024 / 1024).toFixed(0)}MB limit` }
  }
  return { valid: true }
}

function safeEstimateTokens(text: string): number {
  try {
    return estimateTokens(text)
  } catch {
    return Math.ceil(text.length * 0.25) // Fallback estimation
  }
}

// ─── SAFE PIPELINE WRAPPER ───

// Wraps each pipeline stage with error handling — if a stage fails, log and continue
function safeStage<T>(name: string, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[OpenToken] Stage "${name}" failed: ${msg}`)
    // Return the input unchanged — better to skip a stage than crash
    return undefined as unknown as T
  }
}

async function safeStageAsync<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[OpenToken] Stage "${name}" failed: ${msg}`)
    return undefined as unknown as T
  }
}

// ─── INTERFACES ───

interface ToolInputBefore {
  tool: string
  sessionID: string
  callID: string
}

interface ToolOutputBefore {
  args?: Record<string, unknown>
  result?: string
  error?: string
}

interface ToolInputAfter {
  tool: string
  sessionID: string
  callID: string
  args?: Record<string, unknown>
}

interface ToolOutputAfter {
  title?: string
  output?: string
  metadata?: unknown
}

// ─── HELPERS ───

const SHORT_OUTPUT_THRESHOLD = 200
const MAX_OUTPUT_LENGTH = 51200

function shouldSkipFilter(output: string): boolean {
  const lines = output.split("\n")
  return lines.length < SHORT_OUTPUT_THRESHOLD && output.length < MAX_OUTPUT_LENGTH
}

function hasErrors(output: string): boolean {
  const errorPatterns = [
    /error\[/i, /error:/i, /fatal:/i, /FAILED/i, /panic:/i,
    /traceback/i, /SyntaxError/i, /TypeError/i, /ReferenceError/i,
    /ENOENT/i, /EACCES/i, /EPERM/i, /MODULE_NOT_FOUND/i,
    /--- FAIL:/i, /assertion/i, /stack trace/i,
  ]
  return errorPatterns.some((p) => p.test(output))
}

function conservativeFilter(original: string, filtered: string): string {
  if (config.conservativeUseTokens) {
    const origTokens = safeEstimateTokens(original)
    const filtTokens = safeEstimateTokens(filtered)
    if (filtTokens >= origTokens) return original
  } else {
    if (filtered.length >= original.length) return original
  }
  return filtered
}

// ─── CONTENT-AWARE ROUTER ───

function routeContent(content: string, filePath?: string): {
  pipeline: string[]
  analysis: ReturnType<typeof analyzeContent>
} {
  const analysis = safeStage("analyzeContent", () => analyzeContent(content, filePath))
  if (!analysis) return { pipeline: [], analysis: { type: "text", language: "unknown", size: 0, lines: 0, isStructured: false, hasErrors: false, isRepetitive: false, compressionCandidates: [] } }
  const pipeline = getCompressionPipeline(analysis)
  return { pipeline, analysis }
}

// ─── BASH FILTER PIPELINE ───

async function applyBashFilter(command: string, output: string): Promise<string> {
  // L0: Secret redaction (always first)
  output = safeStage("redactSecrets", () => redactSecrets(output))

  // L7: Binary detection
  const binary = safeStage("detectAndHandleBinary", () => detectAndHandleBinary(output))
  if (binary?.binary) return binary.result

  // L8: Output suppression
  const suppressed = safeStage("suppressOversized", () => suppressOversized(output))
  if (suppressed?.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  output = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(output))

  // Short outputs pass through (after safety checks)
  if (shouldSkipFilter(output)) return output

  // L10: Whitespace/null cleanup
  output = safeStage("cleanWhitespaceAndNulls", () => cleanWhitespaceAndNulls(output))

  // L11: Key aliasing
  output = safeStage("aliasJsonKeys", () => aliasJsonKeys(output))

  // L24: Content-Aware Router
  const { pipeline } = routeContent(output)

  // L16: Diff/Log Folding
  if (pipeline.includes("diff-fold") || pipeline.includes("log-fold")) {
    output = await safeStageAsync("foldDiffAndLogs", () => foldDiffAndLogs(output))
  }

  // L15: JSON Statistical Sampling
  if (pipeline.includes("json-sample")) {
    const sampled = safeStage("sampleJson", () => sampleJson(output))
    if (sampled?.sampled) output = sampled.result
  }

  // L5: Family-based filtering
  const family = safeStage("detectFamily", () => detectFamily(command))
  let filtered: string

  switch (family) {
    case "git":
      filtered = safeStage("filterGitOutput", () => filterGitOutput(command, output))
      break
    case "npm":
      filtered = safeStage("filterNpmOutput", () => filterNpmOutput(command, output))
      break
    case "cargo":
      filtered = safeStage("filterCargoOutput", () => filterCargoOutput(command, output))
      break
    case "test":
      filtered = safeStage("filterTestOutput", () => filterTestOutput(command, output))
      break
    case "fs":
      filtered = safeStage("filterFsOutput", () => filterFsOutput(command, output))
      break
    default:
      filtered = safeStage("filterGeneric", () => filterGeneric(output))
  }

  // L16: Reversible Compression
  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(filtered))
  if (reversible?.compressed) {
    filtered = reversible.result
  }

  // L14: Auto-escalation
  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered))

  return conservativeFilter(output, filtered)
}

// ─── READ FILTER PIPELINE ───

async function applyReadFilter(filePath: string, content: string): Promise<string> {
  // Security: Validate file path
  const pathCheck = sanitizeFilePath(filePath, config.safeReadRoot)
  if (!pathCheck.safe) {
    return `[OpenToken] ${pathCheck.reason}`
  }

  // L0: Secret redaction
  content = safeStage("redactSecrets", () => redactSecrets(content))

  // Track file access
  trackFile(filePath)

  // Check cache
  const cached = await safeStageAsync("getCachedRead", () => getCachedRead(filePath))
  if (cached !== null) {
    return cached
  }

  // L7: Binary detection
  const binary = safeStage("detectAndHandleBinary", () => detectAndHandleBinary(content))
  if (binary?.binary) return binary.result

  // L8: Output suppression
  const suppressed = safeStage("suppressOversized", () => suppressOversized(content))
  if (suppressed?.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  content = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(content))

  // Short files pass through
  if (shouldSkipFilter(content)) {
    await safeStageAsync("setCachedRead", () => setCachedRead(filePath, content))
    return content
  }

  // L10: Whitespace/null cleanup
  content = safeStage("cleanWhitespaceAndNulls", () => cleanWhitespaceAndNulls(content))

  // L11: Key aliasing
  content = safeStage("aliasJsonKeys", () => aliasJsonKeys(content))

  // L24: Content-Aware Router
  const { pipeline } = routeContent(content, filePath)

  // L16: AST Skeleton Reads (if code file)
  if (pipeline.includes("skeleton") && content.split("\n").length > 50) {
    const skeleton = await safeStageAsync("extractSkeleton", () => extractSkeleton(filePath, content))
    if (skeleton) {
      content = skeleton
    }
  }

  // L15: JSON Statistical Sampling
  if (pipeline.includes("json-sample")) {
    const sampled = safeStage("sampleJson", () => sampleJson(content))
    if (sampled?.sampled) content = sampled.result
  }

  // L6: Read compression
  let filtered = safeStage("filterRead", () => filterRead(filePath, content))

  // L13: Progressive disclosure
  const disclosed = await safeStageAsync("progressiveDisclosure", () => progressiveDisclosure(filtered, "read"))
  if (disclosed) filtered = disclosed.result

  // L16: Reversible Compression
  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(filtered))
  if (reversible?.compressed) {
    filtered = reversible.result
  }

  // L14: Auto-escalation
  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered))

  // Cache the filtered result
  await safeStageAsync("setCachedRead", () => setCachedRead(filePath, filtered))

  return conservativeFilter(content, filtered)
}

// ─── GREP FILTER PIPELINE ───

async function applyGrepFilter(output: string): Promise<string> {
  // L0: Secret redaction
  output = safeStage("redactSecrets", () => redactSecrets(output))

  // L7: Binary detection
  const binary = safeStage("detectAndHandleBinary", () => detectAndHandleBinary(output))
  if (binary?.binary) return binary.result

  // L8: Output suppression
  const suppressed = safeStage("suppressOversized", () => suppressOversized(output))
  if (suppressed?.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  output = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(output))

  // Short outputs pass through
  if (shouldSkipFilter(output)) return output

  // L10: Whitespace/null cleanup
  output = safeStage("cleanWhitespaceAndNulls", () => cleanWhitespaceAndNulls(output))

  // L6: Grep compression
  let filtered = safeStage("filterGrep", () => filterGrep(output))

  // L13: Progressive disclosure
  const disclosed = await safeStageAsync("progressiveDisclosure", () => progressiveDisclosure(filtered, "grep"))
  if (disclosed) filtered = disclosed.result

  // L16: Reversible Compression
  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(filtered))
  if (reversible?.compressed) {
    filtered = reversible.result
  }

  // L14: Auto-escalation
  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered))

  return conservativeFilter(output, filtered)
}

// ─── GLOB FILTER PIPELINE ───

async function applyGlobFilter(output: string): Promise<string> {
  // L0: Secret redaction
  output = safeStage("redactSecrets", () => redactSecrets(output))

  // L8: Output suppression
  const suppressed = safeStage("suppressOversized", () => suppressOversized(output))
  if (suppressed?.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  output = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(output))

  // Short outputs pass through
  if (shouldSkipFilter(output)) return output

  // L6: Glob compression
  let filtered = safeStage("filterGlob", () => filterGlob(output))

  // L13: Progressive disclosure
  const disclosed = await safeStageAsync("progressiveDisclosure", () => progressiveDisclosure(filtered, "glob"))
  if (disclosed) filtered = disclosed.result

  // L16: Reversible Compression
  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(filtered))
  if (reversible?.compressed) {
    filtered = reversible.result
  }

  // L14: Auto-escalation
  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered))

  return conservativeFilter(output, filtered)
}

// ─── MAIN PLUGIN ───

export const OpenTokenPlugin: Plugin = async ({ directory }) => {
  // Load configuration
  await loadConfig(directory)

  // L38: Load previous session memory
  await safeStageAsync("loadSessionSummary", () => loadSessionSummary(directory))

  // L23: Load symbol index
  if (config.enableSymbolIndex) {
    await safeStageAsync("loadIndex", () => loadIndex())
  }

  return {
    // Session start — inject memory, reset state
    "session.created": async () => {
      resetDedup()
      resetEscalation()
      resetLSPState(directory)
      resetStatusLine()
      await safeStageAsync("cleanupOffloaded", () => cleanupOffloaded())
      await safeStageAsync("cleanupRewind", () => cleanupRewind())

      // Index codebase in background
      if (config.enableSymbolIndex) {
        indexDirectory(directory).then((stats) => {
          console.log(`[OpenToken] Indexed ${stats.filesIndexed} files, ${stats.totalSymbols} symbols`)
        }).catch((err) => {
          console.error(`[OpenToken] Symbol indexing failed: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
    },

    // Session end — save memory + show summary
    "session.deleted": async () => {
      const sessionTracker = getSessionTracker()
      console.log(generateSessionSummary(sessionTracker.tokensSaved, sessionTracker.toolCalls))
      await safeStageAsync("finalizeSession", () => finalizeSession(directory))
    },

    "session.idle": async () => {
      await safeStageAsync("finalizeSession", () => finalizeSession(directory))
    },

    // L1-L4 + L5: Pre-call interception
    "tool.execute.before": async (input: ToolInputBefore, output: ToolOutputBefore) => {
      try {
        const tool = validateToolName(input.tool)

        const result = preCallFilter(tool, output.args || {})

        if (result.blocked) {
          output.result = `[OpenToken blocked] ${result.reason}`
          output.error = result.reason
          return
        }

        if (result.modifiedArgs) {
          Object.assign(output.args ??= {}, result.modifiedArgs)
        }

        // L5: LSP-First Enforcement — block grep/glob for symbols
        if (tool === "grep" && typeof output.args?.pattern === "string") {
          const block = shouldBlockGrep(output.args.pattern)
          if (block.blocked) {
            output.result = `[OpenToken LSP-first] ${block.suggestion}`
            return
          }
        }

        if (tool === "glob" && typeof output.args?.pattern === "string") {
          const block = shouldBlockGlob(output.args.pattern)
          if (block.blocked) {
            output.result = `[OpenToken LSP-first] ${block.suggestion}`
            return
          }
        }

        // L5: Block shell grep for symbols
        if (tool === "bash" && typeof output.args?.command === "string") {
          const block = shouldBlockShellGrep(output.args.command)
          if (block.blocked) {
            output.result = `[OpenToken LSP-first] ${block.suggestion}`
            return
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[OpenToken] tool.execute.before error: ${msg}`)
      }
    },

    // L5-L24: Post-call interception
    "tool.execute.after": async (input: ToolInputAfter, output: ToolOutputAfter) => {
      try {
        if (!output.output) return

        // Security: Validate output size
        const sizeCheck = validateOutputSize(output.output)
        if (!sizeCheck.valid) {
          output.output = `[OpenToken] ${sizeCheck.reason}`
          return
        }

        const beforeTokens = safeEstimateTokens(output.output)
        let filtered = output.output
        const tool = validateToolName(input.tool)

        trackToolCall()
        trackLSPUsage(directory, tool)

        switch (tool) {
          case "bash": {
            const command = String(input.args?.command || "")
            filtered = await applyBashFilter(command, output.output)
            break
          }
          case "read": {
            const filePath = String(input.args?.filePath || "")
            filtered = await applyReadFilter(filePath, output.output)
            break
          }
          case "grep": {
            filtered = await applyGrepFilter(output.output)
            break
          }
          case "glob": {
            filtered = await applyGlobFilter(output.output)
            break
          }
          default:
            return // Don't touch other tools
        }

        // L12: Cross-call dedup
        const deduped = safeStage("deduplicate", () => deduplicate(filtered, tool))
        if (deduped) filtered = deduped.result

        const afterTokens = safeEstimateTokens(filtered)
        const saved = beforeTokens - afterTokens

        if (saved > 0) {
          trackTokensSaved(saved)
          updateContext(beforeTokens)

          const family = tool === "bash" ? detectFamily(String(input.args?.command || "")) : tool

          if (config.enableMetrics) {
            await safeStageAsync("recordMetric", () => recordMetric({
              ts: new Date().toISOString(),
              tool,
              family,
              before_tokens: beforeTokens,
              after_tokens: afterTokens,
              saved_pct: Math.round((saved / beforeTokens) * 100),
            }))
          }

          // Inject status line
          const sessionTracker = getSessionTracker()
          const status = generateStatusLine(saved, beforeTokens, sessionTracker.tokensSaved)
          if (status) {
            filtered += status.text
          }
        }

        output.output = filtered
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[OpenToken] tool.execute.after error: ${msg}`)
        // Never crash the pipeline — pass through original output
      }
    },
  }
}

export default OpenTokenPlugin
