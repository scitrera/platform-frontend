/* eslint-disable react-refresh/only-export-components */
/**
 * React context exposing the current auth token and status.
 * Components consume this via useAuth().
 * The eslint-disable above is intentional: this file exports both the
 * AuthProvider component and the useAuth hook — a standard React context pattern.
 */
import React, { createContext, useContext, useCallback, useEffect, useReducer } from 'react';
import { acquireToken, clearCache } from './msal';
import { DEFAULT_SCOPES } from '../lib/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

export interface AuthState {
  token: string | null;
  status: AuthStatus;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type AuthAction =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; token: string }
  | { type: 'ERROR'; error: string }
  | { type: 'LOGOUT' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, status: 'loading', error: null };
    case 'SUCCESS':
      return { token: action.token, status: 'authenticated', error: null };
    case 'ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'LOGOUT':
      return { token: null, status: 'idle', error: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    token: null,
    status: 'idle',
    error: null,
  });

  const refresh = useCallback(async () => {
    dispatch({ type: 'LOADING' });
    try {
      const token = await acquireToken(DEFAULT_SCOPES);
      dispatch({ type: 'SUCCESS', token });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'ERROR', error: message });
    }
  }, []);

  const logout = useCallback(async () => {
    await clearCache();
    dispatch({ type: 'LOGOUT' });
  }, []);

  // Auto-acquire on mount.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: AuthContextValue = { ...state, refresh, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
