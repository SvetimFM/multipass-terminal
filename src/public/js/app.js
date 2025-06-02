// Main application orchestrator
import { state } from './modules/state.js';
import * as utils from './modules/utils.js';
import * as projects from './modules/projects.js';
import * as sessions from './modules/sessions.js';
import * as terminal from './modules/terminal.js';
import * as aiOffice from './modules/aiOffice.js';
import * as cubicleManagement from './modules/cubicleManagement.js';
import * as fileBrowser from './modules/fileBrowser.js';
import * as mobile from './modules/mobile.js';

// Expose modules to window for onclick handlers
window.utils = utils;
window.projects = projects;
window.sessions = sessions;
window.terminal = terminal;
window.aiOffice = aiOffice;
window.cubicleManagement = cubicleManagement;
window.fileBrowser = fileBrowser;
window.mobile = mobile;
window.state = state;

<<<<<<< HEAD
// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Ship Anywhere app...');
  
  // Load initial data
  await projects.loadProjects();
  
  // Set up mobile features if on mobile
  if (utils.isMobile()) {
    mobile.createMobileFAB();
    mobile.addLongPressSupport();
    mobile.updateMobileCommandsExpanded();
=======
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

// Loading overlay functions
function showLoading(text = 'Loading...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// AI Office management
async function setupAIOffice(projectId) {
  const count = prompt('How many cubicles? (default: 3)', '3');
  if (!count) return;
  
  showLoading('Setting up AI Office...');
  
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office`, {
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
  } finally {
    hideLoading();
  }
}

async function removeAIOffice(projectId) {
  if (!confirm('Remove AI Office? This will delete all cubicles.')) return;
  
  showLoading('Removing AI Office...');
  
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadProjects();
    }
  } catch (error) {
    console.error('Error removing AI Office:', error);
  } finally {
    hideLoading();
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
  const isMobile = window.innerWidth < 768;
  
  if (isMobile) {
    container.className = 'grid grid-cols-1 gap-4 p-4';
>>>>>>> 9b63242 (Fix terminal command escaping and enhance AI Office sync)
  } else {
    mobile.addDesktopCopyButtons();
  }
  
  // Set up event listeners
  setupEventListeners();
  
  // Check for mobile and adjust UI
  handleResponsiveUI();
  window.addEventListener('resize', handleResponsiveUI);
});

<<<<<<< HEAD
function setupEventListeners() {
  // Session form submission
  const sessionForm = document.getElementById('session-form');
  if (sessionForm) {
    sessionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sessions.createSession();
=======
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

// Clear all terminals
function clearAllTerminals() {
  // Try both methods: ANSI escape sequence and Ctrl+L
  // ANSI escape sequence to clear screen and move cursor to top
  broadcastToAllTerminals('\x1b[2J\x1b[H');
  // Also send Ctrl+L as backup
  setTimeout(() => broadcastToAllTerminals('\x0c'), 50);
}

// Clear single terminal
function clearTerminal() {
  // Try both methods: ANSI escape sequence and Ctrl+L
  // ANSI escape sequence to clear screen and move cursor to top
  sendToTerminal('\x1b[2J\x1b[H');
  // Also send Ctrl+L as backup
  setTimeout(() => sendToTerminal('\x0c'), 50);
}

// Sync all cubicles with parent project
async function syncWithParent() {
  if (!currentAIOfficeProject) return;
  
  if (!confirm('This will sync all cubicles with the parent project. Any uncommitted changes will be lost. Continue?')) {
    return;
  }
  
  showLoading('Syncing cubicles with parent project...');
  
  try {
    const response = await fetch(`/api/projects/${currentAIOfficeProject.id}/ai-office/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
>>>>>>> 9b63242 (Fix terminal command escaping and enhance AI Office sync)
    });
  }
  
  // Project form submission
  const addProjectBtn = document.getElementById('add-project-btn');
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', projects.addProject);
  }
  
  // Navigation buttons
  const showSessionsBtn = document.getElementById('show-sessions-btn');
  if (showSessionsBtn) {
    showSessionsBtn.addEventListener('click', sessions.showSessions);
  }
  
  const showProjectsBtn = document.getElementById('show-projects-btn');
  if (showProjectsBtn) {
    showProjectsBtn.addEventListener('click', sessions.showProjects);
  }
  
  // Terminal close button
  const closeTerminalBtn = document.getElementById('close-terminal-btn');
  if (closeTerminalBtn) {
    closeTerminalBtn.addEventListener('click', terminal.closeTerminal);
  }
  
  // AI Office grid close button
  const closeGridBtn = document.getElementById('close-grid-btn');
  if (closeGridBtn) {
    closeGridBtn.addEventListener('click', aiOffice.closeAIOfficeGrid);
  }
  
  // File browser buttons
  const browseBtn = document.getElementById('browse-btn');
  if (browseBtn) {
    browseBtn.addEventListener('click', fileBrowser.openFileBrowser);
  }
  
  const closeBrowserBtn = document.getElementById('close-browser-btn');
  if (closeBrowserBtn) {
    closeBrowserBtn.addEventListener('click', fileBrowser.closeFileBrowser);
  }
  
  // Cubicle management close button
  const closeCubicleManagementBtn = document.getElementById('close-cubicle-management-btn');
  if (closeCubicleManagementBtn) {
    closeCubicleManagementBtn.addEventListener('click', cubicleManagement.closeCubicleManagement);
  }
}

