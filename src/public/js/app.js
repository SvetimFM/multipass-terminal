// Global state
let currentTerminal = null;
let currentWs = null;
let currentPath = null;
let cubicleTerminals = new Map();
let cubicleWebSockets = new Map();
let autoAcceptMode = false;
let resizeListener = null;

// Store current AI Office project
let currentAIOfficeProject = null;

// Constants
const AUTO_ACCEPT_INTERVAL = 2000;
const MOBILE_BREAKPOINT = 768;
const DEFAULT_CUBICLE_COUNT = 3;
const MAX_CUBICLE_COUNT = 10;

// Load projects
async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      throw new Error('Failed to load projects');
    }
    const data = await response.json();
    
    const projectsList = document.getElementById('projects-list');
    const projectSelect = document.getElementById('project-select');
    
    projectsList.innerHTML = '';
    projectSelect.innerHTML = '';
    
    data.projects.forEach(project => {
      // Projects list with AI Office controls
      const hasAIOffice = project.aiOffice && project.aiOffice.enabled;
      projectsList.innerHTML += `
        <div class="bg-gray-800 p-3 rounded flex justify-between items-center">
          <div class="flex-1">
            <div class="font-semibold">${project.name}</div>
            <div class="text-xs text-gray-400 font-mono">${project.path}</div>
            ${project.githubUrl ? `<div class="text-xs text-blue-400 mt-1">GitHub: ${project.githubUrl}</div>` : ''}
            ${hasAIOffice ? `<div class="text-xs text-purple-400 mt-1">AI Office: ${project.aiOffice.cubicleCount} cubicles</div>` : ''}
          </div>
          <div class="flex gap-2 flex-wrap">
            ${hasAIOffice ? 
              `<button onclick="openAIOfficeGrid('${project.id}')" class="bg-purple-600 px-2 py-1 rounded text-xs">View AI Office</button>
               <button onclick="removeAIOffice('${project.id}')" class="bg-red-600 px-2 py-1 rounded text-xs">Remove</button>` :
              `<button onclick="setupAIOffice('${project.id}')" class="bg-purple-600 px-2 py-1 rounded text-xs">Setup AI Office</button>`
            }
            ${project.id !== 'default' ? 
              `<button onclick="deleteProject('${project.id}')" class="bg-red-600 px-2 py-1 rounded text-xs">Delete Project</button>` : 
              ''
            }
          </div>
        </div>
      `;
      
      // Project select
      projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`;
    });
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

// AI Office management
async function setupAIOffice(projectId) {
  const count = prompt(`How many cubicles? (default: ${DEFAULT_CUBICLE_COUNT}, max: ${MAX_CUBICLE_COUNT})`, DEFAULT_CUBICLE_COUNT.toString());
  if (!count) return;
  
  const cubicleCount = parseInt(count);
  if (isNaN(cubicleCount) || cubicleCount < 1 || cubicleCount > MAX_CUBICLE_COUNT) {
    alert(`Please enter a number between 1 and ${MAX_CUBICLE_COUNT}`);
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cubicleCount })
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
    const response = await fetch(`/api/projects/${projectId}/ai-office`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadProjects();
    }
  } catch (error) {
    console.error('Error removing AI Office:', error);
  }
}

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
  const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
  
  if (isMobile) {
    container.className = 'grid grid-cols-1 gap-4 p-4';
  } else {
    container.className = 'grid grid-cols-2 gap-4 p-4';
  }
  
  // Create terminals for each cubicle
  project.aiOffice.cubicles.forEach((cubicle, idx) => {
    const termDiv = document.createElement('div');
    termDiv.className = 'bg-gray-800 rounded overflow-hidden flex flex-col';
    termDiv.innerHTML = `
      <div class="bg-gray-700 px-3 py-2 text-sm font-medium flex justify-between items-center">
        <span>${cubicle.name}</span>
        <button onclick="removeCubicle('${project.id}', ${idx})" class="text-red-400 hover:text-red-300 text-xs">✕</button>
      </div>
      <div id="cubicle-grid-terminal-${projectId}-${idx}" class="cubicle-terminal flex-1"></div>
    `;
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

// Sync all cubicles with parent project
async function syncWithParent() {
  if (!currentAIOfficeProject) return;
  
  if (!confirm('This will sync all cubicles with the parent project. Any uncommitted changes will be lost. Continue?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${currentAIOfficeProject.id}/ai-office/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const result = await response.json();
      alert(`Sync completed! ${result.synced} cubicles updated.`);
    } else {
      const error = await response.json();
      alert('Failed to sync: ' + error.error);
    }
  } catch (error) {
    console.error('Error syncing with parent:', error);
    alert('Error syncing: ' + error.message);
  }
}

// Add a new terminal session to AI Office grid
async function addTerminal() {
  if (!currentAIOfficeProject) return;
  
  const container = document.getElementById('cubicle-terminals');
  const terminalCount = container.children.length;
  const terminalName = `terminal-${terminalCount + 1}`;
  const sessionName = `ai-office-${currentAIOfficeProject.id}-${terminalName}`;
  
  // Create terminal div
  const termDiv = document.createElement('div');
  termDiv.className = 'bg-gray-800 rounded overflow-hidden flex flex-col';
  termDiv.innerHTML = `
    <div class="bg-gray-700 px-3 py-2 text-sm font-medium flex justify-between items-center">
      <span>${terminalName} (Project Root)</span>
      <button onclick="removeTerminalFromGrid('${sessionName}')" class="text-red-400 hover:text-red-300 text-xs">✕</button>
    </div>
    <div id="terminal-grid-${sessionName}" class="cubicle-terminal flex-1"></div>
  `;
  container.appendChild(termDiv);
  
  // Initialize terminal in project root directory
  setTimeout(() => initProjectTerminal(currentAIOfficeProject, sessionName), 100);
}

// Add a new cubicle to the current AI Office
async function addCubicle() {
  if (!currentAIOfficeProject) return;
  
  try {
    const response = await fetch(`/api/projects/${currentAIOfficeProject.id}/ai-office/cubicle`, {
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
    const response = await fetch(`/api/projects/${projectId}/ai-office/cubicle/${cubicleIdx}`, {
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

// Initialize terminal in project root directory
function initProjectTerminal(project, sessionName) {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 12,
    fontFamily: 'Cascadia Code, Menlo, Monaco, Consolas, monospace',
    theme: {
      background: '#1a1b26',
      foreground: '#a9b1d6'
    }
  });
  
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  
  term.open(document.getElementById(`terminal-grid-${sessionName}`));
  fitAddon.fit();
  
  // Create session in project root directory
  fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      name: sessionName, 
      projectId: project.id,
      isCubicle: false
    })
  }).then(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
    
    ws.onopen = () => {
      term.write('\r\n*** Connected to Project Root ***\r\n');
    };
    
    ws.onmessage = (event) => {
      term.write(event.data);
    };
    
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    
    // Store terminal and websocket for cleanup
    cubicleTerminals.set(sessionName, { term, fitAddon });
    cubicleWebSockets.set(sessionName, ws);
  });
}

// Remove terminal from grid
function removeTerminalFromGrid(sessionName) {
  // Kill the tmux session
  fetch(`/api/sessions/${sessionName}`, { method: 'DELETE' });
  
  // Clean up terminal and websocket
  const terminal = cubicleTerminals.get(sessionName);
  if (terminal) {
    terminal.term.dispose();
    cubicleTerminals.delete(sessionName);
  }
  
  const ws = cubicleWebSockets.get(sessionName);
  if (ws) {
    ws.close();
    cubicleWebSockets.delete(sessionName);
  }
  
  // Remove the terminal div
  const termDiv = document.getElementById(`terminal-grid-${sessionName}`).parentElement;
  if (termDiv) {
    termDiv.remove();
  }
}

// Initialize cubicle terminal
function initCubicleTerminal(project, cubicle, idx, isGrid = false) {
  const terminalId = isGrid ? `cubicle-grid-terminal-${project.id}-${idx}` : `cubicle-terminal-${project.id}-${idx}`;
  const sessionName = `ai-office-${project.id}-${cubicle.name}`;
  
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
    const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
    
    ws.onopen = () => {
      term.write('\r\n*** Connected to ' + cubicle.name + ' ***\r\n');
    };
    
    ws.onmessage = (event) => {
      term.write(event.data);
    };
    
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    
    const key = `${project.id}-${idx}`;
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
      list.innerHTML = data.sessions.map(session => `
        <div class="bg-gray-800 p-3 rounded flex justify-between items-center">
          <div>
            <div class="font-semibold">${session.name}</div>
            <div class="text-xs text-gray-400">Project: ${session.project || 'Unknown'}</div>
          </div>
          <div class="flex gap-2">
            <button onclick="attachTerminal('${session.name}')" 
                    class="bg-blue-600 px-3 py-1 rounded text-sm">
              Open Terminal
            </button>
            <button onclick="killSession('${session.name}')" 
                    class="bg-red-600 px-3 py-1 rounded text-sm">
              Kill
            </button>
          </div>
        </div>
      `).join('');
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
    if (!projectId) {
      alert('Please select a project');
      return;
    }
    
    const name = document.getElementById('session-name').value.trim() || 
                 'claude-' + Date.now().toString().slice(-6);
    
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, projectId })
    });
    
    if (!response.ok) {
      const error = await response.json();
      alert('Error creating session: ' + (error.error || 'Unknown error'));
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

// Terminal management
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
  currentWs = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
  
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
    }, AUTO_ACCEPT_INTERVAL);
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
    const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
    const entries = await response.json();
    
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = entries.map(entry => `
      <div class="file-item hover:bg-gray-700 cursor-pointer flex items-center gap-2"
           onclick="${entry.isDirectory ? `loadDirectory('${entry.path}')` : ''}">
        <span>${entry.isDirectory ? '📁' : '📄'}</span>
        <span class="flex-1">${entry.name}</span>
      </div>
    `).join('');
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
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
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