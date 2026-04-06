let ws: WebSocket | null = null;
const handlers: Map<string, Set<(data: unknown) => void>> = new Map();

function dispatch(eventType: string, data: unknown): void {
  const set = handlers.get(eventType);
  if (!set) return;
  set.forEach((handler) => {
    try {
      handler(data);
    } catch (error) {
      console.error(`[socket] handler error for "${eventType}":`, error);
    }
  });
}

export function connect(token: string): void {
  if (ws) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      return;
    }
  }

  const baseUrl = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  const url = `${baseUrl}/ws`;

  // Send token via Sec-WebSocket-Protocol to avoid token in URL/logs
  ws = new WebSocket(url, [`bearer.${token}`]);

  ws.onopen = () => {
    console.info('[socket] connected');
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data as string) as {
        type: string;
        data?: unknown;
        payload?: unknown;
      };
      // Auto-respond to server pings
      if (message.type === 'ping' && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      // Backend uses 'data', some handlers use 'payload'
      const content = message.data ?? message.payload;
      dispatch(message.type, content);
    } catch (error) {
      console.error('[socket] failed to parse message:', error);
    }
  };

  ws.onclose = () => {
    console.info('[socket] disconnected');
    ws = null;
    // Auto-reconnect after 3s if we still have a token
    const currentToken = localStorage.getItem('access_token');
    if (currentToken) {
      console.info('[socket] scheduling reconnect in 3s');
      setTimeout(() => connect(currentToken), 3000);
    }
  };

  ws.onerror = (event: Event) => {
    console.error('[socket] error:', event);
  };
}

export function disconnect(): void {
  if (ws) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    ws = null;
  }
}

export function subscribe(
  eventType: string,
  handler: (data: unknown) => void
): () => void {
  if (!handlers.has(eventType)) {
    handlers.set(eventType, new Set());
  }
  handlers.get(eventType)!.add(handler);

  return () => {
    const set = handlers.get(eventType);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        handlers.delete(eventType);
      }
    }
  };
}

export function send(type: string, payload: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[socket] cannot send, socket is not open');
    return;
  }
  ws.send(JSON.stringify({ type, payload }));
}
