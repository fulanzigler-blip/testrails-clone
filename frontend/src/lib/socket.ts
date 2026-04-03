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

  const baseUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
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
        payload?: unknown;
      };
      dispatch(message.type, message.payload);
    } catch (error) {
      console.error('[socket] failed to parse message:', error);
    }
  };

  ws.onclose = () => {
    console.info('[socket] disconnected');
    ws = null;
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
