import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setToken, setExpiredHandler } from './api';
import { stopTracking } from './tracker';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const entrar = async (data) => {
    setToken(data.token);
    setUser(data.user);
    await AsyncStorage.setItem('sesion', JSON.stringify(data));
  };
  const salir = async () => {
    stopTracking();
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem('sesion');
  };

  useEffect(() => {
    setExpiredHandler(salir);
    (async () => {
      try {
        const s = JSON.parse((await AsyncStorage.getItem('sesion')) || 'null');
        if (s) { setToken(s.token); setUser(s.user); }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (email, password) => entrar(await api('/auth/login', 'POST', { email, password }));
  const registro = async (datos) => entrar(await api('/auth/registro', 'POST', datos));

  return <Ctx.Provider value={{ user, loading, login, registro, salir }}>{children}</Ctx.Provider>;
}
