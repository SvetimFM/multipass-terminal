import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';
import { Command, CommandPayload } from '../types';
import { EventEmitter } from 'events';

export class CommandService extends EventEmitter {
  private redis: ReturnType<typeof createClient>;
  private commandQueue: Map<string, Command[]> = new Map();
  private activeCommands: Map<string, Command> = new Map();

  constructor() {
    super();
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.connect();
  }

  async createCommand(
    sessionId: string,
    agentId: string,
    payload: CommandPayload
  ): Promise<Command> {
    // Check concurrent command limit
    const activeCount = await this.getActiveCommandCount(agentId);
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_COMMANDS || '5');
    
    if (activeCount >= maxConcurrent) {
      throw new Error(`Maximum concurrent commands (${maxConcurrent}) reached for agent`);
    }

    const command: Command = {
      id: uuidv4(),
      sessionId,
      agentId,
      command: payload.command,
      status: 'pending',
      createdAt: new Date()
    };

    // Store in Redis
    await this.redis.set(
      `command:${command.id}`,
      JSON.stringify(command),
      { EX: parseInt(process.env.MAX_COMMAND_EXECUTION_TIME || '300000') / 1000 }
    );

    // Add to queue
    const agentQueue = this.commandQueue.get(agentId) || [];
    agentQueue.push(command);
    this.commandQueue.set(agentId, agentQueue);

    // Emit event for command processing
    this.emit('command:created', command);

    return command;
  }

  async updateCommandStatus(
    commandId: string,
    status: Command['status'],
    output?: string,
    error?: string
  ): Promise<Command | null> {
    const commandData = await this.redis.get(`command:${commandId}`);
    if (!commandData) return null;

    const command = JSON.parse(commandData) as Command;
    command.status = status;
    
    if (output !== undefined) command.output = output;
    if (error !== undefined) command.error = error;
    
    if (status === 'executing') {
      command.executedAt = new Date();
      this.activeCommands.set(command.agentId, command);
    } else if (status === 'completed' || status === 'failed') {
      command.completedAt = new Date();
      this.activeCommands.delete(command.agentId);
      
      // Remove from queue
      const agentQueue = this.commandQueue.get(command.agentId) || [];
      const filteredQueue = agentQueue.filter(c => c.id !== commandId);
      this.commandQueue.set(command.agentId, filteredQueue);
    }

    // Update in Redis
    await this.redis.set(
      `command:${commandId}`,
      JSON.stringify(command),
      { EX: 3600 } // Keep completed commands for 1 hour
    );

    // Emit status update event
    this.emit('command:updated', command);

    return command;
  }

  async getCommand(commandId: string): Promise<Command | null> {
    const data = await this.redis.get(`command:${commandId}`);
    if (!data) return null;
    return JSON.parse(data) as Command;
  }

  async getSessionCommands(sessionId: string): Promise<Command[]> {
    const keys = await this.redis.keys(`command:*`);
    const commands: Command[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const command = JSON.parse(data) as Command;
        if (command.sessionId === sessionId) {
          commands.push(command);
        }
      }
    }

    return commands.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getAgentCommands(agentId: string): Promise<Command[]> {
    const keys = await this.redis.keys(`command:*`);
    const commands: Command[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const command = JSON.parse(data) as Command;
        if (command.agentId === agentId) {
          commands.push(command);
        }
      }
    }

    return commands.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getActiveCommandCount(agentId: string): Promise<number> {
    const commands = await this.getAgentCommands(agentId);
    return commands.filter(c => 
      c.status === 'pending' || c.status === 'executing'
    ).length;
  }

  async cancelCommand(commandId: string): Promise<boolean> {
    const command = await this.getCommand(commandId);
    if (!command || command.status !== 'pending') {
      return false;
    }

    await this.updateCommandStatus(commandId, 'failed', undefined, 'Command cancelled');
    this.emit('command:cancelled', command);
    
    return true;
  }

  getQueuedCommands(agentId: string): Command[] {
    return this.commandQueue.get(agentId) || [];
  }

  getActiveCommand(agentId: string): Command | undefined {
    return this.activeCommands.get(agentId);
  }

  async cleanupExpiredCommands(): Promise<void> {
    const keys = await this.redis.keys(`command:*`);
    const now = Date.now();
    const maxExecutionTime = parseInt(process.env.MAX_COMMAND_EXECUTION_TIME || '300000');

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const command = JSON.parse(data) as Command;
        
        // Check if command has been executing too long
        if (command.status === 'executing' && command.executedAt) {
          const executionTime = now - new Date(command.executedAt).getTime();
          if (executionTime > maxExecutionTime) {
            await this.updateCommandStatus(
              command.id,
              'failed',
              undefined,
              'Command execution timeout'
            );
          }
        }
      }
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}