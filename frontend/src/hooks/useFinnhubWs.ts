'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiUrl } from '@/lib/api-client';

interface FinnhubTradeData { s: string; p: number; t: number; v: number }
interface FinnhubMessage {
  type: 'trade' | 'ping' | 'error';
  data?: FinnhubTradeData[];
  msg?: string;
}

export function useFinnhubWs(
  symbols: string[],
  onTrade: (symbol: string, price: number, timestamp: number) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolsRef = useRef<string[]>([]);
  const onTradeRef = useRef(onTrade);
  onTradeRef.current = onTrade;

  const clearRetry = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const closeWs = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) {
      for (const sym of symbolsRef.current) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol: sym }));
      }
    }
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    closeWs();
    const httpUrl = apiUrl('/api/stocks/ws');
    const wsUrl = httpUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setConnected(true);
      for (const sym of symbolsRef.current) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: FinnhubMessage;
      try {
        msg = JSON.parse(event.data as string) as FinnhubMessage;
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (msg.type === 'trade' && msg.data) {
        for (const item of msg.data) {
          onTradeRef.current(item.s, item.p, item.t);
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (retryCountRef.current >= 5) {
        retryCountRef.current = 0;
        return;
      }
      const delay = Math.min(3000 * Math.pow(2, retryCountRef.current), 30000);
      retryCountRef.current++;
      retryTimerRef.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [closeWs]);

  const symbolsKey = symbols.join(',');

  useEffect(() => {
    if (symbols.length === 0) return;
    symbolsRef.current = symbols;

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      for (const sym of symbols) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      }
      return;
    }

    if (!ws) connect();
  }, [symbolsKey, symbols, connect]);

  useEffect(() => {
    return () => {
      clearRetry();
      closeWs();
    };
  }, [closeWs]);

  return { connected };
}
