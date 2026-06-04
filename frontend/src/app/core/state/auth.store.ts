import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { PublicUser } from '../models/api.models';

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'anonymous';

interface AuthState {
  /** Short-lived access token — kept in memory only (never localStorage). */
  accessToken: string | null;
  user: PublicUser | null;
  permissions: string[];
  modules: Record<string, boolean>;
  branchId: string | null;
  status: AuthStatus;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  permissions: [],
  modules: {},
  branchId: null,
  status: 'idle',
};

export interface SessionPayload {
  accessToken: string;
  user: PublicUser;
  permissions: string[];
  modules: Record<string, boolean>;
  branchId: string | null;
}

/**
 * Global auth/session state (@ngrx/signals). Holds the in-memory access token,
 * the current user, and the effective permission snapshot + enabled modules used
 * by the ACL directive/guards and the sidebar.
 */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ status }) => ({
    isAuthenticated: computed(() => status() === 'authenticated'),
  })),
  withMethods((store) => ({
    setSession(payload: SessionPayload): void {
      patchState(store, { ...payload, status: 'authenticated' });
    },
    setToken(accessToken: string): void {
      patchState(store, { accessToken });
    },
    setStatus(status: AuthStatus): void {
      patchState(store, { status });
    },
    setAnonymous(): void {
      patchState(store, { ...initialState, status: 'anonymous' });
    },
    /** Replace the permission snapshot (e.g. after a server-side role change). */
    setPermissions(permissions: string[]): void {
      patchState(store, { permissions });
    },
    hasPermission(key: string): boolean {
      return store.permissions().includes(key);
    },
    hasAnyPermission(keys: string[]): boolean {
      const current = store.permissions();
      return keys.some((k) => current.includes(k));
    },
    isModuleEnabled(name: string): boolean {
      return store.modules()[name] === true;
    },
  })),
);
