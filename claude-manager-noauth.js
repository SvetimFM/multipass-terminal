#!/usr/bin/env node

// Claude Manager Pro - Without Auth (Everything works!)
const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const pty = require('node-pty');

const app = express();
const PORT = 9999;
const TAILSCALE_IP = '100.110.230.98';

app.use(express.json());

// In-memory storage
const sessions = new Map();
const terminals = new Map();
const projects = new Map();

// Load projects from file
async function loadProjects() {
  try {
    const data = await fs.readFile('.claude-projects.json', 'utf8');
    const saved = JSON.parse(data);
    saved.forEach(p => projects.set(p.id, p));
  } catch (e) {
    // Default projects
    projects.set('default', { id: 'default', name: 'Default', path: process.cwd() });
  }
}

async function saveProjects() {
  const data = Array.from(projects.values());
  await fs.writeFile('.claude-projects.json', JSON.stringify(data, null, 2));
}

// Initialize
loadProjects();

// Main UI - NO AUTH
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Claude Manager Pro</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js"></script>
  <style>
    body { 
      margin: 0;
      overscroll-behavior: none;
      -webkit-tap-highlight-color: transparent;
    }
    .terminal-container {
      height: calc(100vh - 200px);
      background: #1a1b26;
      padding: 10px;
    }
    #terminal {
      height: 100%;
    }
    .file-item {
      padding: 8px 12px;
      border-bottom: 1px solid #374151;
    }
  </style>
