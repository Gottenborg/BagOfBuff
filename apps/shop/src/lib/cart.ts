import { useSyncExternalStore } from "react";

export interface CartItem {
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  qty: number;
}

const STORAGE_KEY = "bob.cart";

// Module-level store backed by localStorage, exposed via useSyncExternalStore
// so any component can read the cart without a provider (keeps SSR simple).
let items: CartItem[] = load();
const listeners = new Set<() => void>();
// Stable empty reference for the server snapshot to avoid hydration churn.
const SERVER_SNAPSHOT: CartItem[] = [];

function load(): CartItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as CartItem[];
  } catch {
    return [];
  }
}

function commit(next: CartItem[]) {
  items = next;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addToCart(item: Omit<CartItem, "qty">, qty = 1) {
  const existing = items.find((i) => i.slug === item.slug);
  if (existing) {
    commit(
      items.map((i) => (i.slug === item.slug ? { ...i, qty: i.qty + qty } : i)),
    );
  } else {
    commit([...items, { ...item, qty }]);
  }
}

export function removeFromCart(slug: string) {
  commit(items.filter((i) => i.slug !== slug));
}

export function useCart(): CartItem[] {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => SERVER_SNAPSHOT,
  );
}

export function useCartCount(): number {
  return useCart().reduce((sum, i) => sum + i.qty, 0);
}
