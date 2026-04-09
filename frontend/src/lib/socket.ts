let ws: WebSocket | null = null;
const handlers: Map<string, Set<(data: unknown) => void>> = new Map();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 3000;

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

/**
 * Try to refresh the access token using the stored refresh token.
 * Returns the new access token on success, null on failure.
 */
async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  try {
    const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}/api/v1`;
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    const newToken = result.data?.accessToken || result.data?.access_token;
    if (newToken) {
      localStorage.setItem('access_token', newToken);
      return newToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function connect(token: string): void {
  if (ws) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      return;
    }
  }

  reconnectAttempts++;

  const baseUrl = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  const url = `${baseUrl}/ws`;

  // Always read the freshest token at connection time
  const freshToken = localStorage.getItem('access_token') || token;

  // Send token via Sec-WebSocket-Protocol to avoid token in URL/logs
  ws = new WebSocket(url, [`bearer.${freshToken}`]);

  ws.onopen = () => {
    console.info('[socket] connected');
    reconnectAttempts = 0; // reset on successful connection
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

  ws.onclose = (event: CloseEvent) => {
    console.info(`[socket] disconnected (code: ${event.code})`);
    ws = null;

    // Detect auth failure — stop reconnecting if token is invalid/expired
    if (event.code === 4003) {
      console.warn('[socket] auth failure on WS — stopping reconnect, will attempt token refresh');
      reconnectAttempts = 0; // allow one more cycle after refresh
      tryRefreshToken().then((newToken) => {
        if (newToken) {
          console.info('[socket] token refreshed — reconnecting');
          scheduleReconnect();
        } else {
          console.warn('[socket] token refresh failed — not reconnecting');
        }
      });
      return;
    }

    scheduleReconnect();
  };

  ws.onerror = (event: Event) => {
    console.error('[socket] error:', event);
  };
}

/**
 * Schedule a reconnect attempt with exponential backoff.
 * Gives up after MAX_RECONNECT_ATTEMPTS consecutive failures.
 */
function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn(`[socket] max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
    return;
  }

  const delay = RECONNECT_BASE_DELAY * Math.pow(2, Math.min(reconnectAttempts - 1, 3));
  console.info(`[socket] scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  setTimeout(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      connect(token);
    }
  }, delay);
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
