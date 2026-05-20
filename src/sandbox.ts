// Think-in-Code Sandbox — inspired by context-mode's ctx_execute
// When model wants to analyze N files, write a script that processes them
// Only stdout enters context. 200x reduction (700KB → 3.6KB).

import path from "path"
import os from "os"
import crypto from "crypto"

const SANDBOX_DIR = path.join(os.homedir(), ".config", "opentoken", "sandbox")

interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

// Generate a unique sandbox script ID
function generateScriptId(): string {
  return crypto.createHash("md5").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 8)
}

// Execute sandbox script
export async function executeSandbox(scriptPath: string, language: string): Promise<SandboxResult> {
  await ensureDir()

  const start = Date.now()
  let stdout = ""
  let stderr = ""
  let exitCode = 0

  try {
    const args = getRunCommand(language, scriptPath)
    const result = await Bun.spawn(args)
    stdout = (await new Response(result.stdout).text()) || ""
    stderr = (await new Response(result.stderr).text()) || ""
    exitCode = result.exitCode || 0
  } catch (error: any) {
    stderr = error.message || "Execution failed"
    exitCode = 1
  }

  const duration = Date.now() - start

  return { stdout, stderr, exitCode, duration }
}

// Smart analysis: determine what the model wants to do and create appropriate script
export function smartAnalysis(intent: string, files: string[]): {
  script: string
  scriptPath: string
  description: string
} {
  const intentLower = intent.toLowerCase()

  // Count functions/classes
  if (intentLower.includes("count") && (intentLower.includes("function") || intentLower.includes("class"))) {
    return createCountScript(files, intentLower.includes("class"))
  }

  // Find imports/dependencies
  if (intentLower.includes("import") || intentLower.includes("depend")) {
    return createImportScript(files)
  }

  // Find TODOs/fixmes
  if (intentLower.includes("todo") || intentLower.includes("fixme")) {
    return createTodoScript(files)
  }

  // Find errors/bugs
  if (intentLower.includes("error") || intentLower.includes("bug")) {
    return createErrorScript(files)
  }

  // Analyze complexity
  if (intentLower.includes("complex") || intentLower.includes("cyclomatic")) {
    return createComplexityScript(files)
  }

  // Default: generic file analysis
  return createGenericAnalysisScript(files)
}

// Create count script
function createCountScript(files: string[], countClasses: boolean): {
  script: string
  scriptPath: string
  description: string
} {
  const target = countClasses ? "classes" : "functions"
  const pattern = countClasses ? "class\\s+\\w+" : "(?:async\\s+)?(?:function|def|fn)\\s+\\w+"

  const script = `#!/bin/bash
# Count ${target} in files
total=0
for file in ${files.map((f) => `"${f}"`).join(" ")}; do
  if [ -f "$file" ]; then
    count=$(grep -cE "${pattern}" "$file" 2>/dev/null || echo 0)
    echo "$file: $count ${target}"
    total=$((total + count))
  fi
done
echo "Total: $total ${target} in ${files.length} files"
`

  return { script, scriptPath: "", description: `Count ${target} in ${files.length} files` }
}

// Create import script
function createImportScript(files: string[]): {
  script: string
  scriptPath: string
  description: string
} {
  const script = `#!/bin/bash
# Extract imports from files
for file in ${files.map((f) => `"${f}"`).join(" ")}; do
  if [ -f "$file" ]; then
    echo "=== $file ==="
    grep -E "^(import|from|require|#include|use)" "$file" 2>/dev/null || echo "(no imports)"
  fi
done
`

  return { script, scriptPath: "", description: `Extract imports from ${files.length} files` }
}

// Create TODO script
function createTodoScript(files: string[]): {
  script: string
  scriptPath: string
  description: string
} {
  const script = `#!/bin/bash
# Find TODOs/FIXMEs in files
for file in ${files.map((f) => `"${f}"`).join(" ")}; do
  if [ -f "$file" ]; then
    matches=$(grep -nE "(TODO|FIXME|HACK|XXX)" "$file" 2>/dev/null)
    if [ -n "$matches" ]; then
      echo "=== $file ==="
      echo "$matches"
    fi
  fi
done
`

  return { script, scriptPath: "", description: `Find TODOs/FIXMEs in ${files.length} files` }
}

