// Reversible Compression — inspired by claw-compactor's RewindStore
// Aggressively compress content but store originals in hash-addressed store
// LLM can retrieve any compressed section by its marker ID

import path from "path"
import os from "os"
import crypto from "crypto"

const REWIND_DIR = path.join(os.homedir(), ".config", "opentoken", "rewind")
const MAX_COMPRESSED_SIZE = 50 * 1024 // 50KB — compress anything larger

interface RewindEntry {
  id: string
  original: string
  compressed: string
  marker: string
  timestamp: number
  size: number
  compressedSize: number
}

const rewindStore = new Map<string, RewindEntry>()
let rewindCounter = 0

// Generate a unique rewind ID
function generateId(): string {
  rewindCounter++
  const hash = crypto.createHash("md5").update(`${Date.now()}-${rewindCounter}`).digest("hex").slice(0, 8)
  return `rw-${hash}`
}

// Compress content and store original
export async function compressAndStore(content: string): Promise<{
  compressed: string
  marker: string
  entryId: string
  compressionRatio: number
}> {
  await ensureDir()

  const id = generateId()
  const marker = `[COMPRESSED:${id}]`

  // Store the original
  const entry: RewindEntry = {
    id,
    original: content,
    compressed: compressContent(content),
    marker,
    timestamp: Date.now(),
    size: content.length,
    compressedSize: 0,
  }

  await Bun.write(path.join(REWIND_DIR, `${id}.txt`), content)

  // Calculate compressed size
  entry.compressedSize = entry.compressed.length
  rewindStore.set(id, entry)

  const compressionRatio = content.length > 0
    ? Math.round((1 - entry.compressedSize / content.length) * 100)
    : 0

  return {
    compressed: entry.compressed,
    marker,
    entryId: id,
    compressionRatio,
  }
}

// Retrieve original content by marker ID
export async function retrieveCompressed(id: string): Promise<string | null> {
  // Check in-memory store first
  const entry = rewindStore.get(id)
  if (entry) return entry.original

  // Check on-disk store
  try {
    const filePath = path.join(REWIND_DIR, `${id}.txt`)
    const file = Bun.file(filePath)
    if (await file.exists()) {
      const content = await file.text()
      // Re-add to in-memory store
      rewindStore.set(id, {
        id,
        original: content,
        compressed: compressContent(content),
        marker: `[COMPRESSED:${id}]`,
        timestamp: Date.now(),
        size: content.length,
        compressedSize: 0,
      })
      return content
    }
  } catch {
    // File not found
  }

  return null
}

// Compress content (simple compression strategies)
function compressContent(content: string): string {
  const lines = content.split("\n")

  // Strategy 1: Remove blank lines
  const noBlanks = lines.filter((l) => l.trim() !== "")

  // Strategy 2: Truncate long lines
  const truncated = noBlanks.map((l) => (l.length > 200 ? l.slice(0, 200) + "..." : l))

  // Strategy 3: Remove comments (for code)
  const noComments = truncated.filter((l) => {
    const trimmed = l.trim()
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
      return false
    }
    return true
  })

  // Return the most aggressive compression that still preserves structure
  if (noComments.length < lines.length * 0.5) {
    return noComments.join("\n")
  }

  return truncated.join("\n")
}

// Apply reversible compression to content
export async function applyReversibleCompression(content: string): Promise<{
  result: string
  compressed: boolean
  entryId?: string
}> {
  if (content.length < MAX_COMPRESSED_SIZE) {
    return { result: content, compressed: false }
  }

  const { compressed, marker, entryId, compressionRatio } = await compressAndStore(content)

  return {
    result: `${marker} (${compressionRatio}% compressed, ${Math.round(content.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB)\n\n${compressed}\n\nUse "opentoken rewind ${entryId}" to retrieve full content.`,
    compressed: true,
    entryId,
  }
}

// Clean up old rewind entries
export async function cleanupRewind(maxAgeMs = 3600000): Promise<number> {
  let cleaned = 0
  const now = Date.now()

  for (const [id, entry] of rewindStore.entries()) {
    if (now - entry.timestamp > maxAgeMs) {
      try {
        const filePath = path.join(REWIND_DIR, `${id}.txt`)
        await Bun.file(filePath).exists() && await Bun.$`rm -f ${filePath}`.quiet()
      } catch {
        // Ignore
      }
      rewindStore.delete(id)
      cleaned++
    }
  }

  return cleaned
}

// Get rewind stats
export function getRewindStats(): { total: number; totalSaved: number } {
  let totalSaved = 0
  for (const entry of rewindStore.values()) {
    totalSaved += entry.size - entry.compressedSize
  }
  return { total: rewindStore.size, totalSaved }
}

async function ensureDir(): Promise<void> {
  try {
    await Bun.file(REWIND_DIR).exists() || await Bun.$`mkdir -p ${REWIND_DIR}`.quiet()
  } catch {
    // Ignore
  }
}
