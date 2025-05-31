import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader, Terminal, Wifi, WifiOff, Bot, AlertCircle, ChevronDown, X, Sparkles, Zap, Clock } from 'lucide-react';

// API Configuration
const API_URL = (window as any).REACT_APP_API_URL || 'http://localhost:3010';
const WS_URL = (window as any).REACT_APP_WS_URL || 'ws://localhost:3011';

// Helper: Format timestamp
const formatTime = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
};

// WebSocket Hook
const useWebSocket = (token: string | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const listeners = useRef<Map<string, Set<(payload: any) => void>>>(new Map());

  const on = useCallback((event: string, handler: (payload: any) => void) => {
    if (!listeners.current.has(event)) {
      listeners.current.set(event, new Set());
    }
    listeners.current.get(event)!.add(handler);

    return () => {
      listeners.current.get(event)?.delete(handler);
    };
  }, []);

  const emit = useCallback((type: string, payload: any) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type,
        payload,
        messageId: `msg-${Date.now()}`,
        timestamp: new Date().toISOString()
      }));
    }
  }, [ws]);

  const connect = useCallback(() => {
    if (!token) return;

    const websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // Authenticate
      websocket.send(JSON.stringify({
        type: 'auth',
        payload: { token },
        messageId: 'auth-msg',
        timestamp: new Date().toISOString()
      }));
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Trigger all listeners for this event type
        const handlers = listeners.current.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message.payload));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);
  }, [token]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      ws?.close();
    };
  }, [connect]);

  return { isConnected, on, emit };
};

