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

// Import error handling
const { errorMiddleware } = require('./src/utils/errorHandler');

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

// Load sessions metadata from file
async function loadSessions() {
  try {
    const data = await fs.readFile('.claude-sessions.json', 'utf8');
    const saved = JSON.parse(data);
    Object.entries(saved).forEach(([name, metadata]) => sessions.set(name, metadata));
  } catch (e) {
    // No saved sessions
  }
}

async function saveSessions() {
  const data = Object.fromEntries(sessions);
  await fs.writeFile('.claude-sessions.json', JSON.stringify(data, null, 2));
}

// Initialize
loadProjects();
loadSessions();

// Set up routes
const projectsRouter = require('./src/routes/projects');
const sessionsRouter = require('./src/routes/sessions');
const browseRouter = require('./src/routes/browse');

app.use('/api/projects', projectsRouter(projects, sessions, saveProjects));
app.use('/api/sessions', sessionsRouter(sessions, projects, saveSessions));
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

// AI Modes endpoint
app.get('/api/ai-modes', (req, res) => {
  const aiModes = require('./config/ai-modes');
  res.json(aiModes);
});

// Profile Actions endpoint
app.get('/api/profile-actions', (req, res) => {
  const profileActions = require('./config/profile-actions');
  res.json(profileActions);
});

// Execute profile action endpoint
app.post('/api/profile-actions/execute', express.json(), async (req, res) => {
  const { profile, projectId, cubicleIdx } = req.body;
  const profileActions = require('./config/profile-actions');
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  if (!profileActions.actions[profile]) {
    return res.status(400).json({ error: 'Invalid profile' });
  }
  
  const action = profileActions.actions[profile];
  
  try {
    // Get project path for execution context
    let execPath = process.cwd();
    if (projectId && projects.has(projectId)) {
      const project = projects.get(projectId);
      if (cubicleIdx !== undefined && project.aiOffice && project.aiOffice.cubicles[cubicleIdx]) {
        execPath = project.aiOffice.cubicles[cubicleIdx].path;
      } else {
        execPath = project.path;
      }
    }
    
    // Execute the action command
    const { stdout, stderr } = await execAsync(action.command, {
      cwd: execPath,
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    res.json({
      success: true,
      profile,
      action: action.name,
      output: stdout + (stderr ? `\n\nWarnings:\n${stderr}` : ''),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Profile action execution error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute action',
      details: error.message
    });
  }
});

// Get home directory
app.get('/api/home', (req, res) => {
  res.json({ home: process.env.HOME || '/home/user' });
});

// Error handling middleware (must be last)
app.use(errorMiddleware);

// WebSocket for terminal
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const sessionName = req.url.replace('/terminal/', '');
  
  console.log('WebSocket connection for session:', sessionName);
  
  // Parse initial dimensions from query params or use defaults
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cols = parseInt(url.searchParams.get('cols')) || 80;
  const rows = parseInt(url.searchParams.get('rows')) || 30;
  
  // Create a PTY that attaches to tmux session with proper dimensions
  const term = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
    name: 'xterm-256color',
    cols: cols,
    rows: rows,
    cwd: process.env.HOME,
    env: process.env
  });
  
  // Store terminal reference
  terminals.set(sessionName, term);
  
  // Buffer for incomplete escape sequences
  let buffer = '';
  const BUFFER_TIMEOUT = 10; // ms
  let bufferTimer = null;
  
  // Function to send buffered data
  const flushBuffer = () => {
    if (buffer && ws.readyState === WebSocket.OPEN) {
      ws.send(buffer);
      buffer = '';
    }
    bufferTimer = null;
  };
  
  term.on('data', (data) => {
    // Add data to buffer
    buffer += data;
    
    // Clear existing timer
    if (bufferTimer) {
      clearTimeout(bufferTimer);
    }
    
    // Check if we have complete escape sequences
    const escapeMatch = buffer.match(/\x1b\[[0-9;]*$/); // Incomplete escape sequence at end
    
    if (escapeMatch) {
      // We have an incomplete escape sequence, wait for more data
      bufferTimer = setTimeout(flushBuffer, BUFFER_TIMEOUT);
    } else {
      // No incomplete sequences, send immediately
      flushBuffer();
    }
  });
  
  term.on('exit', () => {
    console.log('Terminal exited for session:', sessionName);
    terminals.delete(sessionName);
    ws.close();
  });
  
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      
      if (data.type === 'resize' && data.cols && data.rows) {
        // Handle terminal resize
        term.resize(data.cols, data.rows);
        console.log(`Resized terminal ${sessionName} to ${data.cols}x${data.rows}`);
      } else if (data.type === 'input') {
        // Handle terminal input
        term.write(data.data);
      }
    } catch (e) {
      // Fallback for raw string messages (backward compatibility)
      term.write(msg.toString());
    }
  });
  
  ws.on('close', () => {
    // Flush any remaining buffer
    if (bufferTimer) {
      clearTimeout(bufferTimer);
    }
    
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