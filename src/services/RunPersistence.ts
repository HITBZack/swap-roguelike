import { supabase } from '../lib/supabase'
import type { StagePlan } from './GameManager'
import type { ItemInstance } from './items/types'

export type RunStatus = 'active' | 'completed' | 'failed'

export type RunRecord = {
  id: string
  user_id: string
  seed: string
  biome_index: number
  stage_index: number
  stage_plan: any
  status: RunStatus
  created_at: string
  updated_at: string
}

export async function fetchActiveRun(): Promise<RunRecord | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data } = await supabase
    .from('runs')
    .select('*')
    .eq('user_id', uid)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
  const row = data?.[0] as RunRecord | undefined
  return row ?? null
}

export async function createRun(seed: string, biomeIndex: number, stageIndex: number, stagePlan: StagePlan): Promise<RunRecord | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('runs')
    .insert({ user_id: uid, seed, biome_index: biomeIndex, stage_index: stageIndex, stage_plan: stagePlan, status: 'active' })
    .select('*')
    .single()
  if (error) return null
  return data as RunRecord
}

export async function updateRunProgress(runId: string, biomeIndex: number, stageIndex: number, stagePlan: StagePlan, status: RunStatus = 'active'): Promise<RunRecord | null> {
  const { data, error } = await supabase
    .from('runs')
    .update({ biome_index: biomeIndex, stage_index: stageIndex, stage_plan: stagePlan, status })
    .eq('id', runId)
    .select('*')
    .single()
  if (error) return null
  return data as RunRecord
}

export async function listRunItems(runId: string): Promise<ItemInstance[]> {
  const { data, error } = await supabase
    .from('run_items')
    .select('item_id, stacks')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map((r: any) => ({ id: r.item_id as string, stacks: (r.stacks as number) ?? 1 }))
}

export async function insertRunItems(runId: string, items: ItemInstance[]): Promise<boolean> {
  if (items.length === 0) return true
  const payload = items.map(it => ({ run_id: runId, item_id: it.id, stacks: it.stacks }))
  const { error } = await supabase.from('run_items').insert(payload)
  return !error
}

export async function replaceRunItems(runId: string, items: ItemInstance[]): Promise<boolean> {
  // Clear existing
  const del = await supabase.from('run_items').delete().eq('run_id', runId)
  if (del.error) return false
  if (items.length === 0) return true
  const payload = items.map(it => ({ run_id: runId, item_id: it.id, stacks: it.stacks }))
  const ins = await supabase.from('run_items').insert(payload)
  return !ins.error
}
