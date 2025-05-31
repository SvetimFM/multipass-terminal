#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Simple server - no auth, no Redis, just functionality
const app = express();
const PORT = 3010;
const WS_PORT = 3011;

// Allow ALL origins - we'll add security later
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Store active sessions and AI processes in memory
const sessions = new Map();
const aiProcesses = new Map();
const wsClients = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Create session - no auth required
app.post('/api/sessions', (req, res) => {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    id: sessionId,
    created: new Date(),
    commands: []
  });
  res.json({ session: { id: sessionId } });
});

// Execute AI command
app.post('/api/ai/execute', async (req, res) => {
  const { sessionId, command, provider = 'echo' } = req.body;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const taskId = uuidv4();
  
  // For demo, we'll use echo or a simple Python script
  let aiCommand, aiArgs;
  
  if (provider === 'claude-code') {
    // Simulate Claude Code
    aiCommand = 'bash';
    aiArgs = ['-c', `echo "🤖 Claude Code executing: ${command}"; sleep 2; echo "✅ Task completed!"`];
  } else if (provider === 'python') {
    aiCommand = 'python3';
    aiArgs = ['-c', `print("🐍 Python executing: ${command}"); import time; time.sleep(1); print("✅ Done!")`];
  } else {
    // Simple echo for testing
    aiCommand = 'bash';
    aiArgs = ['-c', `echo "🖥️  Executing: ${command}"; echo "Processing..."; sleep 1; echo "✅ Complete!"`];
  }
  
  const aiProcess = spawn(aiCommand, aiArgs);
  aiProcesses.set(taskId, aiProcess);
  
  // Send output to WebSocket clients
  const sendToClient = (type, content) => {
    const ws = wsClients.get(sessionId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'task:output',
        payload: { taskId, type, content }
      }));
    }
  };
  
  aiProcess.stdout.on('data', (data) => {
    console.log(`AI Output: ${data}`);
    sendToClient('stdout', data.toString());
  });
  
  aiProcess.stderr.on('data', (data) => {
    console.error(`AI Error: ${data}`);
    sendToClient('stderr', data.toString());
  });
  
  aiProcess.on('close', (code) => {
    console.log(`AI Process exited with code ${code}`);
    aiProcesses.delete(taskId);
    sendToClient('complete', `Process exited with code ${code}`);
  });
  
  res.json({ 
    task: { 
      id: taskId, 
      command, 
      provider,
      status: 'running' 
    } 
  });
});

// List available providers
app.get('/api/ai/providers', (req, res) => {
  res.json({
    providers: [
      { id: 'echo', name: 'Echo Test', available: true },
      { id: 'claude-code', name: 'Claude Code (Simulated)', available: true },
      { id: 'python', name: 'Python', available: true }
    ]
  });
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`🚀 Simple API Server running on http://localhost:${PORT}`);
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
    // Remove from clients
    for (const [sessionId, client] of wsClients) {
      if (client === ws) {
        wsClients.delete(sessionId);
        break;
      }
    }
  });
});

console.log(`🔌 WebSocket Server running on ws://localhost:${WS_PORT}`);
console.log('');
console.log('✨ Simple Ship Anywhere Server Ready!');
console.log('   No auth required - just build and ship! 🚀');