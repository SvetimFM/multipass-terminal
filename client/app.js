// Ship Anywhere Mobile Client
// Optimized for vertical mobile experience

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3010' 
  : window.API_URL || 'https://api.shipanywhere.dev';

const WS_URL = window.location.hostname === 'localhost'
  ? 'ws://localhost:3011'
  : window.WS_URL || 'wss://ws.shipanywhere.dev';

// Icons (using Unicode and emoji for simplicity)
const Icons = {
  send: '→',
  loader: '⟳',
  wifi: '📶',
  wifiOff: '📵',
  bot: '🤖',
  terminal: '💻',
  sparkles: '✨',
  close: '✕',
  chevronDown: '⌄'
};

// Utility functions
const formatTime = (date) => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
};

const vibrate = (pattern) => {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

// API Client
class ApiClient {
  constructor() {
    this.token = localStorage.getItem('ship_anywhere_token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('ship_anywhere_token', token);
  }

  async request(method, endpoint, data) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error || response.statusText;
      console.error('API Error Details:', errorData);
      throw new Error(`API Error: ${JSON.stringify(errorMessage)}`);
    }

    return response.json();
  }

  async login(email, password) {
    const data = await this.request('POST', '/api/auth/signin', { email, password });
    this.setToken(data.token);
    return data;
  }

  async createSession() {
    return this.request('POST', '/api/sessions', {});
  }

  async createTask(sessionId, command, provider = 'claude-code') {
    return this.request('POST', '/api/ai/tasks', {
      sessionId,
      command,
      provider
    });
  }

  async respondToNotification(notificationId, response) {
    return this.request('POST', `/api/notifications/${notificationId}/respond`, {
      response
    });
  }
}

// WebSocket Manager
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.listeners = new Map();
    this.reconnectTimeout = null;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  emit(type, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type,
        payload,
        messageId: `msg-${Date.now()}`,
        timestamp: new Date().toISOString()
      }));
    }
  }

  connect(token) {
    if (!token) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.updateConnectionStatus(true);
      
      // Authenticate
      this.emit('auth', { token });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const handlers = this.listeners.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message.payload));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.isConnected = false;
      this.updateConnectionStatus(false);
      
      // Reconnect after 3 seconds
      this.reconnectTimeout = setTimeout(() => {
        this.connect(token);
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      statusEl.innerHTML = connected
        ? `<span class="text-green-400">${Icons.wifi} Connected</span>`
        : `<span class="text-red-400">${Icons.wifiOff} Offline</span>`;
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close();
  }
}

// App State
const state = {
  token: localStorage.getItem('ship_anywhere_token'),
  sessionId: null,
  currentTask: null,
  notification: null,
  messages: [],
  isExecuting: false,
  provider: 'claude-code',
  showProviders: false
};

// Global instances
const api = new ApiClient();
const ws = new WebSocketManager();

