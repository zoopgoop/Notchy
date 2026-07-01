import { Celebration } from "../types";

export interface PendingCelebration {
  celebration: Celebration;
  habitName: string;
  goalId: string;
  targetDate?: string;
}

let pending: PendingCelebration | null = null;

export function setPendingCelebration(data: PendingCelebration): void {
  pending = data;
}

export function takePendingCelebration(): PendingCelebration | null {
  const c = pending;
  pending = null;
  return c;
}

let pendingEncouragement = false;

export function setPendingEncouragement(): void {
  pendingEncouragement = true;
}

export function takePendingEncouragement(): boolean {
  const v = pendingEncouragement;
  pendingEncouragement = false;
  return v;
}
