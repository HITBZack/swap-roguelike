import { supabase } from '../lib/supabase'

export async function recordBattleStats(enemiesKilled: number, stageNumber: number): Promise<boolean> {
  const { error } = await supabase.rpc('record_battle_stats', { enemies_killed: enemiesKilled, stage_number: stageNumber })
  return !error
}

export async function recordChoiceStats(poorDelta: number): Promise<boolean> {
  const { error } = await supabase.rpc('record_choice_stats', { poor_delta: poorDelta })
  return !error
}
