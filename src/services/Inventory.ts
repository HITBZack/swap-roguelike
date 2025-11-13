import { supabase } from '../lib/supabase'
import type { ItemInstance } from './items/types'

export type InventoryItem = {
  id: string // item_id (catalog id)
  stacks: number
}

export async function clearLoadout(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return false
  const { error } = await supabase
    .from('loadout_items')
    .delete()
    .eq('user_id', uid)
  return !error
}

export async function listInventory(): Promise<InventoryItem[]> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []
  const { data, error } = await supabase
    .from('inventory_items')
    .select('item_id, stacks')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map((r: any) => ({ id: r.item_id as string, stacks: (r.stacks as number) ?? 1 }))
}

export async function listLoadout(): Promise<ItemInstance[]> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []
  const { data, error } = await supabase
    .from('loadout_items')
    .select('item_id, stacks')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map((r: any) => ({ id: r.item_id as string, stacks: (r.stacks as number) ?? 1 }))
}

export async function setLoadout(items: ItemInstance[]): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return false
  // Clear then insert; RLS ensures only owner can mutate
  const del = await supabase.from('loadout_items').delete().eq('user_id', uid)
  if (del.error) return false
  if (items.length === 0) return true
  const payload = items.map(it => ({ user_id: uid, item_id: it.id, stacks: it.stacks }))
  const ins = await supabase.from('loadout_items').insert(payload)
  return !ins.error
}

export async function equipItem(itemId: string, stacks = 1): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return false
  // Try read existing to merge stacks to avoid conflicts
  const existing = await supabase
    .from('loadout_items')
    .select('stacks')
    .eq('user_id', uid)
    .eq('item_id', itemId)
    .maybeSingle()
  const total = (existing.data?.stacks ?? 0) + stacks
  const { error } = await supabase
    .from('loadout_items')
    .upsert({ user_id: uid, item_id: itemId, stacks: total }, { onConflict: 'user_id,item_id' })
  return !error
}

export async function unequipItem(itemId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return false
  const { error } = await supabase
    .from('loadout_items')
    .delete()
    .eq('user_id', uid)
    .eq('item_id', itemId)
  return !error
}

export async function decrementLoadout(itemId: string, amount = 1): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return false
  const existing = await supabase
    .from('loadout_items')
    .select('stacks')
    .eq('user_id', uid)
    .eq('item_id', itemId)
    .maybeSingle()
  const curr = existing.data?.stacks ?? 0
  if (curr <= 0) return true
  const next = curr - amount
  if (next <= 0) {
    const del = await supabase
      .from('loadout_items')
      .delete()
      .eq('user_id', uid)
      .eq('item_id', itemId)
    return !del.error
  } else {
    const upd = await supabase
      .from('loadout_items')
      .update({ stacks: next })
      .eq('user_id', uid)
      .eq('item_id', itemId)
    return !upd.error
  }
}
