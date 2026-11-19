import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../api/client.js';
import { DEFAULT_PREFERENCES } from '../utils/constants.js';

const AuthContext = createContext(null);

function loadLocalPrefs() {
  try {
    const raw = localStorage.getItem('cf_prefs');
    if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_PREFERENCES };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => getStoredToken());
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState(loadLocalPrefs);
  const [recoveryKeyModal, setRecoveryKeyModal] = useState('');

  const applyPrefsLocally = useCallback((nextPrefs) => {
    const merged = { ...DEFAULT_PREFERENCES, ...nextPrefs };
    setPrefs(merged);
    try {
      localStorage.setItem('cf_prefs', JSON.stringify(merged));
    } catch {
      // ignore
    }
    document.body.dataset.boardTheme = merged.boardTheme || 'imperial';
    document.body.classList.toggle('reduced-motion', Boolean(merged.reducedMotion));
    return merged;
  }, []);

  useEffect(() => {
    applyPrefsLocally(prefs);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiRequest('/api/me');
      if (data.user) {
        setUser(data.user);
        if (data.user.preferences) applyPrefsLocally(data.user.preferences);
        return data;
      }
    } catch {
      setUser(null);
      setToken('');
      setStoredToken('');
    } finally {
      setLoading(false);
    }
    return null;
  }, [applyPrefsLocally]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(async ({ username, password, rememberMe = true }) => {
    const data = await apiRequest('/api/login', {
      username,
      password,
      rememberMe,
      preferences: prefs,
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.user?.preferences) applyPrefsLocally(data.user.preferences);
    return data;
  }, [prefs, applyPrefsLocally]);

  const register = useCallback(async ({ username, password, rememberMe = true }) => {
    const data = await apiRequest('/api/register', {
      username,
      password,
      rememberMe,
      preferences: prefs,
      tutorialCompleted: localStorage.getItem('cf_tutorial_completed') === '1',
      tutorialPromptState: localStorage.getItem('cf_tutorial_prompt') || 'pending',
    });
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.recoveryKey) setRecoveryKeyModal(data.recoveryKey);
    return data;
  }, [prefs]);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/logout', {});
    } catch {
      // ignore
    }
    setStoredToken('');
    setToken('');
    setUser(null);
  }, []);

  const savePreferences = useCallback(async (patch) => {
    const next = applyPrefsLocally({ ...prefs, ...patch });
    if (token && user) {
      try {
        const res = await apiRequest('/api/profile/preferences', { preferences: next });
        if (res.user) setUser(res.user);
      } catch {
        // local preference still saved
      }
    }
    return next;
  }, [prefs, token, user, applyPrefsLocally]);

  const updateProfile = useCallback(async (payload) => {
    const data = await apiRequest('/api/profile/update', payload);
    if (data.user) setUser(data.user);
    return data;
  }, []);

  const expireAuth = useCallback(() => {
    setStoredToken('');
    setToken('');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        token,
        loading,
        prefs,
        savePreferences,
        login,
        register,
        logout,
        refreshMe,
        updateProfile,
        expireAuth,
        recoveryKeyModal,
        setRecoveryKeyModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
