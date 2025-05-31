import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { AgentInstanceService } from './agent-instance.service';
import { AgentTask, AgentMessage } from '../types/agent.types';
import { NotificationService } from './notification.service';

export class AgentQueueService extends EventEmitter {
  private redis: ReturnType<typeof createClient>;
  private instanceService: AgentInstanceService;
  private notificationService: NotificationService;
  private processingTasks: Map<string, AgentTask> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private responseWaitingTasks: Map<string, string> = new Map(); // taskId -> instanceId
  private maxTaskDuration = 300000; // 5 minutes per task

  constructor(instanceService: AgentInstanceService, notificationService: NotificationService) {
    super();
    this.instanceService = instanceService;
    this.notificationService = notificationService;
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.connect();
    this.setupInstanceListeners();
    this.setupNotificationListeners();
    this.startQueueProcessor();
  }

  private setupInstanceListeners(): void {
    // Listen for agent messages
    this.instanceService.on('message', async (message: AgentMessage) => {
      // Find task for this instance
      const task = Array.from(this.processingTasks.values()).find(
        t => t.instanceId === message.instanceId
      );

      if (task) {
        task.messages.push(message);
        
        // Check for task completion using provider-specific patterns
        if (this.instanceService.isTaskComplete(message)) {
          await this.completeTask(task.id, 'completed');
        }

        // Emit real-time update
        this.emit('task:message', { taskId: task.id, message });
        
        // Store message in Redis for persistence
        await this.redis.rPush(
          `task:messages:${task.id}`,
          JSON.stringify(message)
        );
      }
    });

    // Handle instance errors
    this.instanceService.on('instance:error', async ({ instanceId, error }) => {
      const task = Array.from(this.processingTasks.values()).find(
        t => t.instanceId === instanceId
      );

      if (task) {
        await this.completeTask(task.id, 'failed', error.message);
      }
    });

    // Handle instance waiting for input
    this.instanceService.on('instance:waiting', async ({ instanceId, taskId, lastOutput }) => {
      const task = this.processingTasks.get(taskId);
      if (!task) return;

      // Mark task as waiting for response
      this.responseWaitingTasks.set(taskId, instanceId);

      // Create notification for user
      await this.notificationService.createAIWaitingNotification(
        task.userId,
        task.id,
        instanceId,
        lastOutput
      );

      this.emit('task:waiting', {
        taskId: task.id,
        lastOutput,
        requiresInput: true
      });
    });
  }

  private setupNotificationListeners(): void {
    // Handle user responses to notifications
    this.notificationService.on('response:received', async (response) => {
      const instanceId = this.responseWaitingTasks.get(response.taskId);
      if (!instanceId) return;

      try {
        // Send response to AI instance
        await this.instanceService.sendResponse(instanceId, response.response);
        
        // Remove from waiting list
        this.responseWaitingTasks.delete(response.taskId);

        this.emit('task:responded', {
          taskId: response.taskId,
          response: response.response
        });
      } catch (error) {
        console.error('Failed to send response to instance:', error);
      }
    });
  }

  async queueTask(
    userId: string, 
    sessionId: string, 
    command: string,
    provider?: string,
    metadata?: Record<string, any>
  ): Promise<AgentTask> {
    const task: AgentTask = {
      id: uuidv4(),
      userId,
      sessionId,
      provider: provider || this.instanceService.getAvailableProviders()[0],
      command,
      status: 'queued',
      createdAt: new Date(),
      messages: [],
      metadata,
    };

    // Store in Redis queue
    await this.redis.lPush('agent:task:queue', JSON.stringify(task));
    await this.redis.set(`task:${task.id}`, JSON.stringify(task), { EX: 86400 });

    this.emit('task:queued', task);
    return task;
  }

