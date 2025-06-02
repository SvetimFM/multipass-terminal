#!/usr/bin/env node

// Multipass - Terminal for AI with per-project AI Offices
require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const pty = require('node-pty');

const app = express();
const PORT = process.env.PORT || 9999;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/public')));

// In-memory storage
const sessions = new Map();
const terminals = new Map();
const projects = new Map();

// Load configuration
const { LLM_CONFIG, PROJECTS_FILE } = require('./src/utils/constants');

// Load projects from file
async function loadProjects() {
  try {
    const data = await fs.readFile(PROJECTS_FILE, 'utf8');
    const saved = JSON.parse(data);
    saved.forEach(p => projects.set(p.id, p));
  } catch (e) {
    // Default projects
    projects.set('default', { id: 'default', name: 'Default', path: process.cwd() });
  }
}

async function saveProjects() {
  const data = Array.from(projects.values());
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2));
}

// Initialize
loadProjects();

// Set up routes
const projectsRouter = require('./src/routes/projects');
const sessionsRouter = require('./src/routes/sessions');
const browseRouter = require('./src/routes/browse');

app.use('/api/projects', projectsRouter(projects, sessions, saveProjects));
app.use('/api/sessions', sessionsRouter(sessions, projects));
app.use('/api/browse', browseRouter);

// Configuration endpoint
app.get('/api/config', (req, res) => {
  const currentLLM = LLM_CONFIG.llms[LLM_CONFIG.default];
  res.json({
    currentLLM: {
      name: currentLLM.name,
      command: currentLLM.command,
      sessionPrefix: currentLLM.sessionPrefix,
      exitSequence: currentLLM.exitSequence,
      exitDelay: currentLLM.exitDelay
    },
    ui: LLM_CONFIG.ui,
    availableLLMs: Object.keys(LLM_CONFIG.llms)
  });
});

// Get home directory
app.get('/api/home', (req, res) => {
  res.json({ home: process.env.HOME || '/home/user' });
});

// WebSocket for terminal
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const sessionName = req.url.replace('/terminal/', '');
  
  console.log('WebSocket connection for session:', sessionName);
  
  // Create a PTY that attaches to tmux session
  const term = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  });
  
  term.on('data', (data) => {
    ws.send(data);
  });
  
  term.on('exit', () => {
    console.log('Terminal exited for session:', sessionName);
    terminals.delete(sessionName);
    ws.close();
  });
  
  ws.on('message', (msg) => {
    term.write(msg.toString());
  });
  
  ws.on('close', () => {
    if (terminals.has(sessionName)) {
      term.kill();
      terminals.delete(sessionName);
    }
  });
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`
🚀 Multipass - Terminal for AI
   
   Access: http://${HOST}:${PORT}
   
   Features:
   ✓ Project management with per-project AI Offices
   ✓ AI Office: Multiple cubicle terminals per project
   ✓ Consolidated AI Offices view
   ✓ Full terminal access in browser
   ✓ Session management
   ✓ Mobile optimized
   ✓ NO AUTHENTICATION - Direct access!
  `);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});