// UI Components
function NotificationModal({ notification, onRespond, onDismiss }) {
  const { responseOptions, lastOutput } = notification.data || {};
  
  return `
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end" id="notification-modal">
      <div class="bg-gray-900 w-full rounded-t-3xl animate-slide-up">
        <div class="w-12 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-4"></div>
        
        <div class="px-6 pb-2">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center">
                <span class="text-xl">${Icons.bot}</span>
              </div>
              <div>
                <h3 class="font-semibold">AI needs your input</h3>
                <p class="text-xs text-gray-400">${formatTime(new Date())}</p>
              </div>
            </div>
            <button onclick="dismissNotification()" class="p-2 text-gray-400">
              <span class="text-xl">${Icons.close}</span>
            </button>
          </div>
        </div>
        
        <div class="px-6">
          <div class="bg-black rounded-2xl p-4 mb-4 max-h-48 overflow-y-auto">
            <pre class="text-sm text-gray-300 whitespace-pre-wrap font-mono">
${lastOutput || notification.body}
            </pre>
          </div>
          
          ${responseOptions && responseOptions.length > 0 ? `
            <div class="mb-4">
              <p class="text-xs text-gray-400 mb-2">Quick responses</p>
              <div class="flex gap-2 flex-wrap">
                ${responseOptions.map(option => `
                  <button onclick="sendNotificationResponse('${option}')" 
                    class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-full text-sm transition-colors">
                    ${option}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <div class="flex gap-2 mb-6">
            <input type="text" id="notification-input"
              placeholder="Type your response..."
              class="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              onkeypress="if(event.key==='Enter') sendTextResponse()"
              autofocus>
            <button onclick="sendTextResponse()"
              class="bg-blue-600 p-3 rounded-full transition-colors">
              <span class="text-xl">${Icons.send}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function ConsoleOutput({ messages }) {
  if (messages.length === 0) {
    return `
      <div class="text-gray-600 text-center py-8">
        <div class="text-5xl mb-3 opacity-50">${Icons.terminal}</div>
        <p>AI output will appear here...</p>
      </div>
    `;
  }
  
  return messages.map(msg => `
    <div class="mb-1">
      <span class="text-gray-500">[${formatTime(msg.timestamp)}]</span>
      <span class="${msg.type === 'stderr' ? 'text-red-400' : 'text-green-400'}">
        ${msg.content}
      </span>
    </div>
  `).join('');
}

// Event handlers
async function executeCommand() {
  const input = document.getElementById('command-input');
  const command = input.value.trim();
  
  if (!command || !state.sessionId || state.isExecuting) return;
  
  state.isExecuting = true;
  state.messages = [];
  render();
  
  try {
    const { task } = await api.createTask(state.sessionId, command, state.provider);
    state.currentTask = task;
    input.value = '';
    render();
  } catch (error) {
    console.error('Failed to create task:', error);
    state.isExecuting = false;
    render();
  }
}

async function sendNotificationResponse(response) {
  if (!state.notification) return;
  
  try {
    await api.respondToNotification(state.notification.id, response);
    state.notification = null;
    render();
  } catch (error) {
    console.error('Failed to respond:', error);
  }
}

function sendTextResponse() {
  const input = document.getElementById('notification-input');
  if (input?.value.trim()) {
    sendNotificationResponse(input.value);
  }
}

function dismissNotification() {
  state.notification = null;
  render();
}

function toggleProviders() {
  state.showProviders = !state.showProviders;
  render();
}

function selectProvider(provider) {
  state.provider = provider;
  state.showProviders = false;
  render();
}

function setCommand(cmd) {
  const input = document.getElementById('command-input');
  if (input) {
    input.value = cmd;
    input.focus();
  }
}

// Main render function
function render() {
  const app = document.getElementById('root');
  
  app.innerHTML = `
    <div class="h-screen bg-gray-950 text-white flex flex-col">
      <!-- Status Bar -->
      <div class="status-bar bg-gray-900 px-4 py-2 flex items-center justify-between border-b border-gray-800">
        <div class="flex items-center gap-3">
          <span class="text-xl">${Icons.sparkles}</span>
          <span class="font-semibold">Ship Anywhere</span>
        </div>
        <div class="flex items-center gap-2 text-xs" id="connection-status">
          <span class="text-gray-400">Connecting...</span>
        </div>
      </div>
      
      <!-- Current Task Status -->
      ${state.currentTask ? `
        <div class="bg-gray-900 border-b border-gray-800 px-4 py-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <div>
                <p class="text-sm font-medium">Executing command</p>
                <p class="text-xs text-gray-400">${state.currentTask.provider}</p>
              </div>
            </div>
            ${state.isExecuting ? `<span class="animate-spin">${Icons.loader}</span>` : ''}
          </div>
        </div>
      ` : ''}
      
      <!-- Console Output -->
      <div class="flex-1 bg-black overflow-y-auto">
        <div class="p-4 font-mono text-xs" id="console-output">
          ${ConsoleOutput({ messages: state.messages })}
        </div>
      </div>
      
      <!-- Command Input -->
      <div class="bg-gray-900 border-t border-gray-800">
        <!-- Provider selector -->
        <div class="px-4 py-2 border-b border-gray-800">
          <button onclick="toggleProviders()" class="flex items-center gap-2 text-sm text-gray-400">
            <span>${Icons.bot}</span>
            <span>${state.provider}</span>
            <span class="${state.showProviders ? 'rotate-180' : ''} inline-block transition-transform">
              ${Icons.chevronDown}
            </span>
          </button>
          
          ${state.showProviders ? `
            <div class="mt-2 space-y-1">
              ${['claude-code', 'github-copilot', 'openai-terminal'].map(p => `
                <button onclick="selectProvider('${p}')"
                  class="block w-full text-left px-3 py-2 rounded text-sm ${
                    state.provider === p ? 'bg-gray-800' : 'hover:bg-gray-800'
                  }">
                  ${p}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <!-- Input field -->
        <div class="flex gap-2 p-4">
          <input type="text" id="command-input"
            placeholder="Enter command..."
            ${state.isExecuting || !state.sessionId ? 'disabled' : ''}
            class="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
            onkeypress="if(event.key==='Enter') executeCommand()">
          <button onclick="executeCommand()"
            ${!state.sessionId || state.isExecuting ? 'disabled' : ''}
            class="bg-blue-600 disabled:bg-gray-700 disabled:opacity-50 p-3 rounded-full transition-colors">
            <span class="text-xl">${state.isExecuting ? Icons.loader : Icons.send}</span>
          </button>
        </div>
        
        <!-- Quick commands -->
        <div class="px-4 pb-4 flex gap-2 overflow-x-auto">
          ${['npm test', 'git status', 'npm run build'].map(cmd => `
            <button onclick="setCommand('${cmd}')"
              ${state.isExecuting ? 'disabled' : ''}
              class="bg-gray-800 px-3 py-1 rounded-full text-xs whitespace-nowrap">
              ${cmd}
            </button>
          `).join('')}
        </div>
      </div>
      
      <!-- AI Notification Modal -->
      ${state.notification ? NotificationModal({
        notification: state.notification,
        onRespond: sendNotificationResponse,
        onDismiss: dismissNotification
      }) : ''}
    </div>
  `;
  
  // Auto-scroll console
  const consoleEl = document.getElementById('console-output');
  if (consoleEl) {
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

// Initialize app
async function init() {
  // Check for existing auth
  if (!state.token) {
    // For demo, use a fixed test account
    try {
      const email = 'demo@example.com';
      const password = 'password123';
      
      try {
        // Try login first
        const loginData = await api.login(email, password);
        state.token = loginData.token;
      } catch (loginError) {
        // If login fails, try signup
        console.log('Login failed, trying signup...');
        const signupData = await api.request('POST', '/api/auth/signup', { email, password });
        state.token = signupData.token;
      }
      
      api.setToken(state.token);
    } catch (error) {
      console.error('Auth failed:', error);
      alert('Failed to authenticate. Check server connection.');
      return;
    }
  }
  
  // Create session
  try {
    const { session } = await api.createSession();
    state.sessionId = session.id;
  } catch (error) {
    console.error('Failed to create session:', error);
  }
  
  // Connect WebSocket
  ws.connect(state.token);
  
  // Set up WebSocket listeners
  ws.on('ai-waiting', (payload) => {
    console.log('AI waiting notification:', payload);
    state.notification = payload;
    vibrate([100, 50, 100]);
    render();
  });
  
  ws.on('task:message', (payload) => {
    const { message } = payload;
    state.messages.push({
      id: `msg-${Date.now()}`,
      type: message.type,
      content: message.content,
      timestamp: new Date()
    });
    render();
  });
  
  ws.on('task-update', (payload) => {
    if (payload.status === 'completed' || payload.status === 'failed') {
      state.isExecuting = false;
      state.currentTask = null;
      render();
    }
  });
  
  // Initial render
  render();
}

// Start the app
init();