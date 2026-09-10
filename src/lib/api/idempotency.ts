"use client";

import { useRef } from "react";

/**
 * PRD §13.3 — "The client creates a request UUID when an action begins and
 * reuses it until the result is known... Never automatically generate a new
 * key." A fresh key on retry is exactly what turns one lost response into two
 * orders, so the key lives here and only `reset` throws it away.
 *
 * `scope` names the action and its target, e.g. `handover:${orderId}`, so two
 * actions in the same page never share a key and a retry of one never carries
 * the payload hash of another.
 *
 *   const idem = useIdempotencyKey();
 *   await apiFetch(url, { method: "POST", idempotencyKey: idem.key(scope) });
 *   idem.reset(scope); // only once the result is known
 */
export function useIdempotencyKey() {
  const keys = useRef<Map<string, string>>(new Map());

  return {
    /** The key for this attempt — identical on every retry until `reset`. */
    key(scope: string): string {
      const existing = keys.current.get(scope);
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      keys.current.set(scope, fresh);
      return fresh;
    },
    /** Call when the result is known, so the next action starts a new key. */
    reset(scope: string): void {
      keys.current.delete(scope);
    },
  };
}
