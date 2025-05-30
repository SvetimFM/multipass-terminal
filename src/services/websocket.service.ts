import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { AuthPayload, WebSocketMessage, CommandPayload, ResultPayload } from '../types';
import { verifyToken } from '../utils/auth';
import { createClient } from 'redis';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  type: 'web' | 'agent';
  agentId?: string;
  lastHeartbeat: Date;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private redis: ReturnType<typeof createClient>;
  private heartbeatInterval?: NodeJS.Timer;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.connect();
    this.setupWebSocketServer();
    this.startHeartbeatCheck();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = uuidv4();
      let authenticated = false;

      ws.on('message', async (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          
          if (message.type === 'auth' && !authenticated) {
            await this.handleAuth(ws, clientId, message.payload as AuthPayload);
            authenticated = true;
          } else if (!authenticated) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Authentication required' },
              messageId: uuidv4(),
              timestamp: new Date()
            }));
            ws.close(1008, 'Authentication required');
          } else {
            await this.handleMessage(clientId, message);
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Invalid message format' },
            messageId: uuidv4(),
            timestamp: new Date()
          }));
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.handleDisconnect(clientId);
      });
    });
  }

  private async handleAuth(ws: WebSocket, clientId: string, payload: AuthPayload) {
    try {
      const decoded = await verifyToken(payload.token);
      
      const client: ConnectedClient = {
        ws,
        userId: decoded.userId,
        type: payload.agentId ? 'agent' : 'web',
        agentId: payload.agentId,
        lastHeartbeat: new Date()
      };

      this.clients.set(clientId, client);

      // Store connection info in Redis for scaling
      await this.redis.set(`connection:${clientId}`, JSON.stringify({
        userId: decoded.userId,
        type: client.type,
        agentId: client.agentId,
        serverId: process.env.SERVER_ID || 'default'
      }), { EX: 3600 });

      ws.send(JSON.stringify({
        type: 'auth',
        payload: { success: true, clientId },
        messageId: uuidv4(),
        timestamp: new Date()
      }));

      // If it's an agent, notify web clients
      if (client.type === 'agent') {
        await this.notifyAgentStatus(client.agentId!, 'online');
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Authentication failed' },
        messageId: uuidv4(),
        timestamp: new Date()
      }));
      ws.close(1008, 'Authentication failed');
    }
  }

  private async handleMessage(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'heartbeat':
        client.lastHeartbeat = new Date();
        client.ws.send(JSON.stringify({
          type: 'heartbeat',
          payload: { timestamp: new Date() },
          messageId: uuidv4(),
          timestamp: new Date()
        }));
        break;

      case 'command':
        if (client.type === 'web') {
          await this.handleCommand(clientId, message.payload as CommandPayload);
        }
        break;

      case 'result':
        if (client.type === 'agent') {
          await this.handleResult(clientId, message.payload as ResultPayload);
        }
        break;
    }
  }

  private async handleCommand(webClientId: string, payload: CommandPayload) {
    const webClient = this.clients.get(webClientId);
    if (!webClient) return;

    // Find the target agent
    const targetAgent = Array.from(this.clients.values()).find(
      client => client.type === 'agent' && client.userId === webClient.userId
    );

    if (!targetAgent) {
      webClient.ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'No agent connected' },
        messageId: uuidv4(),
        timestamp: new Date()
      }));
      return;
    }

    const commandId = uuidv4();
    
    // Store command in Redis for tracking
    await this.redis.set(`command:${commandId}`, JSON.stringify({
      webClientId,
      agentId: targetAgent.agentId,
      command: payload.command,
      status: 'pending',
      createdAt: new Date()
    }), { EX: 300 });

    // Forward command to agent
    targetAgent.ws.send(JSON.stringify({
      type: 'command',
      payload: { ...payload, commandId },
      messageId: uuidv4(),
      timestamp: new Date()
    }));
  }

  private async handleResult(agentClientId: string, payload: ResultPayload) {
    // Get command info from Redis
    const commandInfo = await this.redis.get(`command:${payload.commandId}`);
    if (!commandInfo) return;

    const command = JSON.parse(commandInfo);
    const webClient = Array.from(this.clients.values()).find(
      client => client.type === 'web' && client.userId === this.clients.get(agentClientId)?.userId
    );

    if (webClient) {
      webClient.ws.send(JSON.stringify({
        type: 'result',
        payload,
        messageId: uuidv4(),
        timestamp: new Date()
      }));
    }

    // Update command status in Redis
    await this.redis.set(`command:${payload.commandId}`, JSON.stringify({
      ...command,
      status: 'completed',
      result: payload,
      completedAt: new Date()
    }), { EX: 3600 });
  }

  private async handleDisconnect(clientId: string) {
    const client = this.clients.get(clientId);
    if (client && client.type === 'agent') {
      await this.notifyAgentStatus(client.agentId!, 'offline');
    }
    
    this.clients.delete(clientId);
    await this.redis.del(`connection:${clientId}`);
  }

  private async notifyAgentStatus(agentId: string, status: 'online' | 'offline') {
    // Notify all web clients about agent status change
    for (const [_, client] of this.clients) {
      if (client.type === 'web') {
        client.ws.send(JSON.stringify({
          type: 'agent-status',
          payload: { agentId, status },
          messageId: uuidv4(),
          timestamp: new Date()
        }));
      }
    }
  }

  private startHeartbeatCheck() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000') * 2;

      for (const [clientId, client] of this.clients) {
        if (now.getTime() - client.lastHeartbeat.getTime() > timeout) {
          console.log(`Client ${clientId} timed out`);
          client.ws.terminate();
          this.handleDisconnect(clientId);
        }
      }
    }, 30000);
  }

  public close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval as any);
    }
    this.wss.close();
    this.redis.quit();
  }
}