</head>
<body class="bg-gray-900 text-white">
  <!-- Main App - Start visible -->
  <div id="main-app">
    <!-- Header -->
    <div class="bg-gray-800 p-3 border-b border-gray-700">
      <div class="flex justify-between items-center">
        <h1 class="text-lg font-semibold">Claude Manager</h1>
        <div class="flex gap-2">
          <button onclick="showProjects()" class="bg-gray-700 px-3 py-1 rounded text-sm">
            Projects
          </button>
          <button onclick="showSessions()" class="bg-blue-600 px-3 py-1 rounded text-sm">
            Sessions
          </button>
        </div>
      </div>
    </div>

    <!-- Projects View -->
    <div id="projects-view" class="p-4">
      <div class="mb-4">
        <button onclick="showFileBrowser()" 
                class="w-full bg-green-600 py-3 rounded font-semibold mb-3">
          + Add Project Folder
        </button>
        
        <div id="projects-list" class="space-y-2"></div>
      </div>
    </div>

    <!-- Sessions View -->
    <div id="sessions-view" class="hidden p-4">
      <div class="mb-4">
        <select id="project-select" class="w-full bg-gray-800 px-3 py-2 rounded mb-2">
          <option value="">Select project...</option>
        </select>
        
        <input id="session-name" placeholder="Session name (optional)" 
               class="w-full bg-gray-800 px-3 py-2 rounded mb-2">
        
        <button onclick="createSession()" 
                class="w-full bg-green-600 py-3 rounded font-semibold">
          + New Claude Session
        </button>
        
        <button onclick="loadSessions()" 
                class="w-full bg-gray-600 py-2 rounded text-sm mt-2">
          🔄 Refresh Sessions
        </button>
      </div>
      
      <div id="sessions-list" class="space-y-2"></div>
    </div>

    <!-- Terminal View -->
    <div id="terminal-view" class="hidden">
      <div class="bg-gray-800 p-2 flex items-center justify-between">
        <span id="current-session" class="font-semibold text-sm"></span>
        <button onclick="closeTerminal()" class="text-gray-400 text-xl">✕</button>
      </div>
      
      <div id="terminal" class="terminal-container"></div>
      
      <!-- Quick Commands -->
      <div class="bg-gray-700 p-2 flex gap-2 overflow-x-auto">
        <button onclick="sendToTerminal('claude\\n')" class="px-3 py-1 bg-blue-600 rounded text-sm font-semibold">claude</button>
        <button id="auto-accept-btn" onclick="toggleAutoAccept()" class="px-3 py-1 bg-gray-600 rounded text-sm">
          Auto-Accept: <span id="auto-accept-status">OFF</span>
        </button>
        <button onclick="sendToTerminal('\\x1b[Z')" class="px-3 py-1 bg-purple-600 rounded text-sm" title="Send Shift+Tab">⇧ Tab</button>
        <button onclick="sendToTerminal('ls -la\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">ls -la</button>
        <button onclick="sendToTerminal('pwd\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">pwd</button>
        <button onclick="sendToTerminal('git status\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">git status</button>
        <button onclick="sendToTerminal('git log --oneline -10\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">git log</button>
        <button onclick="sendToTerminal('npm run\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">npm run</button>
        <button onclick="sendToTerminal('clear\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">clear</button>
      </div>
      
      <div class="p-2 bg-gray-800">
        <input id="terminal-input" placeholder="Type command..." 
               class="w-full bg-gray-700 px-3 py-2 rounded"
               onkeypress="if(event.key==='Enter') { sendToTerminal(this.value + '\\n'); this.value=''; }">
      </div>
    </div>

    <!-- File Browser Modal -->
    <div id="file-browser" class="hidden fixed inset-0 bg-black bg-opacity-75 z-50">
      <div class="bg-gray-800 h-full flex flex-col">
        <div class="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 class="font-semibold">Select Project Folder</h2>
          <button onclick="closeFileBrowser()" class="text-2xl">✕</button>
        </div>
        
        <div class="p-4 bg-gray-700">
          <div id="current-path" class="text-sm text-gray-300 mb-2"></div>
          <button onclick="selectCurrentFolder()" 
                  class="bg-blue-600 px-4 py-2 rounded text-sm">
            Select This Folder
          </button>
        </div>
        
        <div id="file-list" class="flex-1 overflow-auto"></div>
      </div>
    </div>
  </div>

  <script>
    let currentTerminal = null;
    let currentWs = null;
    let currentPath = '/mnt/j/DevWorkspace';
    let autoAcceptMode = false;
    let autoAcceptInterval = null;
    
    // Load on start
    window.onload = function() {
      loadProjects();
      showProjects();
    };
    
    // Projects Management
    async function loadProjects() {
      const res = await fetch('/api/projects');
      const data = await res.json();
      
      // Update project select
      const select = document.getElementById('project-select');
      select.innerHTML = '<option value="">Select project...</option>' +
        data.projects.map(p => \`<option value="\${p.id}">\${p.name}</option>\`).join('');
      
      // Update projects list
      const list = document.getElementById('projects-list');
      list.innerHTML = data.projects.map(p => \`
        <div class="bg-gray-800 p-3 rounded flex justify-between items-center">
          <div>
            <div class="font-semibold">\${p.name}</div>
            <div class="text-xs text-gray-400">\${p.path}</div>
          </div>
          <button onclick="deleteProject('\${p.id}')" 
                  class="text-red-500 text-sm">Delete</button>
        </div>
      \`).join('');
    }
    
    async function deleteProject(id) {
      if (id === 'default') {
        alert('Cannot delete default project');
        return;
      }
      
      if (!confirm('Delete this project?')) return;
      
      await fetch('/api/projects/' + id, { method: 'DELETE' });
      loadProjects();
    }
    
    // File Browser
    function showFileBrowser() {
      document.getElementById('file-browser').classList.remove('hidden');
      browsePath(currentPath);
    }
    
    function closeFileBrowser() {
      document.getElementById('file-browser').classList.add('hidden');
    }
    
    async function browsePath(path) {
      currentPath = path;
      document.getElementById('current-path').textContent = path;
      
      const res = await fetch('/api/browse?path=' + encodeURIComponent(path));
      const data = await res.json();
      
      const list = document.getElementById('file-list');
      
      // Add parent directory navigation
      let parentNav = '';
      if (path !== '/' && path !== '/mnt') {
        const parentPath = path.split('/').slice(0, -1).join('/') || '/';
        parentNav = \`
          <div class="file-item font-semibold" onclick="browsePath('\${parentPath}')">
            📁 ..
          </div>
        \`;
      }
      
      list.innerHTML = parentNav + data.items.map(item => \`
        <div class="file-item \${item.isDirectory ? 'font-semibold' : ''}" 
             onclick="\${item.isDirectory ? \`browsePath('\${item.path}')\` : ''}">
          \${item.isDirectory ? '📁' : '📄'} \${item.name}
        </div>
      \`).join('');
    }
    
    async function selectCurrentFolder() {
      const name = prompt('Project name:', currentPath.split('/').pop());
      if (!name) return;
      
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: currentPath })
      });
      
      closeFileBrowser();
      loadProjects();
    }
    
    // Sessions Management
    async function loadSessions() {
      try {
        console.log('Loading sessions...');
        const res = await fetch('/api/sessions');
        const data = await res.json();
        console.log('Sessions data:', data);
        
        const list = document.getElementById('sessions-list');
        if (data.sessions && data.sessions.length > 0) {
          list.innerHTML = data.sessions.map(s => \`
            <div class="bg-gray-800 p-3 rounded">
              <div class="flex justify-between items-center mb-2">
                <div>
                  <div class="font-semibold">\${s.name}</div>
                  <div class="text-xs text-gray-400">\${s.project || 'No project'}</div>
                </div>
                <button onclick="killSession('\${s.name}')" 
                        class="text-red-500 text-sm">Kill</button>
              </div>
              <button onclick="attachTerminal('\${s.name}')" 
                      class="w-full bg-blue-600 py-2 rounded text-sm">
                Open Terminal
              </button>
            </div>
          \`).join('');
        } else {
          list.innerHTML = '<p class="text-center text-gray-500 py-8">No active sessions</p>';
        }
      } catch (error) {
        console.error('Error loading sessions:', error);
        document.getElementById('sessions-list').innerHTML = '<p class="text-center text-red-500 py-8">Error loading sessions</p>';
      }
    }
    
    async function createSession() {
      try {
        const projectId = document.getElementById('project-select').value;
        const name = document.getElementById('session-name').value || 
                     'claude-' + Date.now().toString().slice(-6);
        
        console.log('Creating session:', { name, projectId });
        
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, projectId })
        });
        
        const result = await response.json();
        console.log('Session creation result:', result);
        
        if (!response.ok) {
          alert('Error creating session: ' + (result.error || 'Unknown error'));
          return;
        }
        
        document.getElementById('session-name').value = '';
        loadSessions();
      } catch (error) {
        console.error('Error creating session:', error);
        alert('Error creating session: ' + error.message);
      }
    }
    
    async function killSession(name) {
      if (!confirm('Kill session ' + name + '?')) return;
      await fetch('/api/sessions/' + name, { method: 'DELETE' });
      loadSessions();
    }
    
    // Terminal
    let fitAddon;
    function attachTerminal(sessionName) {
      document.getElementById('current-session').textContent = sessionName;
      document.getElementById('terminal-view').classList.remove('hidden');
      document.getElementById('sessions-view').classList.add('hidden');
      document.getElementById('projects-view').classList.add('hidden');
      
      // Initialize xterm
      if (currentTerminal) currentTerminal.dispose();
      
      currentTerminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6',
          cursor: '#c0caf5',
          selection: '#33467c',
          black: '#15161e',
          red: '#f7768e',
          green: '#9ece6a',
          yellow: '#e0af68',
          blue: '#7aa2f7',
          magenta: '#bb9af7',
          cyan: '#7dcfff',
          white: '#a9b1d6',
          brightBlack: '#414868',
          brightRed: '#f7768e',
          brightGreen: '#9ece6a',
          brightYellow: '#e0af68',
          brightBlue: '#7aa2f7',
          brightMagenta: '#bb9af7',
          brightCyan: '#7dcfff',
          brightWhite: '#c0caf5'
        },
        allowTransparency: true,
        scrollback: 5000
      });
      
      // Load addons
      fitAddon = new FitAddon.FitAddon();
      const webLinksAddon = new WebLinksAddon.WebLinksAddon();
      currentTerminal.loadAddon(fitAddon);
      currentTerminal.loadAddon(webLinksAddon);
      
      currentTerminal.open(document.getElementById('terminal'));
      
      // Fit terminal to container
      setTimeout(() => fitAddon.fit(), 100);
      
      // Connect WebSocket
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      currentWs = new WebSocket(protocol + '//' + location.host + '/terminal/' + sessionName);
      
      currentWs.onopen = () => {
        console.log('Terminal connected');
        // Send initial terminal size
        const { cols, rows } = fitAddon.proposeDimensions() || { cols: 80, rows: 30 };
        currentWs.send(JSON.stringify({ type: 'resize', cols, rows }));
      };
      
      currentWs.onmessage = (event) => {
        currentTerminal.write(event.data);
      };
      
      currentWs.onerror = (error) => {
        console.error('WebSocket error:', error);
        currentTerminal.write('\\r\\n\\x1b[31mConnection error!\\x1b[0m\\r\\n');
      };
      
      currentWs.onclose = () => {
        currentTerminal.write('\\r\\n\\x1b[33mConnection closed.\\x1b[0m\\r\\n');
      };
      
      currentTerminal.onData((data) => {
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          currentWs.send(data);
        }
      });
      
      // Handle terminal resize
      currentTerminal.onResize(({ cols, rows }) => {
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          currentWs.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
      
      // Handle window resize
      const resizeHandler = () => {
        if (fitAddon) {
          fitAddon.fit();
        }
      };
      window.addEventListener('resize', resizeHandler);
      
      // Store resize handler for cleanup
      currentTerminal._resizeHandler = resizeHandler;
    }
    
    function sendToTerminal(cmd) {
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(cmd);
      }
    }
    
    // Auto-Accept Mode
    function toggleAutoAccept() {
      autoAcceptMode = !autoAcceptMode;
      const btn = document.getElementById('auto-accept-btn');
      const status = document.getElementById('auto-accept-status');
      
      if (autoAcceptMode) {
        status.textContent = 'ON';
        btn.classList.remove('bg-gray-600');
        btn.classList.add('bg-green-600');
        
        // Start sending Shift+Tab every 2 seconds
        autoAcceptInterval = setInterval(() => {
          if (currentWs && currentWs.readyState === WebSocket.OPEN) {
            // Send Shift+Tab (ESC [ Z)
            sendToTerminal('\\x1b[Z');
          }
        }, 2000);
      } else {
        status.textContent = 'OFF';
        btn.classList.remove('bg-green-600');
        btn.classList.add('bg-gray-600');
        
        // Stop the interval
        if (autoAcceptInterval) {
          clearInterval(autoAcceptInterval);
          autoAcceptInterval = null;
        }
      }
    }
    
    function closeTerminal() {
      // Disable auto-accept when closing terminal
      if (autoAcceptMode) {
        toggleAutoAccept();
      }
      
      if (currentWs) currentWs.close();
      if (currentTerminal) {
        // Remove resize handler
        if (currentTerminal._resizeHandler) {
          window.removeEventListener('resize', currentTerminal._resizeHandler);
        }
        currentTerminal.dispose();
      }
      document.getElementById('terminal-view').classList.add('hidden');
      showSessions();
    }
    
    // Navigation
    function showProjects() {
      document.getElementById('projects-view').classList.remove('hidden');
      document.getElementById('sessions-view').classList.add('hidden');
      document.getElementById('terminal-view').classList.add('hidden');
    }
    
    function showSessions() {
      document.getElementById('projects-view').classList.add('hidden');
      document.getElementById('sessions-view').classList.remove('hidden');
      document.getElementById('terminal-view').classList.add('hidden');
      loadSessions();
    }
  </script>
</body>
</html>
  `);
});