  private async startQueueProcessor(): Promise<void> {
    while (true) {
      try {
        // Get next task from queue (blocking pop with 1 second timeout)
        const taskData = await this.redis.brPop('agent:task:queue', 1);
        
        if (taskData) {
          const task = JSON.parse(taskData.element) as AgentTask;
          await this.processTask(task);
        }
      } catch (error) {
        console.error('Queue processor error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on error
      }
    }
  }

  private async processTask(task: AgentTask): Promise<void> {
    try {
      task.status = 'processing';
      task.startedAt = new Date();
      
      // Get or create instance for user with specific provider
      let instance = this.instanceService.getUserInstances(task.userId)
        .find(i => i.status === 'ready' && i.provider === task.provider);

      if (!instance) {
        instance = await this.instanceService.createInstance(task.userId, task.provider);
        
        // Wait for instance to be ready
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            resolve();
          }, 30000); // 30 second timeout

          this.instanceService.once('instance:ready', (instanceId) => {
            if (instanceId === instance!.id) {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
      }

      if (instance.status !== 'ready') {
        throw new Error('Instance failed to become ready');
      }

      task.instanceId = instance.id;
      this.processingTasks.set(task.id, task);

      // Set task timeout
      const timeout = setTimeout(() => {
        this.completeTask(task.id, 'failed', 'Task timed out');
      }, this.maxTaskDuration);
      this.taskTimeouts.set(task.id, timeout);

      // Send command to agent
      await this.instanceService.sendCommand(instance.id, task.command, task.id);

      // Update task in Redis
      await this.redis.set(`task:${task.id}`, JSON.stringify(task), { EX: 86400 });
      
      this.emit('task:started', task);
    } catch (error: any) {
      await this.completeTask(task.id, 'failed', error.message);
    }
  }

  private async completeTask(taskId: string, status: 'completed' | 'failed', error?: string): Promise<void> {
    const task = this.processingTasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.completedAt = new Date();
    if (error) task.error = error;

    // Collect final output
    if (task.instanceId) {
      const output = this.instanceService.getInstanceOutput(task.instanceId);
      task.result = output.join('\n');
      
      // Mark instance as ready again
      const instance = this.instanceService.getInstance(task.instanceId);
      if (instance) {
        instance.status = 'ready';
        instance.currentTask = undefined;
      }
    }

    // Clear timeout
    const timeout = this.taskTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(taskId);
    }

    // Update Redis
    await this.redis.set(`task:${taskId}`, JSON.stringify(task), { EX: 86400 });
    
    // Remove from processing
    this.processingTasks.delete(taskId);

    this.emit('task:completed', task);
  }

  async getTask(taskId: string): Promise<AgentTask | null> {
    const data = await this.redis.get(`task:${taskId}`);
    if (!data) return null;

    const task = JSON.parse(data) as AgentTask;
    
    // Get messages from Redis
    const messages = await this.redis.lRange(`task:messages:${taskId}`, 0, -1);
    task.messages = messages.map((m: string) => JSON.parse(m) as AgentMessage);

    return task;
  }

  async getUserTasks(userId: string, limit = 10): Promise<AgentTask[]> {
    // This would be more efficient with proper indexing
    const keys = await this.redis.keys('task:*');
    const tasks: AgentTask[] = [];

    for (const key of keys.slice(0, limit * 2)) { // Check more keys than needed
      if (key.includes(':messages:')) continue;
      
      const data = await this.redis.get(key);
      if (data) {
        const task = JSON.parse(data) as AgentTask;
        if (task.userId === userId) {
          tasks.push(task);
          if (tasks.length >= limit) break;
        }
      }
    }

    return tasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.processingTasks.get(taskId);
    if (!task || task.status !== 'processing') {
      return false;
    }

    await this.completeTask(taskId, 'failed', 'Task cancelled by user');
    return true;
  }

  async getQueueStats(): Promise<{
    queueLength: number;
    processing: number;
    completed: number;
    failed: number;
    byProvider: Record<string, number>;
  }> {
    const queueLength = await this.redis.lLen('agent:task:queue');
    
    // Count tasks by status and provider
    let completed = 0;
    let failed = 0;
    const byProvider: Record<string, number> = {};
    
    const keys = await this.redis.keys('task:*');
    for (const key of keys) {
      if (key.includes(':messages:')) continue;
      
      const data = await this.redis.get(key);
      if (data) {
        const task = JSON.parse(data) as AgentTask;
        if (task.status === 'completed') completed++;
        else if (task.status === 'failed') failed++;
        
        // Count by provider
        byProvider[task.provider] = (byProvider[task.provider] || 0) + 1;
      }
    }

    return {
      queueLength,
      processing: this.processingTasks.size,
      completed,
      failed,
      byProvider,
    };
  }

  async close(): Promise<void> {
    // Clear all timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    await this.redis.quit();
  }
}