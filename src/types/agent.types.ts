export interface AgentProvider {
  name: string;
  type: 'claude-code' | 'github-copilot' | 'openai-terminal' | 'custom';
  command: string;
  args: string[];
  env?: Record<string, string>;
  readyPattern?: RegExp;
  completionPatterns?: RegExp[];
  errorPatterns?: RegExp[];
}

export interface AgentConfig {
  providers: Record<string, AgentProvider>;
  defaultProvider: string;
  maxInstancesPerUser: number;
  instanceTimeout: number;
  maxTaskDuration: number;
}

export interface AgentInstance {
  id: string;
  userId: string;
  provider: string;
  process: any; // ChildProcess
  status: 'starting' | 'ready' | 'busy' | 'error' | 'stopped';
  createdAt: Date;
  lastActivity: Date;
  currentTask?: string;
  outputBuffer: string[];
  errorBuffer: string[];
  metadata?: Record<string, any>;
}

export interface AgentMessage {
  instanceId: string;
  type: 'stdout' | 'stderr' | 'status' | 'complete';
  content: string;
  timestamp: Date;
  taskId?: string;
  provider?: string;
}

export interface AgentTask {
  id: string;
  userId: string;
  sessionId: string;
  provider: string;
  command: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  instanceId?: string;
  result?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  messages: AgentMessage[];
  metadata?: Record<string, any>;
}

// Default agent configurations
export const DEFAULT_AGENT_PROVIDERS: Record<string, AgentProvider> = {
  'claude-code': {
    name: 'Claude Code',
    type: 'claude-code',
    command: 'claude-code',
    args: ['--mode', 'chat'],
    env: {
      NO_COLOR: '1',
    },
    readyPattern: /Ready|Initialized|Started/i,
    completionPatterns: [
      /Task completed successfully/i,
      /Done\./i,
      /Finished\./i,
      /✓ Complete/i,
    ],
    errorPatterns: [
      /Error:/i,
      /Failed:/i,
      /Exception:/i,
    ],
  },
  'github-copilot': {
    name: 'GitHub Copilot CLI',
    type: 'github-copilot',
    command: 'gh',
    args: ['copilot', 'suggest'],
    env: {},
    readyPattern: />/,
    completionPatterns: [
      /Suggestion:/i,
      /Complete\./i,
    ],
  },
  'openai-terminal': {
    name: 'OpenAI Terminal',
    type: 'openai-terminal',
    command: 'openai',
    args: ['terminal'],
    env: {},
    readyPattern: />/,
    completionPatterns: [
      /Done/i,
      /Completed/i,
    ],
  },
};