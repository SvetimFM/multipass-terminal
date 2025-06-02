#!/usr/bin/env node

// Multipass - Terminal for AI with per-project AI Offices
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

// AI Office Management
async function createAIOffice(projectId, cubicleCount = 3) {
  const project = projects.get(projectId);
  console.log('Project lookup:', projectId, project);
  if (!project) throw new Error('Project not found');
  
  const aiOfficePath = path.join(project.path, 'ai-office');
  console.log('AI Office path:', aiOfficePath);
  
  // Create ai-office directory
  await fs.mkdir(aiOfficePath, { recursive: true });
  
  // Check if project has a GitHub URL
  const githubUrl = project.githubUrl || null;
  
  // Create cubicles
  const cubicles = [];
  for (let i = 1; i <= cubicleCount; i++) {
    const cubiclePath = path.join(aiOfficePath, `cubicle-${i}`);
    await fs.mkdir(cubiclePath, { recursive: true });
    
    // Clone GitHub repository if available
    if (githubUrl) {
      try {
        console.log(`Cloning repository ${githubUrl} into cubicle-${i}...`);
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        // Clone the repository into the cubicle root directory
        const { stdout, stderr } = await execPromise(`git clone "${githubUrl}" .`, {
          cwd: cubiclePath,
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large repos
        });
        
        if (stdout) console.log(`Clone output: ${stdout}`);
        if (stderr) console.log(`Clone stderr: ${stderr}`);
        
        // Create instructions for working within the repository copy
        await fs.writeFile(
          path.join(cubiclePath, 'INSTRUCTIONS.md'),
          `# Cubicle ${i} - AI Workspace

## Important Instructions

This cubicle contains a copy of the project repository from: ${githubUrl}

### Working Directory
- The repository has been cloned directly into this cubicle's root directory
- All project files are available at: \`${cubiclePath}\`

### Guidelines
1. You are already in the project root - no need to change directories

2. All file edits, additions, and deletions happen directly in this workspace

3. This is an isolated workspace - changes here won't affect the main project until explicitly merged

4. Use git commands to track your changes

5. When ready, changes can be reviewed and potentially merged back to the main project

### Project: ${project.name}
### GitHub: ${githubUrl}
`
        );
      } catch (error) {
        console.error(`Failed to clone repository for cubicle-${i}:`, error);
        // Fall back to creating a simple README if cloning fails
        await fs.writeFile(
          path.join(cubiclePath, 'README.md'),
          `# Cubicle ${i}\n\nAI workspace for ${project.name}\n\nNote: Failed to clone repository from ${githubUrl}`
        );
      }
    } else {
      // No GitHub URL, create standard README
      await fs.writeFile(
        path.join(cubiclePath, 'README.md'),
        `# Cubicle ${i}\n\nAI workspace for ${project.name}`
      );
    }
    
    cubicles.push({
      name: `cubicle-${i}`,
      path: cubiclePath
    });
  }
  
  // Update project with AI Office info
  project.aiOffice = {
    enabled: true,
    cubicleCount,
    cubicles,
    createdAt: new Date().toISOString()
  };
  
  await saveProjects();
  return project.aiOffice;
}

async function removeAIOffice(projectId) {
  const project = projects.get(projectId);
  if (!project || !project.aiOffice) return;
  
  const aiOfficePath = path.join(project.path, 'ai-office');
  
  // Kill all tmux sessions for this AI Office
  if (project.aiOffice.cubicles) {
    for (const cubicle of project.aiOffice.cubicles) {
      const sessionName = `ai-office-${projectId}-${cubicle.name}`;
      try {
        await new Promise((resolve) => {
          exec(`tmux kill-session -t "${sessionName}"`, (error) => {
            if (error) {
              console.log(`No tmux session found for ${sessionName}, continuing...`);
            }
            resolve();
          });
        });
        // Remove session metadata
        sessions.delete(sessionName);
      } catch (e) {
        console.error('Error killing tmux session:', e);
      }
    }
  }
  
  // Remove directory
  try {
    await fs.rm(aiOfficePath, { recursive: true, force: true });
  } catch (e) {
    console.error('Error removing AI Office:', e);
  }
  
  // Update project
  delete project.aiOffice;
  await saveProjects();
}

// Initialize
loadProjects();

