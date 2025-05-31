# Ship Anywhere Server API Specification

## Core Functionality ✅

### 1. AI Agent Management
- ✅ **Multiple AI Provider Support**: Claude Code, GitHub Copilot, OpenAI Terminal, custom
- ✅ **Instance Lifecycle**: Create, monitor, stop instances
- ✅ **Concurrent Instance Limits**: Per user and subscription tier
- ✅ **Automatic Cleanup**: Idle instance termination

### 2. Interactive Flow
- ✅ **Pause Detection**: Monitors AI output streams for inactivity
- ✅ **Smart Notifications**: Parses AI output to create contextual notifications
- ✅ **Response Pipeline**: Routes user responses back to AI stdin
- ✅ **Real-time Updates**: WebSocket events for all state changes

### 3. Security & Rate Limiting
- ✅ **JWT Authentication**: Token-based auth
- ✅ **Command Validation**: Blocks dangerous commands
- ✅ **Rate Limiting**: Per-tier limits
- ✅ **Session Isolation**: User data separation

## API Endpoints

### Authentication
```
POST   /api/auth/signup          - Create account
POST   /api/auth/signin          - Login
GET    /api/auth/profile         - Get user profile
POST   /api/auth/agents/register - Register agent (legacy)
```

### AI Tasks
```
POST   /api/ai/tasks             - Create new AI task
GET    /api/ai/tasks             - List user's tasks
GET    /api/ai/tasks/:id         - Get task details & output
DELETE /api/ai/tasks/:id         - Cancel running task
```

### Notifications
```
GET    /api/notifications        - Get pending notifications
GET    /api/notifications/:id    - Get specific notification
POST   /api/notifications/:id/respond - Send response to AI
POST   /api/notifications/:id/read    - Mark as read
```

### AI Providers & Instances
```
GET    /api/ai/providers         - List available AI providers
GET    /api/ai/instances         - Get user's running instances
POST   /api/ai/instances         - Manually create instance
DELETE /api/ai/instances/:id     - Stop instance
GET    /api/ai/stats             - Queue and system stats
```

### Sessions
```
POST   /api/sessions             - Create session
GET    /api/sessions             - List sessions
GET    /api/sessions/:id         - Get session
DELETE /api/sessions/:id         - Delete session
POST   /api/sessions/:id/extend  - Extend session
```

### Billing
```
GET    /api/billing/plans        - Get subscription plans
POST   /api/billing/checkout     - Create Stripe checkout
POST   /api/billing/portal       - Access billing portal
PUT    /api/billing/subscription - Update subscription
POST   /api/billing/webhook      - Stripe webhook
```

## WebSocket Events

### Client → Server
```json
{
  "type": "auth",
  "payload": { "token": "jwt-token" }
}

{
  "type": "ai-response",
  "payload": { 
    "notificationId": "notif-123",
    "response": "Yes, use TypeScript"
  }
}
```

### Server → Client
```json
{
  "type": "ai-waiting",
  "payload": {
    "id": "notif-123",
    "title": "AI needs input",
    "body": "Should I use TypeScript?",
    "data": {
      "requiresResponse": true,
      "responseOptions": ["Yes", "No"],
      "instanceId": "instance-123",
      "lastOutput": "full output context..."
    }
  }
}

{
  "type": "task-update",
  "payload": {
    "taskId": "task-123",
    "status": "processing|completed|failed",
    "output": "latest output..."
  }
}

{
  "type": "task:message",
  "payload": {
    "message": {
      "type": "stdout|stderr",
      "content": "AI output line...",
      "provider": "claude-code"
    }
  }
}
```

## Data Models

### Task
```typescript
{
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
}
```

### Notification
```typescript
{
  id: string;
  userId: string;
  taskId: string;
  type: 'ai_waiting' | 'task_complete' | 'error';
  title: string;
  body: string;
  data: {
    instanceId?: string;
    lastOutput?: string;
    requiresResponse: boolean;
    responseOptions?: string[];
  };
  createdAt: Date;
  expiresAt: Date;
}
```

## Missing/Incomplete Features ⚠️

1. **Redis Dependency**: Currently requires Redis to run
2. **TypeScript Errors**: Build has errors (but runs with || true)
3. **No Database**: Using in-memory storage for users
4. **No Real AI Integration**: Agent spawning not tested with actual CLIs
5. **No Push Notifications**: Only WebSocket delivery implemented

## Client Requirements

To build a client, you need:

1. **HTTP Client**: For REST API calls
2. **WebSocket Client**: For real-time updates
3. **JWT Storage**: For auth token persistence
4. **Notification Handler**: To display AI questions
5. **Response UI**: To capture user input

## Example Client Flow

```javascript
// 1. Authenticate
const { token } = await api.post('/auth/signin', { email, password });

// 2. Connect WebSocket
ws.connect({ token });
ws.on('ai-waiting', showNotification);

// 3. Create task
const { task } = await api.post('/ai/tasks', {
  sessionId,
  command: 'Build a web app',
  provider: 'claude-code'
});

// 4. Handle AI pause
ws.on('ai-waiting', (notification) => {
  // Show notification to user
  const response = await getUserInput(notification);
  
  // Send response
  await api.post(`/notifications/${notification.id}/respond`, {
    response
  });
});

// 5. Monitor progress
ws.on('task:message', (msg) => {
  updateConsole(msg.content);
});
```