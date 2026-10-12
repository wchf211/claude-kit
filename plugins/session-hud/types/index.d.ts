export type HintKind = 'compact' | 'handoff' | 'reflect'

export type Hint = { kind: HintKind; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'session-hud': {
      hints: Hint[]
      reflectReason: string | null
      snoozedUntil: number
      busy: string | null
      isHidden: boolean
    }
  }
}