// Create error script
function createErrorScript(files: string[]): {
  script: string
  scriptPath: string
  description: string
} {
  const script = `#!/bin/bash
# Find error patterns in files
for file in ${files.map((f) => `"${f}"`).join(" ")}; do
  if [ -f "$file" ]; then
    matches=$(grep -nE "(error|panic|fatal|throw|catch|except)" "$file" 2>/dev/null)
    if [ -n "$matches" ]; then
      echo "=== $file ==="
      echo "$matches"
    fi
  fi
done
`

  return { script, scriptPath: "", description: `Find error patterns in ${files.length} files` }
}

// Create complexity script
function createComplexityScript(files: string[]): {
  script: string
  scriptPath: string
  description: string
} {
  const script = `#!/bin/bash
# Analyze code complexity (lines per function)
for file in ${files.map((f) => `"${f}"`).join(" ")}; do
  if [ -f "$file" ]; then
    echo "=== $file ==="
    echo "Lines: $(wc -l < "$file")"
    echo "Functions: $(grep -cE "(function|def|fn)\\s+\\w+" "$file" 2>/dev/null || echo 0)"
  fi
done
`

  return { script, scriptPath: "", description: `Analyze complexity in ${files.length} files` }
}

// Create generic analysis script
function createGenericAnalysisScript(files: string[]): {
  script: string
  scriptPath: string
  description: string
} {
  const script = `#!/bin/bash
# Generic file analysis
for file in ${files.map((f) => `"${f}"`).join(" ")}; do
  if [ -f "$file" ]; then
    echo "=== $file ==="
    echo "Lines: $(wc -l < "$file")"
    echo "Size: $(du -h "$file" | cut -f1)"
    echo "Functions: $(grep -cE "(function|def|fn)\\s+\\w+" "$file" 2>/dev/null || echo 0)"
    echo "Classes: $(grep -cE "class\\s+\\w+" "$file" 2>/dev/null || echo 0)"
  fi
done
`

  return { script, scriptPath: "", description: `Generic analysis of ${files.length} files` }
}

// Helper functions
function getExtension(language: string): string {
  switch (language) {
    case "python": return ".py"
    case "node": return ".js"
    case "rust": return ".rs"
    case "go": return ".go"
    default: return ".sh"
  }
}

function getRunCommand(language: string, scriptPath: string): string[] {
  switch (language) {
    case "python": return ["python3", scriptPath]
    case "node": return ["node", scriptPath]
    case "rust": return ["bash", "-c", `rustc "${scriptPath}" -o "${scriptPath}.out" && "${scriptPath}.out"`]
    case "go": return ["go", "run", scriptPath]
    default: return ["bash", scriptPath]
  }
}

function createBashScript(task: string, files: string[]): string {
  return `#!/bin/bash\n# ${task}\nfor file in ${files.map((f) => `"${f}"`).join(" ")}; do\n  [ -f "$file" ] && echo "=== $file ===" && cat "$file"\ndone\n`
}

function createPythonScript(task: string, files: string[]): string {
  const filesList = files.map((f) => `"${f}"`).join(", ")
  return `import os\n\n# ${task}\nfiles = [${filesList}]\nfor f in files:\n    if os.path.exists(f):\n        print(f"=== {f} ===")\n        with open(f) as fh:\n            print(fh.read())\n`
}

function createNodeScript(task: string, files: string[]): string {
  const filesList = files.map((f) => `"${f}"`).join(", ")
  return `const fs = require('fs');\n\n// ${task}\nconst files = [${filesList}];\nfiles.forEach(f => {\n  if (fs.existsSync(f)) {\n    console.log('=== ' + f + ' ===');\n    console.log(fs.readFileSync(f, 'utf8'));\n  }\n});\n`
}

function createRustScript(task: string, files: string[]): string {
  return `// ${task}\nfn main() {\n    println!("Rust sandbox not yet implemented");\n}\n`
}

function createGoScript(task: string, files: string[]): string {
  return `// ${task}\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Go sandbox not yet implemented")\n}\n`
}

async function ensureDir(): Promise<void> {
  try {
    const dirExists = await Bun.file(SANDBOX_DIR).exists()
    if (!dirExists) {
      const proc = Bun.spawn(["mkdir", "-p", SANDBOX_DIR])
      await proc.exited
    }
  } catch {
    // Ignore
  }
}
