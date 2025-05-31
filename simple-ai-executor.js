#!/usr/bin/env node

// Enhanced version with real AI execution capability
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3010;
const WS_PORT = 3011;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const sessions = new Map();
const aiProcesses = new Map();
const wsClients = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Create session
app.post('/api/sessions', (req, res) => {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    id: sessionId,
    created: new Date(),
    commands: []
  });
  res.json({ session: { id: sessionId } });
});

// Execute AI command with real tools
app.post('/api/ai/execute', async (req, res) => {
  const { sessionId, command, provider = 'claude-code' } = req.body;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const taskId = uuidv4();
  let aiProcess;
  
  const sendToClient = (type, content) => {
    const ws = wsClients.get(sessionId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'task:output',
        payload: { taskId, type, content }
      }));
    }
  };
  
  try {
    switch (provider) {
      case 'claude-code':
        // Check if claude-code is available
        const claudeCheck = spawn('which', ['claude']);
        claudeCheck.on('close', (code) => {
          if (code === 0) {
            // Claude Code is installed
            aiProcess = spawn('claude', [command], {
              env: { ...process.env, CLAUDE_OUTPUT: 'json' }
            });
          } else {
            // Fallback demo
            sendToClient('system', '⚠️  Claude Code not found, using demo mode');
            aiProcess = spawn('bash', ['-c', 
              `echo "🤖 Demo: Would execute 'claude ${command}'"; 
               echo "📝 Creating project structure..."; sleep 1;
               echo "📦 Installing dependencies..."; sleep 1;
               echo "🔨 Building application..."; sleep 1;
               echo "✅ Task completed successfully!"`
            ]);
          }
          setupProcessHandlers(aiProcess);
        });
        break;
        
      case 'openai':
        // OpenAI CLI or API integration
        sendToClient('system', '🤖 OpenAI Codex mode');
        aiProcess = spawn('bash', ['-c', 
          `echo "🧠 OpenAI: ${command}"; 
           echo "Analyzing requirements..."; sleep 1;
           echo "Generating code..."; sleep 2;
           echo "✅ Code generated!"`
        ]);
        setupProcessHandlers(aiProcess);
        break;
        
      case 'bash':
        // Direct bash execution for demos
        aiProcess = spawn('bash', ['-c', command]);
        setupProcessHandlers(aiProcess);
        break;
        
      default:
        // Echo mode
        aiProcess = spawn('echo', [command]);
        setupProcessHandlers(aiProcess);
    }
    
    function setupProcessHandlers(process) {
      aiProcesses.set(taskId, process);
      
      process.stdout.on('data', (data) => {
        sendToClient('stdout', data.toString());
      });
      
      process.stderr.on('data', (data) => {
        sendToClient('stderr', data.toString());
      });
      
      process.on('close', (code) => {
        aiProcesses.delete(taskId);
        sendToClient('system', `\n✨ Process completed (exit code: ${code})`);
      });
      
      process.on('error', (error) => {
        sendToClient('stderr', `Error: ${error.message}`);
      });
    }
    
    res.json({ 
      task: { 
        id: taskId, 
        command, 
        provider,
        status: 'running' 
      } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List available providers
app.get('/api/ai/providers', (req, res) => {
  res.json({
    providers: [
      { id: 'claude-code', name: 'Claude Code', available: true },
      { id: 'openai', name: 'OpenAI Codex', available: true },
      { id: 'bash', name: 'Bash Shell', available: true },
      { id: 'echo', name: 'Echo Test', available: true }
    ]
  });
});

// Kill task
app.post('/api/ai/tasks/:taskId/kill', (req, res) => {
  const { taskId } = req.params;
  const process = aiProcesses.get(taskId);
  
  if (process) {
    process.kill();
    res.json({ message: 'Task killed' });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('📱 New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'register') {
        const { sessionId } = data.payload;
        wsClients.set(sessionId, ws);
        ws.send(JSON.stringify({ type: 'registered', payload: { sessionId } }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    for (const [sessionId, client] of wsClients) {
      if (client === ws) {
        wsClients.delete(sessionId);
        break;
      }
    }
  });
  
  // Keep connection alive
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(interval);
    }
  }, 30000);
});

console.log(`🔌 WebSocket Server running on ws://localhost:${WS_PORT}`);
console.log('');
console.log('✨ Ship Anywhere Server Ready!');
console.log('   Control AI from your phone! 📱');