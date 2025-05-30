import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';
import { Session } from '../types';

export class SessionService {
  private redis: ReturnType<typeof createClient>;

  constructor() {
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.connect();
  }

  async createSession(userId: string, agentId?: string): Promise<Session> {
    const sessionId = uuidv4();
    const session: Session = {
      id: sessionId,
      userId,
      agentId,
      token: `sas_${Buffer.from(sessionId).toString('base64').replace(/[+/=]/g, '')}`,
      expiresAt: new Date(Date.now() + parseInt(process.env.SESSION_TIMEOUT_MS || '3600000')),
      createdAt: new Date()
    };

    await this.redis.set(
      `session:${sessionId}`,
      JSON.stringify(session),
      { EX: parseInt(process.env.SESSION_TIMEOUT_MS || '3600000') / 1000 }
    );

    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(`session:${sessionId}`);
    if (!data) return null;

    const session = JSON.parse(data) as Session;
    
    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      await this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const keys = await this.redis.keys(`session:*`);
    const sessions: Session[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const session = JSON.parse(data) as Session;
        if (session.userId === userId && new Date(session.expiresAt) > new Date()) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    for (const session of sessions) {
      await this.deleteSession(session.id);
    }
  }

  async extendSession(sessionId: string): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    session.expiresAt = new Date(Date.now() + parseInt(process.env.SESSION_TIMEOUT_MS || '3600000'));
    
    await this.redis.set(
      `session:${sessionId}`,
      JSON.stringify(session),
      { EX: parseInt(process.env.SESSION_TIMEOUT_MS || '3600000') / 1000 }
    );

    return session;
  }

  async getActiveAgentCount(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    return sessions.filter(s => s.agentId).length;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}