import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, setUser, expireAuth } = useAuth();
  const { showToast } = useToast();
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const listenersRef = useRef(new Set());
  const [wsReady, setWsReady] = useState(false);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const sendSocket = useCallback((type, payload = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
      return true;
    }
    showToast('Conectando ao servidor em tempo real... tente em instantes.', 'warn');
    return false;
  }, [showToast]);

  useEffect(() => {
    clearTimeout(reconnectRef.current);
    if (!token) {
      setWsReady(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      if (wsRef.current && [WebSocket.OPEN, WebSocket.CONNECTING].includes(wsRef.current.readyState)) return;
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${scheme}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      });

      ws.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'auth:ok') {
          setWsReady(true);
          if (msg.user) setUser(msg.user);
        } else if (msg.type === 'profile:stats' && msg.user) {
          setUser(msg.user);
        } else if (msg.type === 'notice' && msg.message) {
          showToast(msg.message);
        } else if (msg.type === 'error') {
          if (msg.message) showToast(msg.message, 'error');
          if (msg.code === 'AUTH_EXPIRED') {
            expireAuth();
          }
        }
        for (const fn of listenersRef.current) {
          fn(msg);
        }
      });

      ws.addEventListener('close', () => {
        setWsReady(false);
        wsRef.current = null;
        if (!cancelled && token) {
          reconnectRef.current = setTimeout(connect, 2400);
        }
      });
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsReady(false);
    };
  }, [token, setUser, showToast, expireAuth]);

  return (
    <SocketContext.Provider value={{ wsReady, sendSocket, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
