import { WebSocket } from 'ws';

export const connectionRegistry = new Map<string, Set<WebSocket>>();

export function registerConnection(organizationId: string, ws: WebSocket): void {
  if (!connectionRegistry.has(organizationId)) {
    connectionRegistry.set(organizationId, new Set<WebSocket>());
  }
  connectionRegistry.get(organizationId)!.add(ws);
}

export function removeConnection(organizationId: string, ws: WebSocket): void {
  const connections = connectionRegistry.get(organizationId);
  if (!connections) {
    return;
  }

  connections.delete(ws);

  if (connections.size === 0) {
    connectionRegistry.delete(organizationId);
  }
}

export function broadcastToOrg(organizationId: string, type: string, data: any): void {
  const connections = connectionRegistry.get(organizationId);
  if (!connections || connections.size === 0) {
    return;
  }

  const message = JSON.stringify({ type, data });

  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        console.error(`Failed to send WebSocket message to org ${organizationId}:`, error);
      }
    }
  }
}
