"use client";

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';

type EventCallback = (payload: any) => void;

interface WebSocketContextType {
  isConnected: boolean;
  subscribe: (eventType: string, callback: EventCallback) => () => void;
  sendMessage: (eventType: string, payload: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<{ [eventType: string]: Set<EventCallback> }>({});

  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connectWs = () => {
      // Build the WS URL — support explicit NEXT_PUBLIC_WS_URL or derive from API URL
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const wsBase = process.env.NEXT_PUBLIC_WS_URL || apiBase.replace(/^http/, 'ws');
      // Pass the Bearer token as a query param (cookies are not sent with WS from cross-origin)
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const wsUrl = token ? `${wsBase}/ws?token=${token}` : `${wsBase}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket Connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { type, payload } = data;
          
          if (type && subscribersRef.current[type]) {
            subscribersRef.current[type].forEach(cb => cb(payload));
          }
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket Disconnected');
        setIsConnected(false);
        // Basic reconnect logic
        setTimeout(() => {
          if (user && wsRef.current === ws) connectWs();
        }, 3000);
      };
      
      ws.onerror = (err) => {
        // Suppress empty errors typically caused by React StrictMode unmounting
        // or intentional disconnections before the handshake completes.
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
          console.error("WebSocket Error:", err);
        }
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user]);

  const subscribe = (eventType: string, callback: EventCallback) => {
    if (!subscribersRef.current[eventType]) {
      subscribersRef.current[eventType] = new Set();
    }
    subscribersRef.current[eventType].add(callback);

    return () => {
      if (subscribersRef.current[eventType]) {
        subscribersRef.current[eventType].delete(callback);
      }
    };
  };

  const sendMessage = (eventType: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: eventType, payload }));
    }
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
