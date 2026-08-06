import { useSyncExternalStore } from "react";

/**
 * Cookie/analytics consent. Essential cookies (cart, checkout, Stripe) always
 * run; non-essential analytics load only after explicit acceptance. Stored in
 * localStorage so the choice persists without a server or a tracking cookie.
 */
export type Consent = "accepted" | "rejected" | null;

const STORAGE_KEY = "bob.consent";
const listeners = new Set<() => void>();

function read(): Consent {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "accepted" || v === "rejected" ? v : null;
}

export function setConsent(value: Exclude<Consent, null>) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, value);
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConsent(): Consent {
  return useSyncExternalStore(subscribe, read, () => null);
}
