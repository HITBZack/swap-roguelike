import { supabase } from '../lib/supabase'

export type RewardResult = {
  run_completed: boolean
  rewarded: boolean
  item_id: string | null
  stacks_added: number | null
}

export async function completeRunAndMaybeReward(): Promise<RewardResult | null> {
  const { data, error } = await supabase.rpc('complete_active_run_with_reward', {})
  if (error) return null
  return data as RewardResult
}
