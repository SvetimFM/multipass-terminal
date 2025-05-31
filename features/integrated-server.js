#!/usr/bin/env node

// Integrated Ship Anywhere Server with all dream features
// This combines the simple server with voice, marketplace, and collaboration

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Import feature modules
const voiceRouter = require('./voice-commands');
const marketplaceRouter = require('./ai-marketplace');
const collabRouter = require('./collaborative-coding');

const app = express();
const PORT = process.env.PORT || 3010;
const WS_PORT = process.env.WS_PORT || 3011;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Core state
const sessions = new Map();
const aiProcesses = new Map();
const wsClients = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date(),
    features: ['voice', 'marketplace', 'collaboration'],
    version: '2.0.0'
  });
});

// Core API - Sessions
app.post('/api/sessions', (req, res) => {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    id: sessionId,
    created: new Date(),
    commands: [],
    installedAgents: ['claude-code', 'echo'],
    collaborators: []
  });
  res.json({ session: { id: sessionId } });
});

// Core API - Execute with agent support
app.post('/api/ai/execute', async (req, res) => {
  const { sessionId, command, provider = 'claude-code' } = req.body;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const session = sessions.get(sessionId);
  const taskId = uuidv4();
  
  // Check if agent is installed
  if (!session.installedAgents.includes(provider)) {
    return res.status(403).json({ 
      error: 'Agent not installed', 
      suggestion: `Install ${provider} from the marketplace`
    });
  }
  
  // Send output to WebSocket
  const sendToClient = (type, content) => {
    const ws = wsClients.get(sessionId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'task:output',
        payload: { taskId, type, content }
      }));
    }
  };
  
  // Execute based on provider
  let aiProcess;
  
  switch (provider) {
    case 'claude-code':
      aiProcess = spawn('bash', ['-c', 
        `echo "🤖 Claude Code: Analyzing '${command}'..."; 
         sleep 1;
         echo "📝 Generating solution..."; 
         sleep 1;
         echo "// Generated code for: ${command}";
         echo "const solution = () => {";
         echo "  // Implementation here";
         echo "};";
         echo "";
         echo "✅ Task completed!"`
      ]);
      break;
      
    case 'security-auditor':
      aiProcess = spawn('bash', ['-c',
        `echo "🔒 Security Audit: Scanning for vulnerabilities...";
         sleep 1;
         echo "🔍 Checking dependencies...";
         echo "⚠️  Found 2 medium severity issues";
         echo "📋 Generating report...";
         sleep 1;
         echo "✅ Audit complete - 2 issues to review"`
      ]);
      break;
      
    default:
      aiProcess = spawn('echo', [`${provider}: ${command}`]);
  }
  
  aiProcesses.set(taskId, aiProcess);
  
  // Handle output
  aiProcess.stdout.on('data', (data) => {
    sendToClient('stdout', data.toString());
  });
  
  aiProcess.stderr.on('data', (data) => {
    sendToClient('stderr', data.toString());
  });
  
  aiProcess.on('close', (code) => {
    aiProcesses.delete(taskId);
    sendToClient('system', `Process completed (exit: ${code})`);
  });
  
  // Track command
  session.commands.push({ taskId, command, provider, timestamp: new Date() });
  
  res.json({ 
    task: { 
      id: taskId, 
      command, 
      provider,
      status: 'running' 
    } 
  });
});

// List providers including installed agents
app.get('/api/ai/providers', (req, res) => {
  const { sessionId } = req.query;
  
  const baseProviders = [
    { id: 'claude-code', name: 'Claude Code', available: true, installed: true },
    { id: 'echo', name: 'Echo Test', available: true, installed: true }
  ];
  
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    const additionalProviders = session.installedAgents
      .filter(id => !['claude-code', 'echo'].includes(id))
      .map(id => ({
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        available: true,
        installed: true
      }));
      
    return res.json({ 
      providers: [...baseProviders, ...additionalProviders] 
    });
  }
  
  res.json({ providers: baseProviders });
});

// Mount feature routers
app.use('/api/features', voiceRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/collab', collabRouter);

// Install agent endpoint (bridges marketplace to core)
app.post('/api/marketplace/agents/:agentId/install', (req, res) => {
  const { sessionId } = req.body;
  const { agentId } = req.params;
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(400).json({ error: 'Invalid session' });
  }
  
  const session = sessions.get(sessionId);
  if (!session.installedAgents.includes(agentId)) {
    session.installedAgents.push(agentId);
  }
  
  res.json({ 
    message: `Installed ${agentId}`,
    installedAgents: session.installedAgents
  });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`
🚀 Ship Anywhere Dream Server
=============================
📡 API Server: http://localhost:${PORT}
🔌 WebSocket: ws://localhost:${WS_PORT}

✨ Features Enabled:
   🎤 Voice Commands
   🏪 AI Marketplace  
   👥 Collaborative Coding
   🤖 Multi-Agent Support

Ready to ship from anywhere! 📱💻
  `);
});

// WebSocket server with enhanced features
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('📱 New connection established');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'register':
          const { sessionId } = data.payload;
          wsClients.set(sessionId, ws);
          
          // Send enhanced registration response
          ws.send(JSON.stringify({ 
            type: 'registered', 
            payload: { 
              sessionId,
              features: ['voice', 'marketplace', 'collaboration'],
              installedAgents: sessions.get(sessionId)?.installedAgents || []
            } 
          }));
          break;
          
        case 'voice-start':
          ws.send(JSON.stringify({
            type: 'voice-ready',
            payload: { listening: true }
          }));
          break;
          
        case 'marketplace-sync':
          // Sync installed agents
          const session = sessions.get(data.payload.sessionId);
          if (session) {
            ws.send(JSON.stringify({
              type: 'marketplace-update',
              payload: { installedAgents: session.installedAgents }
            }));
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    // Clean up
    for (const [sessionId, client] of wsClients) {
      if (client === ws) {
        wsClients.delete(sessionId);
        break;
      }
    }
  });
  
  // Keep alive
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(interval);
    }
  }, 30000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Kill all AI processes
  aiProcesses.forEach(proc => proc.kill());
  
  // Close WebSocket server
  wss.close();
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ Server shut down complete');
    process.exit(0);
  });
});