import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationPayload {
  id: string;
  userId: string;
  taskId: string;
  type: 'ai_waiting' | 'task_complete' | 'error' | 'info';
  title: string;
  body: string;
  data: {
    instanceId?: string;
    lastOutput?: string;
    requiresResponse: boolean;
    responseOptions?: string[];
    metadata?: Record<string, any>;
  };
  createdAt: Date;
  expiresAt: Date;
}

export interface UserResponse {
  notificationId: string;
  userId: string;
  taskId: string;
  instanceId: string;
  response: string;
  respondedAt: Date;
}

export class NotificationService extends EventEmitter {
  private redis: ReturnType<typeof createClient>;
  private _pendingResponses: Map<string, UserResponse> = new Map();
  private responseTimeouts: Map<string, NodeJS.Timeout> = new Map();
  
  constructor() {
    super();
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.connect();
  }

  async createNotification(
    userId: string,
    taskId: string,
    type: NotificationPayload['type'],
    title: string,
    body: string,
    data: NotificationPayload['data']
  ): Promise<NotificationPayload> {
    const notification: NotificationPayload = {
      id: uuidv4(),
      userId,
      taskId,
      type,
      title,
      body,
      data,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 300000) // 5 minutes
    };

    // Store in Redis
    await this.redis.set(
      `notification:${notification.id}`,
      JSON.stringify(notification),
      { EX: 300 }
    );

    // Add to user's notification queue
    await this.redis.lPush(
      `user:${userId}:notifications`,
      notification.id
    );

    // Emit for real-time delivery
    this.emit('notification:created', notification);

    // Set timeout for response if required
    if (data.requiresResponse) {
      const timeout = setTimeout(() => {
        this.handleResponseTimeout(notification.id);
      }, 300000); // 5 minute timeout
      
      this.responseTimeouts.set(notification.id, timeout);
    }

    return notification;
  }

  async createAIWaitingNotification(
    userId: string,
    taskId: string,
    instanceId: string,
    lastOutput: string
  ): Promise<NotificationPayload> {
    // Parse the last output to create a meaningful notification
    const lines = lastOutput.trim().split('\n');
    const lastLine = lines[lines.length - 1] || 'AI is waiting for your input';
    
    // Try to detect if it's a yes/no question
    const isYesNo = /\?.*\(y\/n\)|yes\/no|proceed\?|continue\?/i.test(lastOutput);
    const isMultiChoice = /\[1\]|\[2\]|\[a\]|\[b\]|choose|select|option/i.test(lastOutput);
    
    let responseOptions: string[] | undefined;
    if (isYesNo) {
      responseOptions = ['Yes', 'No'];
    } else if (isMultiChoice) {
      // Extract options from output (basic pattern matching)
      const matches = lastOutput.match(/\[(\w+)\]/g);
      if (matches) {
        responseOptions = matches.map(m => m.replace(/[\[\]]/g, ''));
      }
    }

    return this.createNotification(
      userId,
      taskId,
      'ai_waiting',
      '🤖 AI needs your input',
      lastLine,
      {
        instanceId,
        lastOutput,
        requiresResponse: true,
        responseOptions
      }
    );
  }

  async handleUserResponse(
    notificationId: string,
    userId: string,
    response: string
  ): Promise<UserResponse | null> {
    // Get notification
    const notifData = await this.redis.get(`notification:${notificationId}`);
    if (!notifData) {
      return null;
    }

    const notification = JSON.parse(notifData) as NotificationPayload;
    
    // Verify user owns this notification
    if (notification.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (!notification.data.requiresResponse) {
      throw new Error('This notification does not require a response');
    }

    const userResponse: UserResponse = {
      notificationId,
      userId,
      taskId: notification.taskId,
      instanceId: notification.data.instanceId!,
      response,
      respondedAt: new Date()
    };

    // Store response
    await this.redis.set(
      `response:${notificationId}`,
      JSON.stringify(userResponse),
      { EX: 3600 }
    );

    // Clear timeout
    const timeout = this.responseTimeouts.get(notificationId);
    if (timeout) {
      clearTimeout(timeout);
      this.responseTimeouts.delete(notificationId);
    }

    // Emit response event
    this.emit('response:received', userResponse);

    return userResponse;
  }

  async getUserNotifications(
    userId: string,
    limit = 10
  ): Promise<NotificationPayload[]> {
    const notifIds = await this.redis.lRange(
      `user:${userId}:notifications`,
      0,
      limit - 1
    );

    const notifications: NotificationPayload[] = [];
    for (const id of notifIds) {
      const data = await this.redis.get(`notification:${id}`);
      if (data) {
        notifications.push(JSON.parse(data));
      }
    }

    return notifications.filter(n => n.expiresAt > new Date());
  }

  async getNotification(notificationId: string): Promise<NotificationPayload | null> {
    const data = await this.redis.get(`notification:${notificationId}`);
    if (!data) return null;
    
    return JSON.parse(data) as NotificationPayload;
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.getNotification(notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found');
    }

    await this.redis.lRem(
      `user:${userId}:notifications`,
      1,
      notificationId
    );
  }

  private handleResponseTimeout(notificationId: string): void {
    this.responseTimeouts.delete(notificationId);
    this.emit('response:timeout', { notificationId });
  }

  async getResponseQueue(): Promise<UserResponse[]> {
    const responses: UserResponse[] = [];
    const keys = await this.redis.keys('response:*');
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        responses.push(JSON.parse(data));
      }
    }

    return responses.sort((a, b) => 
      new Date(a.respondedAt).getTime() - new Date(b.respondedAt).getTime()
    );
  }

  async close(): Promise<void> {
    // Clear all timeouts
    for (const timeout of this.responseTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    await this.redis.quit();
  }
}