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

// Serve .tmux.conf file
app.get('/.tmux.conf', (req, res) => {
  res.sendFile(path.join(__dirname, '.tmux.conf'));
});

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
    console.log(`Loaded ${projects.size} projects from ${PROJECTS_FILE}`);
  } catch (e) {
    console.error('Error loading projects:', e.message);
    // Default projects
    projects.set('default', { id: 'default', name: 'Default', path: process.cwd() });
    console.log('Created default project');
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

// Initialize and start server
async function initialize() {
  // Load data
  await loadProjects();
  await loadSessions();

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

// Button Configuration endpoint
app.get('/api/button-config', (req, res) => {
  const buttonConfig = require('./config/buttons.config');
  res.json(buttonConfig);
});


// Get home directory
app.get('/api/home', (req, res) => {
  res.json({ home: process.env.HOME || '/home/user' });
});

// Tmux config endpoint
app.post('/api/tmux-config', async (req, res) => {
  const { config } = req.body;
  
  if (!config) {
    return res.status(400).json({ error: 'No configuration provided' });
  }
  
  try {
    // Create temporary tmux config file
    const tmpFile = path.join(require('os').tmpdir(), `tmux-${Date.now()}.conf`);
    await fs.writeFile(tmpFile, config);
    
    // Apply the config to all active tmux sessions
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Get all active sessions
    const { stdout: sessionList } = await execPromise('tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""');
    const sessions = sessionList.trim().split('\n').filter(Boolean);
    
    // Apply config to each session
    for (const session of sessions) {
      try {
        await execPromise(`tmux source-file ${tmpFile} -t "${session}"`);
      } catch (e) {
        console.error(`Failed to apply config to session ${session}:`, e.message);
      }
    }
    
    // Also update the default .tmux.conf
    const tmuxConfPath = path.join(process.env.HOME || '/home/user', '.tmux.conf');
    await fs.writeFile(tmuxConfPath, config);
    
    // Clean up temp file
    await fs.unlink(tmpFile).catch(() => {});
    
    res.json({ 
      success: true, 
      message: `Configuration applied to ${sessions.length} active sessions`,
      sessions: sessions.length
    });
  } catch (error) {
    console.error('Error applying tmux config:', error);
    res.status(500).json({ error: 'Failed to apply configuration' });
  }
});

// Get current tmux config
app.get('/api/tmux-config', async (req, res) => {
  try {
    const tmuxConfPath = path.join(process.env.HOME || '/home/user', '.tmux.conf');
    const config = await fs.readFile(tmuxConfPath, 'utf8');
    res.json({ config });
  } catch (error) {
    // If file doesn't exist, return the default config
    const defaultConfig = await fs.readFile(path.join(__dirname, '.tmux.conf'), 'utf8');
    res.json({ config: defaultConfig });
  }
});

  // Error handling middleware (must be last)
  app.use(errorMiddleware);
}

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
initialize().then(() => {
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
}).catch(err => {
  console.error('Failed to initialize:', err);
  process.exit(1);
});