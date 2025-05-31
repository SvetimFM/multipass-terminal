import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';
import { mkdirSync } from 'fs';
import { 
  AgentInstance, 
  AgentMessage, 
  AgentProvider, 
  AgentConfig,
  DEFAULT_AGENT_PROVIDERS 
} from '../types/agent.types';

export class AgentInstanceService extends EventEmitter {
  private instances: Map<string, AgentInstance> = new Map();
  private redis: ReturnType<typeof createClient>;
  private config: AgentConfig;
  private waitingDetectors: Map<string, NodeJS.Timeout> = new Map();
  private lastOutputTime: Map<string, number> = new Map();
  private waitingThreshold = 3000; // 3 seconds of no output = waiting for input
  
  constructor(config?: Partial<AgentConfig>) {
    super();
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.connect();
    
    // Initialize configuration with defaults
    this.config = {
      providers: DEFAULT_AGENT_PROVIDERS,
      defaultProvider: process.env.DEFAULT_AGENT_PROVIDER || 'claude-code',
      maxInstancesPerUser: 3,
      instanceTimeout: 300000, // 5 minutes
      maxTaskDuration: 300000,
      ...config
    };
    
    this.startCleanupInterval();
  }

  async createInstance(userId: string, providerName?: string): Promise<AgentInstance> {
    // Check user's instance limit
    const userInstances = this.getUserInstances(userId);
    if (userInstances.length >= this.config.maxInstancesPerUser) {
      throw new Error(`Maximum instances (${this.config.maxInstancesPerUser}) reached`);
    }

    // Get provider configuration
    const provider = this.config.providers[providerName || this.config.defaultProvider];
    if (!provider) {
      throw new Error(`Unknown agent provider: ${providerName}`);
    }

    const instanceId = uuidv4();
    const workDir = `/tmp/agent-instances/${instanceId}`;
    
    // Create isolated workspace
    try {
      mkdirSync(workDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create workspace:', error);
    }

    // Spawn agent process
    const agentProcess = spawn(provider.command, provider.args, {
      env: {
        ...process.env,
        ...provider.env,
        // Add provider-specific env vars
        ...(provider.type === 'claude-code' && { 
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY 
        }),
        ...(provider.type === 'openai-terminal' && { 
          OPENAI_API_KEY: process.env.OPENAI_API_KEY 
        }),
      },
      cwd: workDir,
    });

    const instance: AgentInstance = {
      id: instanceId,
      userId,
      provider: providerName || this.config.defaultProvider,
      process: agentProcess,
      status: 'starting',
      createdAt: new Date(),
      lastActivity: new Date(),
      outputBuffer: [],
      errorBuffer: [],
      metadata: {
        workDir,
        providerType: provider.type,
      }
    };

    // Handle process output
    agentProcess.stdout.on('data', (data) => {
      const output = data.toString();
      instance.outputBuffer.push(output);
      instance.lastActivity = new Date();
      
      this.emit('message', {
        instanceId,
        type: 'stdout',
        content: output,
        timestamp: new Date(),
        provider: instance.provider,
      } as AgentMessage);
      
      // Update last output time and reset waiting detector
      this.lastOutputTime.set(instanceId, Date.now());
      this.resetWaitingDetector(instanceId);

      // Check if agent is ready using provider-specific pattern
      if (provider.readyPattern && 
          provider.readyPattern.test(output) && 
          instance.status === 'starting') {
        instance.status = 'ready';
        this.emit('instance:ready', instanceId);
      }
    });

    agentProcess.stderr.on('data', (data) => {
      const error = data.toString();
      instance.errorBuffer.push(error);
      
      this.emit('message', {
        instanceId,
        type: 'stderr',
        content: error,
        timestamp: new Date(),
        provider: instance.provider,
      } as AgentMessage);

      // Check for error patterns
      if (provider.errorPatterns?.some(pattern => pattern.test(error))) {
        instance.status = 'error';
      }
    });

    agentProcess.on('error', (error) => {
      instance.status = 'error';
      this.emit('instance:error', { instanceId, error });
    });

    agentProcess.on('exit', (code) => {
      instance.status = 'stopped';
      this.emit('instance:stopped', { instanceId, code });
      this.instances.delete(instanceId);
    });

    this.instances.set(instanceId, instance);
    
    // Store in Redis for distributed access
    await this.redis.set(
      `agent:instance:${instanceId}`,
      JSON.stringify({
        id: instanceId,
        userId,
        provider: instance.provider,
        status: instance.status,
        createdAt: instance.createdAt,
      }),
      { EX: 3600 }
    );

    return instance;
  }

  async sendCommand(instanceId: string, command: string, taskId?: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    if (instance.status !== 'ready') {
      throw new Error(`Instance not ready (status: ${instance.status})`);
    }

    instance.status = 'busy';
    instance.currentTask = taskId;
    instance.lastActivity = new Date();

    // Send command to agent
    instance.process.stdin.write(command + '\n');
    
    // Start waiting detection for this instance
    this.resetWaitingDetector(instanceId);

    // Update Redis
    await this.redis.set(
      `agent:instance:${instanceId}`,
      JSON.stringify({
        id: instanceId,
        userId: instance.userId,
        provider: instance.provider,
        status: instance.status,
        currentTask: taskId,
        lastActivity: instance.lastActivity,
      }),
      { EX: 3600 }
    );
  }

  getInstance(instanceId: string): AgentInstance | undefined {
    return this.instances.get(instanceId);
  }

  getUserInstances(userId: string): AgentInstance[] {
    return Array.from(this.instances.values()).filter(
      instance => instance.userId === userId
    );
  }

  getProviderInstances(provider: string): AgentInstance[] {
    return Array.from(this.instances.values()).filter(
      instance => instance.provider === provider
    );
  }

  async stopInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.process.kill('SIGTERM');
    this.instances.delete(instanceId);
    await this.redis.del(`agent:instance:${instanceId}`);
  }