// API Routes

// Projects
app.get('/api/projects', async (req, res) => {
  res.json({ projects: Array.from(projects.values()) });
});

app.post('/api/projects', async (req, res) => {
  const { name, path: projectPath } = req.body;
  const id = 'proj-' + Date.now();
  
  projects.set(id, { id, name, path: projectPath });
  await saveProjects();
  
  res.json({ id, name, path: projectPath });
});

app.delete('/api/projects/:id', async (req, res) => {
  projects.delete(req.params.id);
  await saveProjects();
  res.json({ deleted: true });
});

// File Browser
app.get('/api/browse', async (req, res) => {
  const { path: browsePath = process.env.HOME } = req.query;
  
  try {
    const items = await fs.readdir(browsePath, { withFileTypes: true });
    const filtered = items
      .filter(item => !item.name.startsWith('.') && item.name !== 'node_modules')
      .map(item => ({
        name: item.name,
        path: path.join(browsePath, item.name),
        isDirectory: item.isDirectory()
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    
    res.json({ items: filtered.slice(0, 100) }); // Limit to 100 items
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sessions
app.get('/api/sessions', (req, res) => {
  console.log('Getting sessions...');
  
  // List tmux sessions
  exec('tmux ls 2>/dev/null || echo ""', (error, stdout, stderr) => {
    console.log('tmux ls result:');
    console.log('  stdout:', stdout);
    
    const tmuxSessions = [];
    
    // Handle both error and success cases
    // Even if there's an error, stdout might contain valid data
    if (stdout && stdout.trim()) {
      stdout.trim().split('\n').forEach(line => {
        // Skip empty lines and check for valid tmux session format
        if (line && line.includes(':') && !line.includes('WSL') && !line.includes('ERROR')) {
          const name = line.split(':')[0].trim();
          const sessionData = sessions.get(name) || {};
          tmuxSessions.push({
            name,
            project: sessionData.project,
            projectId: sessionData.projectId
          });
        }
      });
    }
    
    console.log('Sending sessions:', tmuxSessions);
    res.json({ sessions: tmuxSessions });
  });
});

app.post('/api/sessions', (req, res) => {
  const { name, projectId } = req.body;
  
  console.log('Creating session:', { name, projectId });
  
  let cwd = process.cwd();
  let projectName = 'Default';
  
  if (projectId && projects.has(projectId)) {
    const project = projects.get(projectId);
    cwd = project.path;
    projectName = project.name;
  }
  
  // Create a tmux session directly (we're already in WSL)
  const escapedName = name.replace(/'/g, "'\\''")
  const escapedCwd = cwd.replace(/'/g, "'\\''")
  // Create tmux session in project directory with bash
  const command = `tmux new-session -d -s "${escapedName}" -c "${escapedCwd}" bash`;
  console.log('Executing command:', command);
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error creating session:', error);
      console.error('Stderr:', stderr);
      res.status(500).json({ error: error.message, stderr });
    } else {
      console.log('Session created successfully:', stdout);
      sessions.set(name, { projectId, project: projectName });
      res.json({ name, status: 'created' });
    }
  });
});

app.delete('/api/sessions/:name', (req, res) => {
  const escapedName = req.params.name.replace(/'/g, "'\\''")
  exec(`tmux kill-session -t "${escapedName}"`, (error) => {
    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      sessions.delete(req.params.name);
      res.json({ status: 'killed' });
    }
  });
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
    ws.close();
  });
  
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'resize' && data.cols && data.rows) {
        term.resize(data.cols, data.rows);
      }
    } catch (e) {
      // Not JSON, treat as terminal input
      term.write(msg);
    }
  });
  
  ws.on('close', () => {
    term.kill();
  });
});

// Start server
server.listen(PORT, TAILSCALE_IP, () => {
  console.log(`
🚀 Claude Manager Pro (No Auth)
   
   Access: http://${TAILSCALE_IP}:${PORT}
   
   Features:
   ✓ Project management with folder browser
   ✓ Full terminal access in browser
   ✓ Session management
   ✓ Mobile optimized
   ✓ NO AUTHENTICATION - Direct access!
  `);
});