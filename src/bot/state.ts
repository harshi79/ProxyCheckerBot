/**
 * Per-user finite state machine for multi-step flows (set urls, remove url).
 * Transient (in-memory); a restart just returns users to idle.
 */
export type UserState = "idle" | "awaiting_set_urls" | "awaiting_remove";

const states = new Map<number, UserState>();

export function getState(userId: number): UserState {
  return states.get(userId) ?? "idle";
}

export function setState(userId: number, s: UserState): void {
  if (s === "idle") states.delete(userId);
  else states.set(userId, s);
}