  async stopUserInstances(userId: string): Promise<void> {
    const userInstances = this.getUserInstances(userId);
    for (const instance of userInstances) {
      await this.stopInstance(instance.id);
    }
  }

  getInstanceOutput(instanceId: string, lines = 100): string[] {
    const instance = this.instances.get(instanceId);
    if (!instance) return [];
    
    return instance.outputBuffer.slice(-lines);
  }

  clearInstanceOutput(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.outputBuffer = [];
      instance.errorBuffer = [];
    }
  }

  isTaskComplete(message: AgentMessage): boolean {
    const instance = this.instances.get(message.instanceId);
    if (!instance) return false;

    const provider = this.config.providers[instance.provider];
    if (!provider?.completionPatterns) return false;

    return provider.completionPatterns.some(pattern => 
      pattern.test(message.content)
    );
  }

  getAvailableProviders(): string[] {
    return Object.keys(this.config.providers);
  }

  getProviderInfo(providerName: string): AgentProvider | undefined {
    return this.config.providers[providerName];
  }

  updateProviderConfig(providerName: string, config: Partial<AgentProvider>): void {
    if (this.config.providers[providerName]) {
      this.config.providers[providerName] = {
        ...this.config.providers[providerName],
        ...config
      };
    }
  }

  addProvider(providerName: string, provider: AgentProvider): void {
    this.config.providers[providerName] = provider;
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [instanceId, instance] of this.instances) {
        const idleTime = now - instance.lastActivity.getTime();
        
        // Stop instances that have been idle too long
        if (idleTime > this.config.instanceTimeout) {
          console.log(`Stopping idle instance ${instanceId} (${instance.provider})`);
          this.stopInstance(instanceId);
        }
      }
    }, 60000); // Check every minute
  }

  async getInstanceStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byUser: Record<string, number>;
    byProvider: Record<string, number>;
  }> {
    const stats = {
      total: this.instances.size,
      byStatus: {} as Record<string, number>,
      byUser: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
    };

    for (const instance of this.instances.values()) {
      // Count by status
      stats.byStatus[instance.status] = (stats.byStatus[instance.status] || 0) + 1;
      
      // Count by user
      stats.byUser[instance.userId] = (stats.byUser[instance.userId] || 0) + 1;
      
      // Count by provider
      stats.byProvider[instance.provider] = (stats.byProvider[instance.provider] || 0) + 1;
    }

    return stats;
  }

  private resetWaitingDetector(instanceId: string): void {
    // Clear existing detector
    const existingDetector = this.waitingDetectors.get(instanceId);
    if (existingDetector) {
      clearTimeout(existingDetector);
    }
    
    // Set new detector
    const detector = setTimeout(() => {
      const instance = this.instances.get(instanceId);
      if (instance && instance.status === 'busy') {
        // Get recent output to include in notification
        const recentOutput = instance.outputBuffer.slice(-5).join('\n');
        
        this.emit('instance:waiting', {
          instanceId,
          taskId: instance.currentTask,
          lastOutput: recentOutput,
          waitTime: Date.now() - (this.lastOutputTime.get(instanceId) || Date.now())
        });
      }
    }, this.waitingThreshold);
    
    this.waitingDetectors.set(instanceId, detector);
  }

  async sendResponse(instanceId: string, response: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }

    if (instance.status !== 'busy') {
      throw new Error('Instance not waiting for input');
    }

    // Send response to agent
    instance.process.stdin.write(response + '\n');
    instance.lastActivity = new Date();
    
    // Reset waiting detector
    this.resetWaitingDetector(instanceId);
    
    this.emit('instance:responded', {
      instanceId,
      taskId: instance.currentTask,
      response
    });
  }

  async close(): Promise<void> {
    // Clear all waiting detectors
    for (const detector of this.waitingDetectors.values()) {
      clearTimeout(detector);
    }
    
    // Stop all instances
    for (const instanceId of this.instances.keys()) {
      await this.stopInstance(instanceId);
    }
    
    await this.redis.quit();
  }
}