/**
 * ItemSystem
 * Item handling, equip logic, and stat aggregation.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface Item {
  id: string
  name: string
  rarity: Rarity
  type: 'weapon' | 'armor' | 'trinket'
  effectJson?: Record<string, unknown>
}

export interface EquipmentSlots {
  weapon?: Item
  armor?: Item
  trinket?: Item
}

export class ItemSystem {
  equip(slot: keyof EquipmentSlots, item: Item, eq: EquipmentSlots): EquipmentSlots {
    return { ...eq, [slot]: item }
  }

  unequip(slot: keyof EquipmentSlots, eq: EquipmentSlots): EquipmentSlots {
    const { [slot]: _removed, ...rest } = eq
    return { ...rest }
  }

  totalStats(_eq: EquipmentSlots): { attack: number; defense: number } {
    // TODO: compute from items. Placeholder returns flat base for now.
    return { attack: 5, defense: 2 }
  }
}
