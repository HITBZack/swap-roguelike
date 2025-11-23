import { supabase } from './supabase'

export type TradeStatus = 'pending' | 'active' | 'completed' | 'cancelled'

export type TradeDTO = {
  id: string
  user_a_id: string
  user_b_id: string
  status: TradeStatus
  a_ready: boolean
  b_ready: boolean
  created_at: string
  updated_at: string
}

export type TradeItemDTO = {
  id: string
  trade_id: string
  user_id: string
  item_id: string
  stacks: number
  created_at: string
}

export async function createTrade(otherUserId: string): Promise<TradeDTO | null> {
  if (!otherUserId) return null
  const { data, error } = await supabase.rpc('trade_create', { p_other_user: otherUserId })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  return row as TradeDTO
}

export async function acceptTrade(tradeId: string): Promise<TradeDTO | null> {
  if (!tradeId) return null
  const { data, error } = await supabase.rpc('trade_accept', { p_trade_id: tradeId })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  return row as TradeDTO
}

export async function setTradeItems(tradeId: string, items: Array<{ item_id: string; stacks: number }>): Promise<boolean> {
  if (!tradeId) return false
  const payload = items.map(it => ({ item_id: it.item_id, stacks: it.stacks }))
  const { error } = await supabase.rpc('trade_set_items', { p_trade_id: tradeId, p_items: payload })
  return !error
}

export async function setTradeReady(tradeId: string, ready: boolean): Promise<TradeDTO | null> {
  if (!tradeId) return null
  const { data, error } = await supabase.rpc('trade_set_ready', { p_trade_id: tradeId, p_ready: ready })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  return row as TradeDTO
}

export async function finalizeTrade(tradeId: string): Promise<TradeDTO | null> {
  if (!tradeId) return null
  const { data, error } = await supabase.rpc('trade_finalize', { p_trade_id: tradeId })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  return row as TradeDTO
}

export async function fetchMyOpenTrades(): Promise<{ trades: TradeDTO[]; items: TradeItemDTO[] }> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { trades: [], items: [] }

  const { data: trades, error: tradesErr } = await supabase
    .from('trades')
    .select('*')
    .in('status', ['pending', 'active'])
    .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`)
    .order('created_at', { ascending: false })

  if (tradesErr || !trades) return { trades: [], items: [] }

  const tradeIds = trades.map(t => t.id)
  if (!tradeIds.length) return { trades: trades as TradeDTO[], items: [] }

  const { data: items, error: itemsErr } = await supabase
    .from('trade_items')
    .select('*')
    .in('trade_id', tradeIds)
    .order('created_at', { ascending: true })

  if (itemsErr || !items) return { trades: trades as TradeDTO[], items: [] }

  return {
    trades: trades as TradeDTO[],
    items: items as unknown as TradeItemDTO[],
  }
}

export async function fetchTradeById(tradeId: string): Promise<{ trade: TradeDTO | null; items: TradeItemDTO[] }> {
  if (!tradeId) return { trade: null, items: [] }
  const { data: trade, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', tradeId)
    .maybeSingle()
  if (error || !trade) return { trade: null, items: [] }
  const { data: items, error: itemsErr } = await supabase
    .from('trade_items')
    .select('*')
    .eq('trade_id', tradeId)
    .order('created_at', { ascending: true })
  if (itemsErr || !items) return { trade: trade as TradeDTO, items: [] }
  return { trade: trade as TradeDTO, items: items as unknown as TradeItemDTO[] }
}
