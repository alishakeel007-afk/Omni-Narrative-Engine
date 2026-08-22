// Inventory management system with constraints

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  weight: number; // in kg
  maxStackSize: number;
  quantity: number;
}

export interface InventoryConstraints {
  maxSlots: number;
  maxWeight: number; // in kg
  allowDuplicates: boolean;
}

export const DEFAULT_INVENTORY_CONSTRAINTS: InventoryConstraints = {
  maxSlots: 20,
  maxWeight: 50,
  allowDuplicates: true
};

/**
 * Inventory manager with constraint checking
 */
export class InventoryManager {
  private items: InventoryItem[] = [];
  private constraints: InventoryConstraints;

  constructor(
    initialItems: InventoryItem[] = [],
    constraints: InventoryConstraints = DEFAULT_INVENTORY_CONSTRAINTS
  ) {
    this.items = initialItems;
    this.constraints = constraints;
  }

  /**
   * Get all items
   */
  getItems(): InventoryItem[] {
    return [...this.items];
  }

  /**
   * Get total weight of inventory
   */
  getTotalWeight(): number {
    return this.items.reduce((total, item) => total + item.weight * item.quantity, 0);
  }

  /**
   * Get number of filled slots
   */
  getFilledSlots(): number {
    return this.items.reduce((total, item) => total + Math.ceil(item.quantity / item.maxStackSize), 0);
  }

  /**
   * Check if inventory is full
   */
  isFull(): boolean {
    return this.getFilledSlots() >= this.constraints.maxSlots;
  }

  /**
   * Check if adding weight would exceed limit
   */
  canAddWeight(weight: number): boolean {
    return this.getTotalWeight() + weight <= this.constraints.maxWeight;
  }

  /**
   * Add item with validation
   */
  addItem(item: InventoryItem): {
    success: boolean;
    error?: string;
    remainingQuantity?: number;
  } {
    // Check max slots
    if (this.getFilledSlots() >= this.constraints.maxSlots && !this.hasItem(item.name)) {
      const remainingQuantity = item.quantity;
      return {
        success: false,
        error: `Inventory is full. Max ${this.constraints.maxSlots} slots.`,
        remainingQuantity
      };
    }

    // Check weight
    if (!this.canAddWeight(item.weight * item.quantity)) {
      const remainingQuantity = item.quantity;
      return {
        success: false,
        error: `Adding this item exceeds weight limit (${this.constraints.maxWeight}kg).`,
        remainingQuantity
      };
    }

    // Check duplicates
    if (!this.constraints.allowDuplicates && this.hasItem(item.name)) {
      return {
        success: false,
        error: `You already have ${item.name}.`
      };
    }

    // Try to stack with existing item
    const existingItem = this.items.find(i => i.name === item.name);
    if (existingItem) {
      existingItem.quantity += item.quantity;
      return { success: true };
    }

    // Add as new item
    this.items.push({ ...item });
    return { success: true };
  }

  /**
   * Remove item
   */
  removeItem(itemName: string, quantity: number = 1): {
    success: boolean;
    error?: string;
  } {
    const item = this.items.find(i => i.name === itemName);

    if (!item) {
      return {
        success: false,
        error: `Item "${itemName}" not found in inventory.`
      };
    }

    if (item.quantity < quantity) {
      return {
        success: false,
        error: `Not enough ${itemName}. Have ${item.quantity}, need ${quantity}.`
      };
    }

    item.quantity -= quantity;

    // Remove if empty
    if (item.quantity <= 0) {
      this.items = this.items.filter(i => i.name !== itemName);
    }

    return { success: true };
  }

  /**
   * Check if item exists
   */
  hasItem(itemName: string): boolean {
    return this.items.some(i => i.name === itemName);
  }

  /**
   * Get item by name
   */
  getItem(itemName: string): InventoryItem | undefined {
    return this.items.find(i => i.name === itemName);
  }

  /**
   * Use/consume item
   */
  useItem(itemName: string): {
    success: boolean;
    error?: string;
    item?: InventoryItem;
  } {
    const item = this.items.find(i => i.name === itemName);

    if (!item) {
      return {
        success: false,
        error: `Item "${itemName}" not found.`
      };
    }

    item.quantity -= 1;

    if (item.quantity <= 0) {
      this.items = this.items.filter(i => i.name !== itemName);
    }

    return {
      success: true,
      item
    };
  }

  /**
   * Get inventory status
   */
  getStatus() {
    return {
      itemCount: this.items.length,
      filledSlots: this.getFilledSlots(),
      maxSlots: this.constraints.maxSlots,
      totalWeight: this.getTotalWeight(),
      maxWeight: this.constraints.maxWeight,
      isFull: this.isFull(),
      weightPercentage: (this.getTotalWeight() / this.constraints.maxWeight) * 100
    };
  }

  /**
   * Clear inventory
   */
  clear() {
    this.items = [];
  }

  /**
   * Export inventory state
   */
  export() {
    return {
      items: this.items,
      constraints: this.constraints
    };
  }

  /**
   * Import inventory state
   */
  import(state: any) {
    if (Array.isArray(state?.items)) {
      this.items = state.items;
    }
    if (state?.constraints) {
      this.constraints = state.constraints;
    }
  }
}

/**
 * Create default inventory items
 */
export function createDefaultItems(): InventoryItem[] {
  return [
    {
      id: "map-1",
      name: "Ancient Map",
      description: "A weathered map of forgotten lands",
      rarity: "rare",
      weight: 0.5,
      maxStackSize: 1,
      quantity: 1
    },
    {
      id: "key-1",
      name: "Moon Key",
      description: "A mysterious silver key",
      rarity: "rare",
      weight: 0.2,
      maxStackSize: 1,
      quantity: 1
    },
    {
      id: "lantern-1",
      name: "Echo Lantern",
      description: "A lantern that glows with inner light",
      rarity: "uncommon",
      weight: 1,
      maxStackSize: 1,
      quantity: 1
    }
  ];
}

/**
 * Get rarity color for UI
 */
export function getRarityColor(rarity: string): string {
  const colors: Record<string, string> = {
    common: "text-white",
    uncommon: "text-green-400",
    rare: "text-blue-400",
    epic: "text-purple-400",
    legendary: "text-yellow-400"
  };
  return colors[rarity] || "text-white";
}

/**
 * Format item rarity for display
 */
export function formatRarity(rarity: string): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}
