export type HudUsage = {
  percent: number | null
  tokens: number | null
  window: number
  fiveHour: number | null
  sevenDay: number | null
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'session-hud': {
      now: number
      lastReplyAt: number | null
      usage: HudUsage | null
      busy: string | null
      isHidden: boolean
    }
  }
}