// Main UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Multipass - Terminal for AI</title>
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
    #main-app {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #terminal-view:not(.hidden) {
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1000;
      background: #1a1b26;
    }
    .terminal-container {
      flex: 1;
      background: #1a1b26;
      padding: 10px;
      overflow: hidden;
      width: 100%;
      height: 100%;
    }
    #terminal {
      height: 100%;
      width: 100%;
    }
    .file-item {
      padding: 8px 12px;
      border-bottom: 1px solid #374151;
    }
    .cubicle-terminal {
      height: 300px;
      background: #1a1b26;
      border-radius: 8px;
      padding: 8px;
    }
  </style>
</head>
<body class="bg-gray-900 text-white">
  <!-- Main App -->
  <div id="main-app">
    <!-- Header -->
    <div id="main-header" class="bg-gray-800 p-3 border-b border-gray-700">
      <div class="flex justify-between items-center">
        <h1 class="text-lg font-semibold">Multipass - Terminal for AI</h1>
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
        
        <div id="projects-list" class="space-y-2">
          <!-- Projects will be loaded here -->
        </div>
      </div>
    </div>

    <!-- Sessions View -->
    <div id="sessions-view" class="hidden p-4">
      <div class="mb-4">
        <h2 class="text-xl font-semibold mb-4">Create New Session</h2>
        
        <div class="space-y-3">
          <div>
            <label class="block text-sm mb-1">Project</label>
            <select id="project-select" class="w-full bg-gray-800 p-2 rounded">
              <!-- Projects will be loaded here -->
            </select>
          </div>
          
          <div>
            <label class="block text-sm mb-1">Session Name (optional)</label>
            <input type="text" id="session-name" 
                   class="w-full bg-gray-800 p-2 rounded"
                   placeholder="claude-session">
          </div>
          
          <button onclick="createSession()" 
                  class="w-full bg-blue-600 py-2 rounded font-semibold">
            Create Session
          </button>
        </div>
      </div>
      
      <div>
        <h3 class="text-lg font-semibold mb-3">Active Sessions</h3>
        <div id="sessions-list" class="space-y-2">
          <!-- Sessions will be loaded here -->
        </div>
      </div>
    </div>


    <!-- Terminal View -->
    <div id="terminal-view" class="hidden">
      <div class="bg-gray-800 p-3 border-b border-gray-700 flex-shrink-0">
        <div class="flex justify-between items-center">
          <span class="text-sm">Session: <span id="current-session" class="font-semibold"></span></span>
          <button onclick="closeTerminal()" class="bg-red-600 px-3 py-1 rounded text-sm">
            Close
          </button>
        </div>
      </div>
      
      <div class="terminal-container">
        <div id="terminal"></div>
      </div>
      
      <!-- Quick Commands -->
      <div class="bg-gray-700 p-2 flex gap-2 overflow-x-auto flex-shrink-0">
        <button onclick="sendToTerminal('claude\\n')" class="px-3 py-1 bg-blue-600 rounded text-sm font-semibold">claude</button>
        <button onclick="exitClaude()" class="px-3 py-1 bg-red-600 rounded text-sm font-semibold" title="Exit Claude (Ctrl+C twice)">Exit Claude</button>
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
    </div>

    <!-- File Browser Modal -->
    <div id="file-browser-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50">
      <div class="bg-gray-800 w-full max-w-2xl mx-auto mt-10 rounded-lg shadow-xl max-h-[80vh] flex flex-col">
        <div class="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 class="text-lg font-semibold">Select Project Folder</h3>
          <button onclick="closeFileBrowser()" class="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <div class="p-4 border-b border-gray-700">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-400">Path:</span>
            <span id="current-path" class="text-sm font-mono"></span>
          </div>
        </div>
        
        <div id="file-list" class="flex-1 overflow-y-auto">
          <!-- Files will be loaded here -->
        </div>
        
        <div class="p-4 border-t border-gray-700 flex gap-2">
          <button onclick="selectCurrentFolder()" 
                  class="flex-1 bg-green-600 py-2 rounded font-semibold">
            Select This Folder
          </button>
          <button onclick="closeFileBrowser()" 
                  class="flex-1 bg-gray-700 py-2 rounded">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- AI Office Terminal Grid -->
    <div id="ai-office-grid" class="hidden fixed inset-0 bg-gray-900 z-50 overflow-auto">
      <div class="bg-gray-800 p-3 border-b border-gray-700 sticky top-0 z-10">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-semibold">
            <span id="ai-office-project-name"></span> - AI Office (<span id="ai-office-cubicle-count"></span> cubicles)
          </h2>
          <button onclick="closeAIOfficeGrid()" class="bg-gray-700 px-3 py-1 rounded text-sm">
            Close
          </button>
        </div>
        <!-- Quick Commands for All Terminals -->
        <div class="mt-2 flex gap-2 overflow-x-auto">
          <button onclick="broadcastToAllTerminals('claude\\n')" class="px-3 py-1 bg-blue-600 rounded text-sm font-semibold">claude (all)</button>
          <button onclick="exitClaudeAll()" class="px-3 py-1 bg-red-600 rounded text-sm font-semibold" title="Exit Claude in all terminals">Exit Claude (all)</button>
          <button onclick="broadcastToAllTerminals('\\x1b[Z')" class="px-3 py-1 bg-purple-600 rounded text-sm" title="Send Shift+Tab to all">⇧ Tab (all)</button>
          <button onclick="broadcastToAllTerminals('ls -la\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">ls -la (all)</button>
          <button onclick="broadcastToAllTerminals('pwd\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">pwd (all)</button>
          <button onclick="broadcastToAllTerminals('git status\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">git status (all)</button>
          <button onclick="broadcastToAllTerminals('clear\\n')" class="px-3 py-1 bg-gray-600 rounded text-sm">clear (all)</button>
          <button onclick="addCubicle()" class="px-3 py-1 bg-green-600 rounded text-sm">+ Add Cubicle</button>
        </div>
      </div>
      <div id="cubicle-terminals" class="grid gap-4 p-4">
        <!-- Cubicle terminals will be loaded here -->
      </div>
    </div>
  </div>

  <script>
    // Global state
    let currentTerminal = null;
    let currentWs = null;
    let currentPath = null;
    let cubicleTerminals = new Map();
    let cubicleWebSockets = new Map();
    let autoAcceptMode = false;
    
    // Load projects
    async function loadProjects() {
      try {
        const response = await fetch('/api/projects');
        const data = await response.json();
        
        const projectsList = document.getElementById('projects-list');
        const projectSelect = document.getElementById('project-select');
        
        projectsList.innerHTML = '';
        projectSelect.innerHTML = '';
        
        data.projects.forEach(project => {
          // Projects list with AI Office controls
          const hasAIOffice = project.aiOffice && project.aiOffice.enabled;
          projectsList.innerHTML += \`
            <div class="bg-gray-800 p-3 rounded flex justify-between items-center">
              <div class="flex-1">
                <div class="font-semibold">\${project.name}</div>
                <div class="text-xs text-gray-400 font-mono">\${project.path}</div>
                \${project.githubUrl ? \`<div class="text-xs text-blue-400 mt-1">GitHub: \${project.githubUrl}</div>\` : ''}
                \${hasAIOffice ? \`<div class="text-xs text-purple-400 mt-1">AI Office: \${project.aiOffice.cubicleCount} cubicles</div>\` : ''}
              </div>
              <div class="flex gap-2 flex-wrap">
                \${hasAIOffice ? 
                  \`<button onclick="openAIOfficeGrid('\${project.id}')" class="bg-purple-600 px-2 py-1 rounded text-xs">View AI Office</button>
                   <button onclick="removeAIOffice('\${project.id}')" class="bg-red-600 px-2 py-1 rounded text-xs">Remove</button>\` :
                  \`<button onclick="setupAIOffice('\${project.id}')" class="bg-purple-600 px-2 py-1 rounded text-xs">Setup AI Office</button>\`
                }
                \${project.id !== 'default' ? 
                  \`<button onclick="deleteProject('\${project.id}')" class="bg-red-600 px-2 py-1 rounded text-xs">Delete Project</button>\` : 
                  ''
                }
              </div>
            </div>
          \`;
          
          // Project select
          projectSelect.innerHTML += \`<option value="\${project.id}">\${project.name}</option>\`;
        });
      } catch (error) {
        console.error('Error loading projects:', error);
      }
    }
    
    // AI Office management
    async function setupAIOffice(projectId) {
      const count = prompt('How many cubicles? (default: 3)', '3');
      if (!count) return;
      
      try {
        const response = await fetch(\`/api/projects/\${projectId}/ai-office\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cubicleCount: parseInt(count) || 3 })
        });
        
        if (response.ok) {
          await loadProjects();
        } else {
          alert('Failed to create AI Office');
        }
      } catch (error) {
        console.error('Error creating AI Office:', error);
        alert('Error creating AI Office');
      }
    }
    
    async function removeAIOffice(projectId) {
      if (!confirm('Remove AI Office? This will delete all cubicles.')) return;
      
      try {
        const response = await fetch(\`/api/projects/\${projectId}/ai-office\`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          await loadProjects();
        }
      } catch (error) {
        console.error('Error removing AI Office:', error);
      }
    }
    
    
    // Store current AI Office project
    let currentAIOfficeProject = null;
    
    // Open AI Office grid view
    async function openAIOfficeGrid(projectId) {
      const response = await fetch('/api/projects');
      const data = await response.json();
      const project = data.projects.find(p => p.id === projectId);
      
      if (!project || !project.aiOffice) return;
      
      currentAIOfficeProject = project;
      document.getElementById('ai-office-project-name').textContent = project.name;
      document.getElementById('ai-office-cubicle-count').textContent = project.aiOffice.cubicleCount;
      document.getElementById('ai-office-grid').classList.remove('hidden');
      
      const container = document.getElementById('cubicle-terminals');
      container.innerHTML = '';
      
      // Set grid layout - max 2 columns
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        container.className = 'grid grid-cols-1 gap-4 p-4';
      } else {
        container.className = 'grid grid-cols-2 gap-4 p-4';
      }
      
      // Create terminals for each cubicle
      project.aiOffice.cubicles.forEach((cubicle, idx) => {
        const termDiv = document.createElement('div');
        termDiv.className = 'bg-gray-800 rounded overflow-hidden flex flex-col';
        termDiv.innerHTML = \`
          <div class="bg-gray-700 px-3 py-2 text-sm font-medium flex justify-between items-center">
            <span>\${cubicle.name}</span>
            <button onclick="removeCubicle('\${project.id}', \${idx})" class="text-red-400 hover:text-red-300 text-xs">✕</button>
          </div>
          <div id="cubicle-grid-terminal-\${projectId}-\${idx}" class="cubicle-terminal flex-1"></div>
        \`;
        container.appendChild(termDiv);
        
        setTimeout(() => initCubicleTerminal(project, cubicle, idx, true), 100 * idx);
      });
    }
    
    function closeAIOfficeGrid() {
      // Clean up all terminals and WebSockets without killing tmux sessions
      cubicleTerminals.forEach(({ term }) => term.dispose());
      cubicleWebSockets.forEach(ws => {
        // Close WebSocket connection without killing the tmux session
        ws.close();
      });
      cubicleTerminals.clear();
      cubicleWebSockets.clear();
      
      currentAIOfficeProject = null;
      document.getElementById('ai-office-grid').classList.add('hidden');
    }
    
    // Broadcast command to all terminals in the AI Office
    function broadcastToAllTerminals(command) {
      cubicleWebSockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(command);
        }
      });
    }
    
    // Exit Claude in all terminals
    function exitClaudeAll() {
      // Send Ctrl+C twice quickly to all terminals
      broadcastToAllTerminals('\x03');
      setTimeout(() => broadcastToAllTerminals('\x03'), 50);
    }
    
    // Add a new cubicle to the current AI Office
    async function addCubicle() {
      if (!currentAIOfficeProject) return;
      
      try {
        const response = await fetch(\`/api/projects/\${currentAIOfficeProject.id}/ai-office/cubicle\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          // First reload projects to get updated data
          await loadProjects();
          // Then reload the grid view to show the new cubicle
          openAIOfficeGrid(currentAIOfficeProject.id);
        } else {
          alert('Failed to add cubicle');
        }
      } catch (error) {
        console.error('Error adding cubicle:', error);
        alert('Error adding cubicle: ' + error.message);
      }
    }
    
    // Remove a cubicle from the AI Office
    async function removeCubicle(projectId, cubicleIdx) {
      if (!confirm('Remove this cubicle?')) return;
      
      try {
        const response = await fetch(\`/api/projects/\${projectId}/ai-office/cubicle/\${cubicleIdx}\`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          // Reload the grid view
          openAIOfficeGrid(projectId);
          await loadProjects();
        } else {
          alert('Failed to remove cubicle');
        }
      } catch (error) {
        console.error('Error removing cubicle:', error);
      }
    }
    
    // Open single cubicle terminal
    async function openCubicleTerminal(projectId, cubicleIdx) {
      const response = await fetch('/api/projects');
      const data = await response.json();
      const project = data.projects.find(p => p.id === projectId);
      
      if (!project || !project.aiOffice) return;
      
      const cubicle = project.aiOffice.cubicles[cubicleIdx];
      const sessionName = \`ai-office-\${project.id}-\${cubicle.name}\`;
      
      // Create session if needed
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: sessionName, 
          projectId: projectId,
          isCubicle: true,
          cubiclePath: cubicle.path
        })
      });
      
      // Open terminal
      attachTerminal(sessionName);
    }
    
    // Initialize cubicle terminal
    function initCubicleTerminal(project, cubicle, idx, isGrid = false) {
      const terminalId = isGrid ? \`cubicle-grid-terminal-\${project.id}-\${idx}\` : \`cubicle-terminal-\${project.id}-\${idx}\`;
      const sessionName = \`ai-office-\${project.id}-\${cubicle.name}\`;
      
      const term = new Terminal({
        cursorBlink: true,
        fontSize: isGrid ? 12 : 14,
        fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6'
        }
      });
      
      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      
      term.open(document.getElementById(terminalId));
      fitAddon.fit();
      
      // Create session and connect WebSocket
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: sessionName, 
          projectId: project.id,
          isCubicle: true,
          cubiclePath: cubicle.path
        })
      }).then(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(\`\${protocol}//\${window.location.host}/terminal/\${sessionName}\`);
        
        ws.onopen = () => {
          term.write('\\r\\n*** Connected to ' + cubicle.name + ' ***\\r\\n');
        };
        
        ws.onmessage = (event) => {
          term.write(event.data);
        };
        
        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });
        
        const key = \`\${project.id}-\${idx}\`;
        cubicleTerminals.set(key, { term, fitAddon });
        cubicleWebSockets.set(key, ws);
      });
    }
    
    // Sessions management
    async function loadSessions() {
      try {
        const response = await fetch('/api/sessions');
        const data = await response.json();
        
        const list = document.getElementById('sessions-list');
        if (data.sessions.length > 0) {
          list.innerHTML = data.sessions.map(session => \`
            <div class="bg-gray-800 p-3 rounded flex justify-between items-center">
              <div>
                <div class="font-semibold">\${session.name}</div>
                <div class="text-xs text-gray-400">Project: \${session.project || 'Unknown'}</div>
              </div>
              <div class="flex gap-2">
                <button onclick="attachTerminal('\${session.name}')" 
                        class="bg-blue-600 px-3 py-1 rounded text-sm">
                  Open Terminal
                </button>
                <button onclick="killSession('\${session.name}')" 
                        class="bg-red-600 px-3 py-1 rounded text-sm">
                  Kill
                </button>
              </div>
            </div>
          \`).join('');
        } else {
          list.innerHTML = '<p class="text-center text-gray-500 py-8">No active sessions</p>';
        }
      } catch (error) {
        console.error('Error loading sessions:', error);
      }
    }
    
    async function createSession() {
      try {
        const projectId = document.getElementById('project-select').value;
        const name = document.getElementById('session-name').value || 
                     'claude-' + Date.now().toString().slice(-6);
        
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, projectId })
        });
        
        if (!response.ok) {
          alert('Error creating session');
          return;
        }
        
        document.getElementById('session-name').value = '';
        loadSessions();
      } catch (error) {
        console.error('Error creating session:', error);
      }
    }
    
    async function killSession(name) {
      if (!confirm('Kill session ' + name + '?')) return;
      await fetch('/api/sessions/' + name, { method: 'DELETE' });
      loadSessions();
    }
    
    // Terminal management
    let resizeListener = null;
    
    function attachTerminal(sessionName) {
      document.getElementById('current-session').textContent = sessionName;
      document.getElementById('terminal-view').classList.remove('hidden');
      document.getElementById('sessions-view').classList.add('hidden');
      document.getElementById('projects-view').classList.add('hidden');
      document.getElementById('main-header').classList.add('hidden');
      
      if (currentTerminal) currentTerminal.dispose();
      if (resizeListener) window.removeEventListener('resize', resizeListener);
      
      currentTerminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6'
        }
      });
      
      const fitAddon = new FitAddon.FitAddon();
      currentTerminal.loadAddon(fitAddon);
      
      currentTerminal.open(document.getElementById('terminal'));
      
      // Fit terminal after a short delay to ensure proper sizing
      setTimeout(() => fitAddon.fit(), 50);
      
      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      currentWs = new WebSocket(\`\${protocol}//\${window.location.host}/terminal/\${sessionName}\`);
      
      currentWs.onmessage = (event) => {
        currentTerminal.write(event.data);
      };
      
      currentTerminal.onData((data) => {
        if (currentWs.readyState === WebSocket.OPEN) {
          currentWs.send(data);
        }
      });
      
      // Store resize listener to remove it later
      resizeListener = () => fitAddon.fit();
      window.addEventListener('resize', resizeListener);
    }
    
    function closeTerminal() {
      // Disable auto-accept if enabled
      if (autoAcceptMode) {
        toggleAutoAccept();
      }
      
      if (currentWs) currentWs.close();
      if (currentTerminal) currentTerminal.dispose();
      if (resizeListener) window.removeEventListener('resize', resizeListener);
      
      document.getElementById('terminal-view').classList.add('hidden');
      document.getElementById('main-header').classList.remove('hidden');
      showSessions();
    }
    
    // Terminal helper functions
    function sendToTerminal(command) {
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(command);
      }
    }
    
    function exitClaude() {
      // Send Ctrl+C twice quickly to exit Claude
      sendToTerminal('\x03');
      setTimeout(() => sendToTerminal('\x03'), 50);
    }
    
    function toggleAutoAccept() {
      autoAcceptMode = !autoAcceptMode;
      const btn = document.getElementById('auto-accept-btn');
      const status = document.getElementById('auto-accept-status');
      
      if (autoAcceptMode) {
        status.textContent = 'ON';
        btn.classList.remove('bg-gray-600');
        btn.classList.add('bg-green-600');
        
        // Send Shift+Tab immediately
        sendToTerminal('\x1b[Z');
        
        // Set up interval to send Shift+Tab every 2 seconds
        if (window.autoAcceptInterval) {
          clearInterval(window.autoAcceptInterval);
        }
        window.autoAcceptInterval = setInterval(() => {
          if (autoAcceptMode && currentWs && currentWs.readyState === WebSocket.OPEN) {
            sendToTerminal('\x1b[Z');
          }
        }, 2000);
      } else {
        status.textContent = 'OFF';
        btn.classList.remove('bg-green-600');
        btn.classList.add('bg-gray-600');
        
        if (window.autoAcceptInterval) {
          clearInterval(window.autoAcceptInterval);
          window.autoAcceptInterval = null;
        }
      }
    }
    
    // File browser
    async function showFileBrowser() {
      document.getElementById('file-browser-modal').classList.remove('hidden');
      // Start at DevWorkspace directory
      await loadDirectory('/mnt/j/DevWorkspace');
    }
    
    function closeFileBrowser() {
      document.getElementById('file-browser-modal').classList.add('hidden');
    }
    
    async function loadDirectory(path) {
      currentPath = path;
      document.getElementById('current-path').textContent = path;
      
      try {
        const response = await fetch(\`/api/browse?path=\${encodeURIComponent(path)}\`);
        const entries = await response.json();
        
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = entries.map(entry => \`
          <div class="file-item hover:bg-gray-700 cursor-pointer flex items-center gap-2"
               onclick="\${entry.isDirectory ? \`loadDirectory('\${entry.path}')\` : ''}">
            <span>\${entry.isDirectory ? '📁' : '📄'}</span>
            <span class="flex-1">\${entry.name}</span>
          </div>
        \`).join('');
      } catch (error) {
        console.error('Error loading directory:', error);
      }
    }
    
    async function selectCurrentFolder() {
      const name = prompt('Project name:', currentPath.split('/').pop());
      if (!name) return;
      
      const githubUrl = prompt('GitHub repository URL (optional - press Enter to skip):');
      
      try {
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, path: currentPath, githubUrl: githubUrl || null })
        });
        
        if (response.ok) {
          closeFileBrowser();
          loadProjects();
        }
      } catch (error) {
        console.error('Error creating project:', error);
      }
    }
    
    async function deleteProject(id) {
      if (!confirm('Delete this project?')) return;
      await fetch(\`/api/projects/\${id}\`, { method: 'DELETE' });
      loadProjects();
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
    
    
    // Initialize
    loadProjects();
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
  const { name, path: projectPath, githubUrl } = req.body;
  const id = 'proj-' + Date.now();
  
  const project = { id, name, path: projectPath };
  if (githubUrl) {
    project.githubUrl = githubUrl;
  }
  
  projects.set(id, project);
  await saveProjects();
  
  res.json(project);
});

app.delete('/api/projects/:id', async (req, res) => {
  const project = projects.get(req.params.id);
  if (project && project.aiOffice) {
    await removeAIOffice(req.params.id);
  }
  
  projects.delete(req.params.id);
  await saveProjects();
  res.json({ deleted: true });
});

// AI Office management
app.post('/api/projects/:id/ai-office', async (req, res) => {
  try {
    console.log('Creating AI Office for project:', req.params.id);
    const { cubicleCount = 3 } = req.body;
    console.log('Cubicle count:', cubicleCount);
    
    const aiOffice = await createAIOffice(req.params.id, cubicleCount);
    console.log('AI Office created successfully:', aiOffice);
    res.json(aiOffice);
  } catch (error) {
    console.error('Error creating AI Office:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id/ai-office', async (req, res) => {
  try {
    await removeAIOffice(req.params.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add cubicle to existing AI Office
app.post('/api/projects/:id/ai-office/cubicle', async (req, res) => {
  try {
    const project = projects.get(req.params.id);
    if (!project || !project.aiOffice) {
      return res.status(404).json({ error: 'AI Office not found' });
    }
    
    const cubicleNum = project.aiOffice.cubicleCount + 1;
    const cubiclePath = path.join(project.path, 'ai-office', `cubicle-${cubicleNum}`);
    
    // Create cubicle directory
    await fs.mkdir(cubiclePath, { recursive: true });
    
    // Clone GitHub repository if available
    const githubUrl = project.githubUrl || null;
    if (githubUrl) {
      try {
        console.log(`Cloning repository ${githubUrl} into cubicle-${cubicleNum}...`);
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        // Clone the repository into the cubicle root directory
        const { stdout, stderr } = await execPromise(`git clone "${githubUrl}" .`, {
          cwd: cubiclePath,
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large repos
        });
        
        if (stdout) console.log(`Clone output: ${stdout}`);
        if (stderr) console.log(`Clone stderr: ${stderr}`);
        
        // Create instructions for working within the repository copy
        await fs.writeFile(
          path.join(cubiclePath, 'INSTRUCTIONS.md'),
          `# Cubicle ${cubicleNum} - AI Workspace

## Important Instructions

This cubicle contains a copy of the project repository from: ${githubUrl}

### Working Directory
- The repository has been cloned directly into this cubicle's root directory
- All project files are available at: \`${cubiclePath}\`

### Guidelines
1. You are already in the project root - no need to change directories

2. All file edits, additions, and deletions happen directly in this workspace

3. This is an isolated workspace - changes here won't affect the main project until explicitly merged

4. Use git commands to track your changes

5. When ready, changes can be reviewed and potentially merged back to the main project

### Project: ${project.name}
### GitHub: ${githubUrl}
`
        );
      } catch (error) {
        console.error(`Failed to clone repository for cubicle-${cubicleNum}:`, error);
        // Fall back to creating a simple README if cloning fails
        await fs.writeFile(
          path.join(cubiclePath, 'README.md'),
          `# Cubicle ${cubicleNum}\n\nAI workspace for ${project.name}\n\nNote: Failed to clone repository from ${githubUrl}`
        );
      }
    } else {
      // No GitHub URL, create standard README
      await fs.writeFile(
        path.join(cubiclePath, 'README.md'),
        `# Cubicle ${cubicleNum}\n\nAI workspace for ${project.name}`
      );
    }
    
    // Update project
    project.aiOffice.cubicles.push({
      name: `cubicle-${cubicleNum}`,
      path: cubiclePath
    });
    project.aiOffice.cubicleCount = cubicleNum;
    
    await saveProjects();
    res.json({ cubicle: project.aiOffice.cubicles[project.aiOffice.cubicles.length - 1] });
  } catch (error) {
    console.error('Error adding cubicle:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove cubicle from AI Office
app.delete('/api/projects/:id/ai-office/cubicle/:cubicleIdx', async (req, res) => {
  try {
    const project = projects.get(req.params.id);
    if (!project || !project.aiOffice) {
      return res.status(404).json({ error: 'AI Office not found' });
    }
    
    const cubicleIdx = parseInt(req.params.cubicleIdx);
    if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
      return res.status(400).json({ error: 'Invalid cubicle index' });
    }
    
    // Don't allow removing the last cubicle
    if (project.aiOffice.cubicles.length === 1) {
      return res.status(400).json({ error: 'Cannot remove the last cubicle. Remove the entire AI Office instead.' });
    }
    
    const cubicle = project.aiOffice.cubicles[cubicleIdx];
    
    // Kill tmux session associated with this cubicle
    const sessionName = `ai-office-${req.params.id}-${cubicle.name}`;
    try {
      await new Promise((resolve, reject) => {
        exec(`tmux kill-session -t "${sessionName}"`, (error) => {
          if (error) {
            console.log(`No tmux session found for ${sessionName}, continuing...`);
          }
          resolve();
        });
      });
      
      // Remove session metadata
      sessions.delete(sessionName);
    } catch (e) {
      console.error('Error killing tmux session:', e);
    }
    
    // Remove directory
    try {
      await fs.rm(cubicle.path, { recursive: true, force: true });
    } catch (e) {
      console.error('Error removing cubicle directory:', e);
    }
    
    // Update project
    project.aiOffice.cubicles.splice(cubicleIdx, 1);
    project.aiOffice.cubicleCount = project.aiOffice.cubicles.length;
    
    await saveProjects();
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error removing cubicle:', error);
    res.status(500).json({ error: error.message });
  }
});

// File Browser
app.get('/api/browse', async (req, res) => {
  const { path: browsePath = process.env.HOME } = req.query;
  
  try {
    const entries = await fs.readdir(browsePath, { withFileTypes: true });
    const results = entries
      .filter(e => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map(e => ({
        name: e.name,
        path: path.join(browsePath, e.name),
        isDirectory: e.isDirectory()
      }));
    
    // Add parent directory if not at root
    if (browsePath !== '/') {
      results.unshift({
        name: '..',
        path: path.dirname(browsePath),
        isDirectory: true
      });
    }
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get home directory
app.get('/api/home', (req, res) => {
  res.json({ home: process.env.HOME || '/home/user' });
});

// Sessions
app.get('/api/sessions', (req, res) => {
  exec('tmux list-sessions -F "#{session_name}"', (error, stdout) => {
    if (error) {
      res.json({ sessions: [] });
      return;
    }
    
    const sessionNames = stdout.trim().split('\n').filter(Boolean);
    const sessionData = sessionNames.map(name => {
      const metadata = sessions.get(name) || {};
      return {
        name,
        project: metadata.project || 'Unknown',
        ...metadata
      };
    });
    
    res.json({ sessions: sessionData });
  });
});

app.post('/api/sessions', (req, res) => {
  const { name, projectId, isCubicle, cubiclePath } = req.body;
  const project = projects.get(projectId);
  
  if (!project) {
    res.status(400).json({ error: 'Project not found' });
    return;
  }
  
  // Use cubicle path if provided, otherwise project path
  const workingDir = cubiclePath || project.path;
  
  // Create tmux session
  const tmuxCmd = `tmux new-session -d -s "${name}" -c "${workingDir}" bash`;
  
  exec(tmuxCmd, (error) => {
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    
    // Store session metadata
    sessions.set(name, {
      projectId,
      project: project.name,
      isCubicle,
      cubiclePath,
      createdAt: new Date().toISOString()
    });
    
    res.json({ name, projectId });
  });
});

app.delete('/api/sessions/:name', (req, res) => {
  exec(`tmux kill-session -t "${req.params.name}"`, (error) => {
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
    term.write(msg.toString());
  });
  
  ws.on('close', () => {
    term.kill();
  });
});

// Start server
server.listen(PORT, TAILSCALE_IP, () => {
  console.log(`
🚀 Multipass - Terminal for AI
   
   Access: http://${TAILSCALE_IP}:${PORT}
   
   Features:
   ✓ Project management with per-project AI Offices
   ✓ AI Office: Multiple cubicle terminals per project
   ✓ Consolidated AI Offices view
   ✓ Full terminal access in browser
   ✓ Session management
   ✓ Mobile optimized
   ✓ NO AUTHENTICATION - Direct access!
  `);
});