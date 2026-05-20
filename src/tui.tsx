/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiSlotContext, TuiTheme } from "@opencode-ai/plugin/tui"
import type { Event } from "@opencode-ai/sdk/v2"
import { createSignal, onCleanup, onMount } from "solid-js"
import path from "path"
import os from "os"

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken")
const SESSION_FILE = path.join(METRICS_DIR, "session-memory.json")
const SUMMARY_FILE = path.join(METRICS_DIR, "stats-summary.json")

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1000000).toFixed(1)}M`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

async function readSessionMemory(): Promise<{ tokensSaved: number; toolCalls: number } | null> {
  try {
    const file = Bun.file(SESSION_FILE)
    if (await file.exists()) {
      const data = JSON.parse(await file.text())
      return { tokensSaved: data.tokensSaved ?? 0, toolCalls: data.toolCalls ?? 0 }
    }
  } catch {
    // ignore
  }
  return null
}

async function readStatsSummary(): Promise<{ totalSavedTokens: number; totalCalls: number } | null> {
  try {
    const file = Bun.file(SUMMARY_FILE)
    if (await file.exists()) {
      const data = JSON.parse(await file.text())
      return {
        totalSavedTokens: data.session?.totalSavedTokens ?? 0,
        totalCalls: data.session?.totalCalls ?? 0,
      }
    }
  } catch {
    // ignore
  }
  return null
}

function StatusBarWidget(props: { theme: TuiTheme }) {
  const [display, setDisplay] = createSignal("")

  let clockInterval: ReturnType<typeof setInterval>
  let metricsInterval: ReturnType<typeof setInterval>

  function buildDisplay(): string {
    const tokensSaved = 0 // Will be updated by metrics polling
    const time = formatTime(new Date())
    return ` opentoken   ${time}`
  }

  async function loadMetrics() {
    const session = await readSessionMemory()
    const stats = await readStatsSummary()
    const saved = session?.tokensSaved ?? stats?.totalSavedTokens ?? 0
    const time = formatTime(new Date())

    const text = saved > 0
      ? ` opentoken  saved ${formatTokens(saved)} tokens   ${time}`
      : ` opentoken   ${time}`

    setDisplay(text)
  }

  onMount(() => {
    setDisplay(buildDisplay())
    loadMetrics()
    metricsInterval = setInterval(loadMetrics, 5000)
  })

  onCleanup(() => {
    clearInterval(metricsInterval)
  })

  return (
    <text fg={props.theme.current.text}>{display()}</text>
  )
}

const plugin: TuiPlugin = async (api, _options, _meta) => {
  // Track session state for event-driven updates
  const [sessionStart, setSessionStart] = createSignal<number | null>(null)

  api.event.on("session.created", () => {
    setSessionStart(Date.now())
  })

  api.event.on("session.deleted", () => {
    setSessionStart(null)
  })

  // Use session_prompt_right slot — proven by opencodeBar reference plugin
  api.slots.register({
    order: 50,
    slots: {
      session_prompt_right(ctx: TuiSlotContext, _props: { session_id: string }) {
        return <StatusBarWidget theme={ctx.theme} />
      },
    },
  })

  api.lifecycle.onDispose(() => {
    // cleanup handled by Solid.js onCleanup
  })
}

const pluginModule: { id: string; tui: TuiPlugin } = {
  id: "opentoken",
  tui: plugin,
}

export default pluginModule
