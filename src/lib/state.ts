import { create, type StateCreator, type SetState } from 'zustand'

/**
 * Global app state via Zustand.
 * Keep UI and logic separate; this store is safe for Phaser and any UI layer.
 */
export interface PlayerState {
  id: string | null
  username: string | null
  level: number
  avatarUrl?: string | null
}

export interface RunState {
  seed: string | null
  biome: string | null
  stage: number
  isActive: boolean
}

export interface UIState {
  loading: boolean
  error: string | null
  needUsername?: boolean
}

export interface AppState {
  player: PlayerState
  run: RunState
  ui: UIState
  setPlayer: (p: Partial<PlayerState>) => void
  setRun: (r: Partial<RunState>) => void
  setUi: (u: Partial<UIState>) => void
}

const creator: StateCreator<AppState> = (set: SetState<AppState>) => ({
  player: { id: null, username: null, level: 1, avatarUrl: null },
  run: { seed: null, biome: null, stage: 1, isActive: false },
  ui: { loading: false, error: null, needUsername: false },
  setPlayer: (p: Partial<PlayerState>) => set((s: AppState) => ({ player: { ...s.player, ...p } })),
  setRun: (r: Partial<RunState>) => set((s: AppState) => ({ run: { ...s.run, ...r } })),
  setUi: (u: Partial<UIState>) => set((s: AppState) => ({ ui: { ...s.ui, ...u } }))
})

export const useAppState = create<AppState>(creator)

export type { AppState as TAppState }
