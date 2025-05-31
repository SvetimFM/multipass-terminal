export interface User {
  id: string;
  email: string;
  passwordHash: string;
  subscriptionStatus: 'active' | 'inactive' | 'trial';
  subscriptionTier: 'free' | 'basic' | 'pro';
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  agentId?: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  platform: 'windows' | 'linux' | 'darwin';
  status: 'online' | 'offline';
  lastSeen: Date;
  capabilities: string[];
}

export interface Command {
  id: string;
  sessionId: string;
  agentId: string;
  command: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  output?: string;
  error?: string;
  executedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface WebSocketMessage {
  type: 'auth' | 'command' | 'result' | 'heartbeat' | 'error' | 'ai-response';
  payload: any;
  messageId: string;
  timestamp: Date;
}

export interface AuthPayload {
  token: string;
  agentId?: string;
}

export interface CommandPayload {
  command: string;
  workingDirectory?: string;
  environment?: Record<string, string>;
  timeout?: number;
}

export interface ResultPayload {
  commandId: string;
  output?: string;
  error?: string;
  exitCode?: number;
  executionTime?: number;
}