function handleResponsiveUI() {
  const isMobile = utils.isMobile();
  
  // Update UI elements based on screen size
  const mobileElements = document.querySelectorAll('.mobile-only');
  const desktopElements = document.querySelectorAll('.desktop-only');
  
  mobileElements.forEach(el => {
    el.style.display = isMobile ? 'block' : 'none';
  });
  
  desktopElements.forEach(el => {
    el.style.display = isMobile ? 'none' : 'block';
  });
  
  // Update FAB visibility
  const fab = document.querySelector('.fab');
  const terminalView = document.getElementById('terminal-view');
  if (fab && terminalView) {
    if (isMobile && !terminalView.classList.contains('hidden')) {
      fab.classList.remove('hidden');
    } else {
<<<<<<< HEAD
      fab.classList.add('hidden');
=======
      const error = await response.json();
      alert('Failed to sync: ' + error.error);
    }
  } catch (error) {
    console.error('Error syncing with parent:', error);
    alert('Error syncing: ' + error.message);
  } finally {
    hideLoading();
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
  
  showLoading('Adding new cubicle...');
  
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
  } finally {
    hideLoading();
  }
}

// Remove a cubicle from the AI Office
async function removeCubicle(projectId, cubicleIdx) {
  if (!confirm('Remove this cubicle?')) return;
  
  showLoading('Removing cubicle...');
  
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
  } finally {
    hideLoading();
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
    }, 2000);
  } else {
    status.textContent = 'OFF';
    btn.classList.remove('bg-green-600');
    btn.classList.add('bg-gray-600');
    
    if (window.autoAcceptInterval) {
      clearInterval(window.autoAcceptInterval);
      window.autoAcceptInterval = null;
>>>>>>> 9b63242 (Fix terminal command escaping and enhance AI Office sync)
    }
  }
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  utils.showToast('An error occurred. Check console for details.');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  // Close all WebSocket connections
  if (state.currentWs) state.currentWs.close();
  state.cubicleWebSockets.forEach(ws => ws.close());
  
<<<<<<< HEAD
  // Dispose all terminals
  if (state.currentTerminal) state.currentTerminal.dispose();
  state.cubicleTerminals.forEach(({ term }) => term.dispose());
});
=======
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
  
  showLoading('Deleting project...');
  
  try {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    await loadProjects();
  } catch (error) {
    console.error('Error deleting project:', error);
    alert('Error deleting project');
  } finally {
    hideLoading();
  }
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
>>>>>>> 9b63242 (Fix terminal command escaping and enhance AI Office sync)
