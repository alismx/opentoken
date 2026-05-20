// Fast token estimation: chars × 0.25 (~80-85% accuracy vs tiktoken)

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length * 0.25)
}
