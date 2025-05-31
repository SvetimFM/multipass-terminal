# Ship Anywhere Server - Usage Guide 🚀

## Overview

This server acts as a bridge between web clients and AI coding assistants (Claude Code, GitHub Copilot, etc.). It manages AI agent instances server-side and routes commands from web users to these agents.

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Redis running locally or via Docker
- API keys for your AI providers:
  - `ANTHROPIC_API_KEY` for Claude Code
  - `OPENAI_API_KEY` for OpenAI Terminal
  - GitHub CLI authenticated for Copilot

### 2. Installation

```bash
# Clone the repo
git clone <your-repo>
cd ship_anywhere_serverside

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Start Redis
docker-compose up -d

# Build the project
npm run build

# Start the server
npm start
```

## API Usage

### Authentication

First, create an account:

```bash
curl -X POST http://localhost:3010/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword"
  }'
```

Response:
```json
{
  "user": { "id": "...", "email": "..." },
  "token": "your-jwt-token"
}
```

### Creating a Session

```bash
curl -X POST http://localhost:3001/api/sessions \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Executing AI Commands

```bash
curl -X POST http://localhost:3001/api/ai/tasks \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id",
    "command": "Create a React component for a todo list",
    "provider": "claude-code"
  }'
```

Available providers:
- `claude-code` - Claude Code CLI
- `github-copilot` - GitHub Copilot CLI
- `openai-terminal` - OpenAI Terminal
- Custom providers you configure

### WebSocket Connection (Real-time Updates)

```javascript
const ws = new WebSocket('ws://localhost:3002');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  payload: { token: 'your-jwt-token' },
  messageId: 'unique-id',
  timestamp: new Date()
}));

// Listen for task updates
ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type === 'task:message') {
    console.log('AI Output:', message.payload.content);
  }
});
```

## Example Workflows

### 1. Basic Code Generation

```javascript
// 1. Create a task
const response = await fetch('/api/ai/tasks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sessionId: sessionId,
    command: 'Write a Python script to scrape HackerNews headlines',
    provider: 'claude-code'
  })
});

const { task } = await response.json();

// 2. Poll for results (or use WebSocket for real-time)
const result = await fetch(`/api/ai/tasks/${task.id}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const completedTask = await result.json();
console.log(completedTask.result);
```

### 2. Multi-Step Project

```javascript
// Create multiple tasks for a project
const tasks = [
  'Initialize a new Next.js project with TypeScript',
  'Add Tailwind CSS configuration',
  'Create a landing page component',
  'Add authentication with NextAuth'
];

for (const command of tasks) {
  await fetch('/api/ai/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId,
      command,
      provider: 'claude-code'
    })
  });
  
  // Wait for completion before next task
  await waitForTaskCompletion(taskId);
}
```

### 3. Using Different Providers

```javascript
// Use GitHub Copilot for quick suggestions
const copilotTask = await createTask({
  command: 'Suggest optimizations for this SQL query: SELECT * FROM users WHERE active = true',
  provider: 'github-copilot'
});

// Use Claude Code for complex implementations
const claudeTask = await createTask({
  command: 'Implement a real-time collaborative editor with WebRTC',
  provider: 'claude-code'
});
```

## Configuration

### Adding Custom AI Providers

Edit `src/types/agent.types.ts`:

```typescript
export const DEFAULT_AGENT_PROVIDERS: Record<string, AgentProvider> = {
  // ... existing providers ...
  
  'my-custom-ai': {
    name: 'My Custom AI',
    type: 'custom',
    command: 'my-ai-cli',
    args: ['--interactive'],
    env: {
      MY_AI_API_KEY: process.env.MY_AI_API_KEY
    },
    readyPattern: /Ready to assist/i,
    completionPatterns: [
      /Task complete/i,
      /Finished processing/i
    ],
    errorPatterns: [
      /Error occurred/i
    ]
  }
};
```

### Rate Limits by Tier

- **Free**: 100 commands/day, 2 concurrent
- **Basic ($5/mo)**: 1,000 commands/day, 5 concurrent  
- **Pro ($20/mo)**: 10,000 commands/day, 10 concurrent

## Monitoring

### Get Queue Stats

```bash
curl http://localhost:3001/api/ai/stats \
  -H "Authorization: Bearer your-jwt-token"
```

### View Active Instances

```bash
curl http://localhost:3001/api/ai/instances \
  -H "Authorization: Bearer your-jwt-token"
```

## Security Notes

1. **API Keys**: Never expose your API keys to clients
2. **Command Validation**: The server validates and sanitizes all commands
3. **Isolation**: Each AI instance runs in an isolated environment
4. **Rate Limiting**: Enforced per user based on subscription

## Troubleshooting

### AI Agent Not Starting
- Check API keys in `.env`
- Verify the CLI tool is installed globally
- Check Redis connection

### Tasks Timing Out
- Increase `MAX_TASK_DURATION` in environment
- Check if AI agent is actually installed and accessible

### WebSocket Connection Issues
- Ensure port 3002 is not blocked
- Check CORS settings if connecting from browser

## Client SDK Example

```javascript
class ShipAnywhereClient {
  constructor(apiUrl, wsUrl, token) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.ws = new WebSocket(wsUrl);
    this.setupWebSocket();
  }

  async createTask(command, provider = 'claude-code') {
    const response = await fetch(`${this.apiUrl}/api/ai/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ command, provider })
    });
    return response.json();
  }

  onMessage(callback) {
    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      callback(message);
    });
  }
}

// Usage
const client = new ShipAnywhereClient(
  'http://localhost:3001',
  'ws://localhost:3002',
  authToken
);

const task = await client.createTask('Build a CLI tool in Rust');
client.onMessage((msg) => {
  if (msg.type === 'task:message') {
    console.log('AI:', msg.payload.content);
  }
});
```

## Next Steps

1. Build a web UI that connects to this server
2. Add more AI providers
3. Implement team/organization support
4. Add file system access controls
5. Create a desktop app for local agent management