// API Client
class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private async request(method: string, endpoint: string, data?: any) {
    const headers: HeadersInit = {
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
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async createSession() {
    return this.request('POST', '/api/sessions', {});
  }

  async createTask(sessionId: string, command: string, provider: string = 'claude-code') {
    return this.request('POST', '/api/ai/tasks', {
      sessionId,
      command,
      provider
    });
  }

  async respondToNotification(notificationId: string, response: string) {
    return this.request('POST', `/api/notifications/${notificationId}/respond`, {
      response
    });
  }

  async getProviders() {
    return this.request('GET', '/api/ai/providers');
  }
}

// Notification Modal Component
interface Notification {
  id: string;
  body: string;
  data?: {
    responseOptions?: string[];
    lastOutput?: string;
  };
}

interface NotificationModalProps {
  notification: Notification;
  onRespond: (response: string) => void;
  onDismiss: () => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({ notification, onRespond, onDismiss }) => {
  const [inputValue, setInputValue] = useState('');
  const { responseOptions, lastOutput } = notification.data || {};

  const handleQuickResponse = (response: string) => {
    onRespond(response);
  };

  const handleTextResponse = () => {
    if (inputValue.trim()) {
      onRespond(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end">
      <div className="bg-gray-900 w-full rounded-t-3xl animate-slide-up">
        {/* Handle */}
        <div className="w-12 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-4" />

        {/* Header */}
        <div className="px-6 pb-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">AI needs your input</h3>
                <p className="text-xs text-gray-400">{formatTime(new Date())}</p>
              </div>
            </div>
            <button onClick={onDismiss} className="p-2">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6">
          <div className="bg-black rounded-2xl p-4 mb-4 max-h-48 overflow-y-auto">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
              {lastOutput || notification.body}
            </pre>
          </div>

          {/* Quick responses */}
          {responseOptions && responseOptions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-2">Quick responses</p>
              <div className="flex gap-2 flex-wrap">
                {responseOptions.map((option: string) => (
                  <button
                    key={option}
                    onClick={() => handleQuickResponse(option)}
                    className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-full text-sm transition-colors"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Text input */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
              onKeyPress={(e: React.KeyboardEvent) => e.key === 'Enter' && handleTextResponse()}
              placeholder="Type your response..."
              className="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              autoFocus
            />
            <button
              onClick={handleTextResponse}
              disabled={!inputValue.trim()}
              className="bg-blue-600 disabled:bg-gray-700 disabled:opacity-50 p-3 rounded-full transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Console Output Component
interface Message {
  id: string;
  type: string;
  content: string;
  timestamp: Date;
}

interface ConsoleOutputProps {
  messages: Message[];
}

const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ messages }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 bg-black overflow-y-auto">
      <div className="p-4 font-mono text-xs">
        {messages.length === 0 ? (
          <div className="text-gray-600 text-center py-8">
            <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>AI output will appear here...</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="mb-1">
              <span className="text-gray-500">[{formatTime(msg.timestamp)}]</span>{' '}
              <span className={msg.type === 'stderr' ? 'text-red-400' : 'text-green-400'}>
                {msg.content}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};

interface Task {
  id: string;
  provider: string;
  status: string;
}

// Main App Component
const ShipAnywhereMobile: React.FC = () => {
  const [token] = useState('demo-token'); // In real app, get from auth
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [provider, setProvider] = useState('claude-code');
  const [showProviders, setShowProviders] = useState(false);

  const api = useRef(new ApiClient()).current;
  const { isConnected, on, emit } = useWebSocket(token);

  // Initialize
  useEffect(() => {
    if (token) {
      api.setToken(token);
      initializeSession();
    }
  }, [token]);

  // WebSocket listeners
  useEffect(() => {
    const unsubscribe = [
      on('ai-waiting', (payload: any) => {
        console.log('AI waiting notification:', payload);
        setNotification(payload);
        
        // Vibrate for notification
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      }),

      on('task:message', (payload: any) => {
        console.log('Task message:', payload);
        const { message } = payload;
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: message.type,
          content: message.content,
          timestamp: new Date()
        }]);
      }),

      on('task-update', (payload: any) => {
        console.log('Task update:', payload);
        if (payload.status === 'completed' || payload.status === 'failed') {
          setIsExecuting(false);
          setCurrentTask(null);
        }
      })
    ];

    return () => {
      unsubscribe.forEach(unsub => unsub());
    };
  }, [on]);

  const initializeSession = async () => {
    try {
      const { session } = await api.createSession();
      setSessionId(session.id);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const executeCommand = async () => {
    if (!command.trim() || !sessionId || isExecuting) return;

    setIsExecuting(true);
    setMessages([]);

    try {
      const { task } = await api.createTask(sessionId, command, provider);
      setCurrentTask(task);
      setCommand('');
    } catch (error) {
      console.error('Failed to create task:', error);
      setIsExecuting(false);
    }
  };

  const handleNotificationResponse = async (response: string) => {
    if (!notification) return;

    try {
      await api.respondToNotification(notification.id, response);
      setNotification(null);
    } catch (error) {
      console.error('Failed to respond:', error);
    }
  };

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col">
      {/* Status Bar */}
      <div className="bg-gray-900 px-4 py-2 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-blue-500" />
          <span className="font-semibold">Ship Anywhere</span>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-400" />
          )}
          <span className="text-xs text-gray-400">
            {isConnected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Current Task Status */}
      {currentTask && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <div>
                <p className="text-sm font-medium">Executing command</p>
                <p className="text-xs text-gray-400">{currentTask.provider}</p>
              </div>
            </div>
            {isExecuting && <Loader className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
        </div>
      )}

      {/* Console Output */}
      <ConsoleOutput messages={messages} />

      {/* Command Input */}
      <div className="bg-gray-900 border-t border-gray-800">
        {/* Provider selector */}
        <div className="px-4 py-2 border-b border-gray-800">
          <button
            onClick={() => setShowProviders(!showProviders)}
            className="flex items-center gap-2 text-sm text-gray-400"
          >
            <Bot className="w-4 h-4" />
            <span>{provider}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showProviders ? 'rotate-180' : ''}`} />
          </button>
          
          {showProviders && (
            <div className="mt-2 space-y-1">
              {['claude-code', 'github-copilot', 'openai-terminal'].map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setProvider(p);
                    setShowProviders(false);
                  }}
                  className={`block w-full text-left px-3 py-2 rounded text-sm ${
                    provider === p ? 'bg-gray-800' : 'hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input field */}
        <div className="flex gap-2 p-4">
          <input
            type="text"
            value={command}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
            onKeyPress={(e: React.KeyboardEvent) => e.key === 'Enter' && executeCommand()}
            placeholder="Enter command..."
            disabled={isExecuting || !sessionId}
            className="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
          />
          <button
            onClick={executeCommand}
            disabled={!command.trim() || isExecuting || !sessionId}
            className="bg-blue-600 disabled:bg-gray-700 disabled:opacity-50 p-3 rounded-full transition-colors"
          >
            {isExecuting ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Quick commands */}
        <div className="px-4 pb-4 flex gap-2 overflow-x-auto">
          {['npm test', 'git status', 'npm run build'].map(cmd => (
            <button
              key={cmd}
              onClick={() => setCommand(cmd)}
              disabled={isExecuting}
              className="bg-gray-800 px-3 py-1 rounded-full text-xs whitespace-nowrap"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* AI Notification Modal */}
      {notification && (
        <NotificationModal
          notification={notification}
          onRespond={handleNotificationResponse}
          onDismiss={() => setNotification(null)}
        />
      )}
    </div>
  );
};

export default ShipAnywhereMobile;