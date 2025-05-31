# Client Requirements for Ship Anywhere

## Overview

The server provides a complete API for managing AI agent instances and handling the interactive flow. Here's what a client needs to implement.

## Core Client Components

### 1. Authentication Manager
```typescript
interface AuthManager {
  login(email: string, password: string): Promise<string>;
  signup(email: string, password: string): Promise<string>;
  logout(): void;
  getToken(): string | null;
  isAuthenticated(): boolean;
}
```

### 2. API Client
```typescript
interface ApiClient {
  // Base configuration
  baseUrl: string;
  token: string | null;
  
  // Methods
  get(endpoint: string): Promise<any>;
  post(endpoint: string, data: any): Promise<any>;
  put(endpoint: string, data: any): Promise<any>;
  delete(endpoint: string): Promise<any>;
}
```

### 3. WebSocket Manager
```typescript
interface WebSocketManager {
  connect(token: string): void;
  disconnect(): void;
  on(event: string, handler: Function): void;
  send(type: string, payload: any): void;
}
```

### 4. Notification Handler
```typescript
interface NotificationHandler {
  // Display AI waiting notifications
  showAIWaiting(notification: Notification): void;
  
  // Capture user response
  getUserResponse(options?: string[]): Promise<string>;
  
  // Send response to server
  sendResponse(notificationId: string, response: string): Promise<void>;
}
```

### 5. Task Manager
```typescript
interface TaskManager {
  createTask(command: string, provider?: string): Promise<Task>;
  getTask(taskId: string): Promise<Task>;
  cancelTask(taskId: string): Promise<void>;
  listTasks(): Promise<Task[]>;
}
```

## Required UI Components

### 1. Command Input
- Text input for AI commands
- Provider selector (Claude Code, Copilot, etc.)
- Submit button

### 2. Output Console
- Real-time AI output display
- Syntax highlighting for code
- Error/warning indicators

### 3. Notification Display
- Modal or push notification for AI questions
- Response options (buttons for yes/no, text input for open-ended)
- Timeout indicator

### 4. Task List
- Active tasks with status
- History of completed tasks
- Cancel/retry options

### 5. Settings
- Provider preferences
- Notification preferences
- Account management

## Implementation Flow

```javascript
// 1. Initialize client
const client = new ShipAnywhereClient({
  apiUrl: 'http://localhost:3010',
  wsUrl: 'ws://localhost:3011'
});

// 2. Authenticate
await client.auth.login(email, password);

// 3. Connect WebSocket
client.ws.connect();

// 4. Set up notification handler
client.ws.on('ai-waiting', async (notification) => {
  // Show notification to user
  const response = await showNotificationModal(notification);
  
  // Send response
  await client.notifications.respond(notification.id, response);
});

// 5. Create and monitor task
const task = await client.tasks.create('Build a React app');

// 6. Handle real-time updates
client.ws.on('task:message', (msg) => {
  updateConsole(msg.content);
});
```

## Mobile-Specific Considerations

### iOS/Android
- Push notification support
- Background WebSocket handling
- Offline queue for responses
- Biometric auth for quick responses

### Web PWA
- Service worker for notifications
- Persistent WebSocket connection
- Local storage for auth token
- Responsive design

## State Management

```typescript
interface AppState {
  auth: {
    isAuthenticated: boolean;
    user: User | null;
    token: string | null;
  };
  tasks: {
    active: Task[];
    history: Task[];
    current: Task | null;
  };
  notifications: {
    pending: Notification[];
    unread: number;
  };
  ui: {
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;
  };
}
```

## Error Handling

1. **Network Errors**: Retry with exponential backoff
2. **Auth Errors**: Redirect to login
3. **WebSocket Disconnect**: Auto-reconnect with state recovery
4. **Task Failures**: Show error with retry option

## Testing Checklist

- [ ] Can authenticate (signup/login)
- [ ] WebSocket connects and maintains connection
- [ ] Can create AI tasks
- [ ] Receives AI waiting notifications
- [ ] Can respond to notifications
- [ ] Sees real-time AI output
- [ ] Can cancel running tasks
- [ ] Handles disconnections gracefully
- [ ] Works on mobile devices
- [ ] Supports multiple concurrent tasks

## Example React Component

```jsx
function TaskRunner() {
  const [output, setOutput] = useState('');
  const [notification, setNotification] = useState(null);
  
  useEffect(() => {
    // Connect WebSocket
    ws.on('ai-waiting', setNotification);
    ws.on('task:message', (msg) => {
      setOutput(prev => prev + '\n' + msg.content);
    });
  }, []);
  
  const handleResponse = async (response) => {
    await api.post(`/notifications/${notification.id}/respond`, {
      response
    });
    setNotification(null);
  };
  
  return (
    <div>
      <CommandInput onSubmit={createTask} />
      <Console output={output} />
      {notification && (
        <NotificationModal
          notification={notification}
          onRespond={handleResponse}
        />
      )}
    </div>
  );
}
```