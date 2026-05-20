// LSP-First Enforcement — inspired by lsp-enforcement-kit
// Block Grep/Glob calls on code symbol patterns, force LSP tools instead
// 80% savings on navigation

import path from "path"
import os from "os"

interface LSPState {
  navCount: number
  readCount: number
  lastNavTime: number
  project: string
}

const LSP_STATE_DIR = path.join(os.homedir(), ".config", "opentoken", "lsp")
const lspStates = new Map<string, LSPState>()

// Detect if a grep query is looking for a code symbol
function isSymbolQuery(query: string): boolean {
  const patterns = [
    // CamelCase symbols: UserService, handleFoo, MyComponent
    /[A-Z][a-z]+[A-Z]\w*/,
    // Function-like: send_message, handle_request
    /\w+_\w+/,
    // Class-like: *Service, *Controller, *Handler
    /\*\w*(Service|Controller|Handler|Manager|Factory|Repository|Builder)\*/,
    // Method-like: *.handle*, *.get*, *.set*, *.create*
    /\*\w*(handle|get|set|create|update|delete|find|search)\w*\*/,
    // Specific patterns
    /class\s+\w+/,
    /function\s+\w+/,
    /def\s+\w+/,
    /fn\s+\w+/,
  ]

  return patterns.some((p) => p.test(query))
}

// Detect if a glob query is looking for a symbol file
function isSymbolGlob(query: string): boolean {
  const patterns = [
    // Looking for specific file patterns
    /\*Service\*/,
    /\*Controller\*/,
    /\*Handler\*/,
    /\*Manager\*/,
    /\*Factory\*/,
    /\*Repository\*/,
    // Looking for test files
    /\*test\*/,
    /\*spec\*/,
    // Looking for config files
    /\*config\*/,
    /\*settings\*/,
  ]

  return patterns.some((p) => p.test(query))
}

// Block Grep call if it's a symbol query
export function shouldBlockGrep(query: string): { blocked: boolean; suggestion?: string } {
  if (isSymbolQuery(query)) {
    return {
      blocked: true,
      suggestion: `Use LSP tools instead of grep for symbol "${query}":\n- find_definition("${query}")\n- find_references("${query}")\n- get_hover("${query}")`,
    }
  }

  return { blocked: false }
}

// Block Glob call if it's a symbol glob
export function shouldBlockGlob(query: string): { blocked: boolean; suggestion?: string } {
  if (isSymbolGlob(query)) {
    return {
      blocked: true,
      suggestion: `Use LSP workspace symbols instead of glob for "${query}":\n- find_workspace_symbols("${query}")`,
    }
  }

  return { blocked: false }
}

// Block shell grep/rg/ag commands
export function shouldBlockShellGrep(command: string): { blocked: boolean; suggestion?: string } {
  const grepPatterns = [
    /(?:grep|rg|ag|ack)\s+.*[A-Z][a-z]+[A-Z]/, // CamelCase
    /(?:grep|rg|ag|ack)\s+.*\w+_\w+/, // snake_case
    /(?:grep|rg|ag|ack)\s+.*class\s+\w+/, // class definition
    /(?:grep|rg|ag|ack)\s+.*function\s+\w+/, // function definition
    /(?:grep|rg|ag|ack)\s+.*def\s+\w+/, // Python function
  ]

  if (grepPatterns.some((p) => p.test(command))) {
    return {
      blocked: true,
      suggestion: "Use LSP tools instead of shell grep for code symbols",
    }
  }

  return { blocked: false }
}

// Track LSP usage
export function trackLSPUsage(project: string, tool: string): void {
  const state = lspStates.get(project) || {
    navCount: 0,
    readCount: 0,
    lastNavTime: 0,
    project,
  }

  if (tool.includes("find_") || tool.includes("get_")) {
    state.navCount++
  } else if (tool === "read") {
    state.readCount++
  }

  state.lastNavTime = Date.now()
  lspStates.set(project, state)
}

// Reset LSP state for new session
export function resetLSPState(project: string): void {
  lspStates.set(project, {
    navCount: 0,
    readCount: 0,
    lastNavTime: 0,
    project,
  })
}
