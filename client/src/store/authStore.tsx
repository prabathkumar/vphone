/**
 * Auth store — JWT token in EncryptedStorage (AES-256 on Android, Keychain on iOS).
 * Uses React Context + useReducer; no third-party state library required.
 */
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import EncryptedStorage from 'react-native-encrypted-storage';
import {API_URL} from '../config';

const TOKEN_KEY = 'vphone_jwt';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  token: string | null;
  error: string | null;
}

type AuthAction =
  | {type: 'LOADING'}
  | {type: 'SET_USER'; userId: string; token: string}
  | {type: 'LOGOUT'}
  | {type: 'ERROR'; error: string};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: AuthState = {
  status: 'loading',
  userId: null,
  token: null,
  error: null,
};

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOADING':
      return {...state, status: 'loading', error: null};
    case 'SET_USER':
      return {
        status: 'authenticated',
        userId: action.userId,
        token: action.token,
        error: null,
      };
    case 'LOGOUT':
      return {status: 'unauthenticated', userId: null, token: null, error: null};
    case 'ERROR':
      return {...state, status: 'unauthenticated', error: action.error};
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextValue extends AuthState {
  login: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({children}: {children: ReactNode}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Restore token on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await EncryptedStorage.getItem(TOKEN_KEY);
        if (!token) {
          dispatch({type: 'LOGOUT'});
          return;
        }
        // Verify token against server
        const res = await fetch(`${API_URL}/auth/me`, {
          headers: {Authorization: `Bearer ${token}`},
        });
        if (res.ok) {
          const data = await res.json();
          dispatch({type: 'SET_USER', userId: data.userId, token});
        } else {
          await EncryptedStorage.removeItem(TOKEN_KEY);
          dispatch({type: 'LOGOUT'});
        }
      } catch {
        // Network offline — keep token, mark authenticated optimistically
        const token = await EncryptedStorage.getItem(TOKEN_KEY).catch(() => null);
        if (token) {
          dispatch({type: 'SET_USER', userId: 'offline', token});
        } else {
          dispatch({type: 'LOGOUT'});
        }
      }
    })();
  }, []);

  const login = useCallback(async (userId: string) => {
    dispatch({type: 'LOADING'});
    try {
      const res = await fetch(`${API_URL}/auth/dev-login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userId}),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      await EncryptedStorage.setItem(TOKEN_KEY, data.token);
      dispatch({type: 'SET_USER', userId: data.userId, token: data.token});
    } catch (e: any) {
      dispatch({type: 'ERROR', error: e.message ?? 'Login failed'});
    }
  }, []);

  const logout = useCallback(async () => {
    await EncryptedStorage.removeItem(TOKEN_KEY);
    dispatch({type: 'LOGOUT'});
  }, []);

  const getToken = useCallback(() => state.token, [state.token]);

  return (
    <AuthContext.Provider value={{...state, login, logout, getToken}}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
