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
  console.log(`[broadcastToOrg] org=${organizationId}, type=${type}, connections=${connections?.size ?? 0}`);
  if (!connections || connections.size === 0) {
    console.warn(`[broadcastToOrg] No connections for org ${organizationId}`);
    return;
  }

  const message = JSON.stringify({ type, data });
  let sent = 0;

  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
        sent++;
      } catch (error) {
        console.error(`Failed to send WebSocket message to org ${organizationId}:`, error);
      }
    } else {
      console.warn(`[broadcastToOrg] Connection not OPEN, readyState=${ws.readyState}`);
    }
  }
  console.log(`[broadcastToOrg] Sent ${sent}/${connections.size} connections for ${type}`);
}
