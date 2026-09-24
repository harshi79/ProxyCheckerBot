/**
 * Per-user finite state machine for multi-step flows (set urls, remove url, admin prompts).
 * Transient (in-memory); a restart just returns users to idle.
 */
export type UserState =
  | "idle"
  | "awaiting_set_urls"
  | "awaiting_remove"
  | "awaiting_broadcast"
  | "awaiting_user_lookup"
  | "awaiting_dm_text"
  | "awaiting_ban_reason";

export interface StateData {
  state: UserState;
  targetUserId?: number;
}

const states = new Map<number, StateData>();

export function getState(userId: number): UserState {
  return states.get(userId)?.state ?? "idle";
}

export function getStateData(userId: number): StateData | undefined {
  return states.get(userId);
}

export function setState(userId: number, s: UserState, targetUserId?: number): void {
  if (s === "idle") {
    states.delete(userId);
  } else {
    states.set(userId, { state: s, targetUserId });
  }
}
