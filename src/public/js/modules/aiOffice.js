// AI Office management functions
import { state, setState } from './state.js';
import { showToast, copyToClipboard } from './utils.js';
import { loadProjects } from './projects.js';
import { clipboardService } from '../clipboard.js';
import { TerminalFactory } from '../terminalFactory.js';
import { getTerminalSettings } from './terminalSettings.js';

// Setup copy/paste for cubicle terminals
function setupCubicleCopyPaste(term, cubicleKey) {
  // Handle keyboard shortcuts
  term.attachCustomKeyEventHandler((event) => {
    // Ctrl+C for copy (when there's a selection)
    if (event.ctrlKey && event.key === 'c' && term.hasSelection()) {
      copyCubicleSelection(term);
      return false;
    }
    // Ctrl+V for paste
    if (event.ctrlKey && event.key === 'v') {
      pasteToCubicle(term, cubicleKey);
      return false;
    }
    // Ctrl+Shift+C for copy
    if (event.ctrlKey && event.shiftKey && event.key === 'C') {
      copyCubicleSelection(term);
      return false;
    }
    // Ctrl+Shift+V for paste
    if (event.ctrlKey && event.shiftKey && event.key === 'V') {
      pasteToCubicle(term, cubicleKey);
      return false;
    }
    return true;
  });
  
  // Add right-click context menu
  const container = term.element || term._core.element;
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (term.hasSelection()) {
      copyCubicleSelection(term);
    }
  });
}

// Copy from cubicle terminal
async function copyCubicleSelection(term) {
  if (!term || !term.hasSelection()) {
    showToast('No text selected');
    return;
  }
  
  const selection = term.getSelection();
  if (selection) {
    await copyToClipboard(selection);
  }
}

// Paste to cubicle terminal
async function pasteToCubicle(term, cubicleKey) {
  const ws = state.cubicleWebSockets.get(cubicleKey);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
  try {
    const text = await clipboardService.pasteFromClipboard();
    if (text) {
      try {
        ws.send(JSON.stringify({
          type: 'input',
          data: text
        }));
      } catch (e) {
        // Fallback to raw send
        ws.send(text);
      }
      showToast('Pasted!');
    }
  } catch (err) {
    showToast('Unable to paste - check clipboard permissions');
  }
}

export async function setupAIOffice(projectId) {
  const count = prompt(`How many cubicles? (default: ${state.DEFAULT_CUBICLE_COUNT}, max: ${state.MAX_CUBICLE_COUNT})`, state.DEFAULT_CUBICLE_COUNT.toString());
  if (!count) return;
  
  const cubicleCount = parseInt(count);
  if (isNaN(cubicleCount) || cubicleCount < 1 || cubicleCount > state.MAX_CUBICLE_COUNT) {
    alert(`Please enter a number between 1 and ${state.MAX_CUBICLE_COUNT}`);
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

export async function removeAIOffice(projectId) {
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

export async function openAIOfficeGrid(projectId) {
  const response = await fetch('/api/projects');
  const data = await response.json();
  const project = data.projects.find(p => p.id === projectId);
  
  if (!project || !project.aiOffice) return;
  
  setState('currentAIOfficeProject', project);
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
  
  // Load AI modes and profile actions
  Promise.all([
    fetch('/api/ai-modes').then(res => res.json()),
    fetch('/api/profile-actions').then(res => res.json())
  ])
    .then(([aiModes, profileActions]) => {
      // Create mode options HTML
      const modeOptions = Object.entries(aiModes.modes).map(([key, mode]) => 
        `<option value="${key}">${mode.name}</option>`
      ).join('');
      
      // Create terminals for each cubicle
      project.aiOffice.cubicles.forEach((cubicle, idx) => {
        const currentMode = cubicle.aiMode || 'default';
        const termDiv = document.createElement('div');
        termDiv.className = 'bg-gray-800 rounded overflow-hidden';
        termDiv.innerHTML = `
          <div class="bg-gray-700 px-3 py-2 text-sm font-medium">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-3">
                <span class="font-semibold">${cubicle.name}</span>
                <select onchange="window.aiOffice.changeCubicleMode('${project.id}', ${idx}, this.value)" 
                        class="bg-gray-800 text-xs px-3 py-1 rounded border border-gray-600 hover:border-purple-500 focus:border-purple-500 focus:outline-none cursor-pointer text-purple-400 font-medium"
                        title="AI Mode - Click to change">
                  ${modeOptions}
                </select>
              </div>
              <div class="flex items-center gap-2">
                <button id="cubicle-action-${project.id}-${idx}"
                        onclick="window.aiOffice.executeProfileAction('${project.id}', ${idx}, '${currentMode}')" 
                        class="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-gray-800 rounded flex items-center gap-1" 
                        title="${profileActions.actions[currentMode]?.description || 'Execute profile action'}">
                  <span>⚡</span>
                  <span class="hidden sm:inline action-name">${profileActions.actions[currentMode]?.name || 'Action'}</span>
                </button>
                <button onclick="window.aiOffice.pasteToCubicleTerminal('${project.id}', ${idx})" 
                        class="text-green-400 hover:text-green-300 text-xs px-2 py-1 bg-gray-800 rounded" 
                        title="Paste to terminal">
                  📝
                </button>
                <button onclick="window.aiOffice.removeCubicle('${project.id}', ${idx})" 
                        class="text-red-400 hover:text-red-300 text-sm">
                  ✕
                </button>
              </div>
            </div>
          </div>
          <div id="cubicle-grid-terminal-${projectId}-${idx}" class="cubicle-terminal"></div>
        `;
        container.appendChild(termDiv);
        
        // Set the current mode in the dropdown
        const select = termDiv.querySelector('select');
        select.value = currentMode;
        
        setTimeout(async () => await initCubicleTerminal(project, cubicle, idx, true), 100 * idx);
      });
    })
    .catch(error => {
      console.error('Error loading AI modes:', error);
      // Fallback: create terminals without mode selector
      project.aiOffice.cubicles.forEach((cubicle, idx) => {
        const termDiv = document.createElement('div');
        termDiv.className = 'bg-gray-800 rounded overflow-hidden';
        termDiv.innerHTML = `
          <div class="bg-gray-700 px-3 py-2 text-sm font-medium flex justify-between items-center">
            <span>${cubicle.name}</span>
            <button onclick="window.aiOffice.removeCubicle('${project.id}', ${idx})" class="text-red-400 hover:text-red-300 text-xs">✕</button>
          </div>
          <div id="cubicle-grid-terminal-${projectId}-${idx}" class="cubicle-terminal"></div>
        `;
        container.appendChild(termDiv);
        
        setTimeout(async () => await initCubicleTerminal(project, cubicle, idx, true), 100 * idx);
      });
    });
}

export function closeAIOfficeGrid() {
  // Disable auto-accept if enabled
  if (state.gridAutoAcceptMode && window.terminal && window.terminal.toggleGridAutoAccept) {
    window.terminal.toggleGridAutoAccept();
  }
  
  // Clean up all terminals and WebSockets without killing tmux sessions
  state.cubicleTerminals.forEach(({ term }) => term.dispose());
  state.cubicleWebSockets.forEach(ws => {
    // Close WebSocket connection without killing the tmux session
    ws.close();
  });
  state.cubicleTerminals.clear();
  state.cubicleWebSockets.clear();
  
  setState('currentAIOfficeProject', null);
  document.getElementById('ai-office-grid').classList.add('hidden');
}

export async function initCubicleTerminal(project, cubicle, idx, isGrid = false) {
  const terminalId = isGrid ? `cubicle-grid-terminal-${project.id}-${idx}` : `cubicle-terminal-${idx}`;
  const container = document.getElementById(terminalId);
  
  if (!container) return;
  
  // Clear existing content
  container.innerHTML = '';
  
  // Create session name for this cubicle
  const sessionName = `ai-office-${project.id}-${cubicle.name}`;
  
  // Check if session already exists
  try {
    const checkResponse = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`);
    const checkData = await checkResponse.json();
    
    if (!checkData.exists) {
      // Session doesn't exist, create it
      const sessionResponse = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: sessionName, 
          projectId: project.id,
          isCubicle: true,
          cubiclePath: cubicle.path
        })
      });
      
      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json();
        console.error('Failed to create session for cubicle:', errorData);
        return;
      }
      console.log(`Created new session: ${sessionName}`);
    } else {
      console.log(`Session ${sessionName} already exists, connecting to it...`);
    }
  } catch (error) {
    console.error('Error checking/creating cubicle session:', error);
    return;
  }
  
  const settings = getTerminalSettings();
  const terminalOptions = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    theme: settings.theme,
    rightClickSelectsWord: true
  };
  
  const { terminal: term, fitAddon } = isGrid 
    ? TerminalFactory.createGridTerminal(container, terminalOptions)
    : TerminalFactory.createTerminalWithContainer(container, terminalOptions);
  
  // Store terminal and websocket reference for this cubicle
  state.cubicleTerminals.set(`${project.id}-${idx}`, { term, fitAddon });
  
  // Setup copy/paste support
  setupCubicleCopyPaste(term, `${project.id}-${idx}`);
  
  // Connect WebSocket with the session name
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
  
  ws.onopen = () => {
    console.log(`Connected to cubicle ${cubicle.name}`);
    fitAddon.fit();
    
    // Send initial resize to ensure sync
    const dimensions = fitAddon.proposeDimensions();
    if (dimensions) {
      ws.send(JSON.stringify({
        type: 'resize',
        cols: dimensions.cols,
        rows: dimensions.rows
      }));
    }
  };
  
  ws.onmessage = (event) => {
    term.write(event.data);
  };
  
  ws.onerror = (error) => {
    console.error(`WebSocket error for ${cubicle.name}:`, error);
  };
  
  ws.onclose = () => {
    console.log(`Disconnected from cubicle ${cubicle.name}`);
  };
  
  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      } catch (e) {
        // Fallback to raw send
        ws.send(data);
      }
    }
  });
  
  // Store WebSocket
  state.cubicleWebSockets.set(`${project.id}-${idx}`, ws);
  
  // Handle resize for grid view with debouncing
  if (isGrid) {
    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(() => {
      // Clear any pending resize
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      
      // Debounce resize events
      resizeTimer = setTimeout(() => {
        try {
          if (fitAddon) {
            fitAddon.fit();
            
            // Send resize message to server
            if (ws.readyState === WebSocket.OPEN) {
              const dimensions = fitAddon.proposeDimensions();
              if (dimensions) {
                ws.send(JSON.stringify({
                  type: 'resize',
                  cols: dimensions.cols,
                  rows: dimensions.rows
                }));
              }
            }
          }
        } catch (e) {
          // Ignore resize errors
        }
      }, 150); // Debounce for 150ms
    });
    resizeObserver.observe(container);
  }
}

export async function addCubicle(projectId) {
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office/cubicle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      await loadProjects();
      openAIOfficeGrid(projectId);
    } else {
      const error = await response.json();
      alert('Failed to add cubicle: ' + error.error);
    }
  } catch (error) {
    console.error('Error adding cubicle:', error);
    alert('Error adding cubicle: ' + error.message);
  }
}

export async function removeCubicle(projectId, cubicleIdx) {
  if (!confirm('Remove this cubicle?')) return;
  
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office/cubicle/${cubicleIdx}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadProjects();
      openAIOfficeGrid(projectId);
    } else {
      const error = await response.json();
      alert('Failed to remove cubicle: ' + error.error);
    }
  } catch (error) {
    console.error('Error removing cubicle:', error);
    alert('Error removing cubicle: ' + error.message);
  }
}

// Execute profile-specific action
export async function executeProfileAction(projectId, cubicleIdx, profile) {
  try {
    // Show loading state
    showToast('⚡ Executing action...');
    
    const response = await fetch('/api/profile-actions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, projectId, cubicleIdx })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Create a modal to show the output
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div class="bg-gray-700 px-6 py-4 flex justify-between items-center">
            <h3 class="text-lg font-semibold text-white">${result.action} - Results</h3>
            <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white">✕</button>
          </div>
          <div class="p-6 overflow-y-auto flex-1">
            <pre class="whitespace-pre-wrap text-sm text-gray-300 font-mono">${result.output}</pre>
            <div class="mt-4 text-xs text-gray-500">Executed at: ${new Date(result.timestamp).toLocaleString()}</div>
          </div>
          <div class="bg-gray-700 px-6 py-3 flex justify-end">
            <button onclick="this.closest('.fixed').remove()" 
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">
              Close
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // Close on outside click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
    } else {
      showToast(`❌ Action failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Error executing profile action:', error);
    showToast('❌ Failed to execute action', 'error');
  }
}

// Paste to project terminal (non-cubicle)
export async function pasteToProjectTerminal(sessionName) {
  const ws = state.cubicleWebSockets.get(sessionName);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      ws.send(text);
      showToast('Pasted!');
    } else {
      showToast('Clipboard is empty');
    }
  } catch (err) {
    // Try fallback for older browsers or permission issues
    try {
      const textarea = document.createElement('textarea');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      document.execCommand('paste');
      const text = textarea.value;
      document.body.removeChild(textarea);
      
      if (text) {
        ws.send(text);
        showToast('Pasted!');
      } else {
        showToast('Unable to paste - check clipboard permissions');
      }
    } catch (e) {
      showToast('Unable to paste - check clipboard permissions');
    }
  }
}

export async function addTerminal() {
  if (!state.currentAIOfficeProject) return;
  
  const container = document.getElementById('cubicle-terminals');
  const terminalCount = container.children.length;
  const terminalName = `terminal-${terminalCount + 1}`;
  const sessionName = `ai-office-${state.currentAIOfficeProject.id}-${terminalName}`;
  
  // Create terminal div
  const termDiv = document.createElement('div');
  termDiv.className = 'bg-gray-800 rounded overflow-hidden';
  termDiv.innerHTML = `
    <div class="bg-gray-700 px-3 py-2 text-sm font-medium flex justify-between items-center">
      <span>${terminalName} (Project Root)</span>
      <div class="flex items-center gap-2">
        <button onclick="window.aiOffice.pasteToProjectTerminal('${sessionName}')" 
                class="text-green-400 hover:text-green-300 text-xs px-2 py-1 bg-gray-800 rounded" 
                title="Paste to terminal">
          📝
        </button>
        <button onclick="window.aiOffice.removeTerminalFromGrid('${sessionName}')" 
                class="text-red-400 hover:text-red-300 text-xs">
          ✕
        </button>
      </div>
    </div>
    <div id="terminal-grid-${sessionName}" class="cubicle-terminal"></div>
  `;
  container.appendChild(termDiv);
  
  // Initialize terminal in project root directory
  setTimeout(() => initProjectTerminal(state.currentAIOfficeProject, sessionName), 100);
}

function initProjectTerminal(project, sessionName) {
  const container = document.getElementById(`terminal-grid-${sessionName}`);
  
  const settings = getTerminalSettings();
  const terminalOptions = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    theme: settings.theme,
    rightClickSelectsWord: true
  };
  
  const { terminal: term, fitAddon } = TerminalFactory.createGridTerminal(container, terminalOptions);
  
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
      fitAddon.fit();
      
      // Send initial resize to ensure sync
      const dimensions = fitAddon.proposeDimensions();
      if (dimensions) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: dimensions.cols,
          rows: dimensions.rows
        }));
      }
    };
    
    ws.onmessage = (event) => {
      term.write(event.data);
    };
    
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'input',
            data: data
          }));
        } catch (e) {
          // Fallback to raw send
          ws.send(data);
        }
      }
    });
    
    // Store terminal and websocket for cleanup
    state.cubicleTerminals.set(sessionName, { term, fitAddon });
    state.cubicleWebSockets.set(sessionName, ws);
    
    // Handle resize with debouncing
    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      
      resizeTimer = setTimeout(() => {
        try {
          if (fitAddon) {
            fitAddon.fit();
            
            // Send resize message to server
            if (ws.readyState === WebSocket.OPEN) {
              const dimensions = fitAddon.proposeDimensions();
              if (dimensions) {
                ws.send(JSON.stringify({
                  type: 'resize',
                  cols: dimensions.cols,
                  rows: dimensions.rows
                }));
              }
            }
          }
        } catch (e) {
          // Ignore resize errors
        }
      }, 150); // Debounce for 150ms
    });
    resizeObserver.observe(container);
  });
}

export function removeTerminalFromGrid(sessionName) {
  // Kill the tmux session
  fetch(`/api/sessions/${sessionName}`, { method: 'DELETE' });
  
  // Clean up terminal and websocket
  const terminal = state.cubicleTerminals.get(sessionName);
  if (terminal) {
    terminal.term.dispose();
    state.cubicleTerminals.delete(sessionName);
  }
  
  const ws = state.cubicleWebSockets.get(sessionName);
  if (ws) {
    ws.close();
    state.cubicleWebSockets.delete(sessionName);
  }
  
  // Remove the terminal div
  const termDiv = document.getElementById(`terminal-grid-${sessionName}`).parentElement;
  if (termDiv) {
    termDiv.remove();
  }
}

// Paste to specific cubicle terminal
export async function pasteToCubicleTerminal(projectId, cubicleIdx) {
  const cubicleKey = `${projectId}-${cubicleIdx}`;
  const ws = state.cubicleWebSockets.get(cubicleKey);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      ws.send(text);
      showToast('Pasted!');
    } else {
      showToast('Clipboard is empty');
    }
  } catch (err) {
    // Try fallback for older browsers or permission issues
    try {
      const textarea = document.createElement('textarea');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      document.execCommand('paste');
      const text = textarea.value;
      document.body.removeChild(textarea);
      
      if (text) {
        ws.send(text);
        showToast('Pasted!');
      } else {
        showToast('Unable to paste - check clipboard permissions');
      }
    } catch (e) {
      showToast('Unable to paste - check clipboard permissions');
    }
  }
}

// Change cubicle mode directly from dropdown
export async function changeCubicleMode(projectId, cubicleIdx, newMode) {
  try {
    // Get mode name for toast
    const modesResponse = await fetch('/api/ai-modes');
    const aiModes = await modesResponse.json();
    const modeName = aiModes.modes[newMode]?.name || newMode;
    
    const response = await fetch(`/api/projects/${projectId}/ai-office/set-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode, target: 'cubicle', cubicleIdx })
    });
    
    if (response.ok) {
      // Update the local project data
      if (state.currentAIOfficeProject && 
          state.currentAIOfficeProject.id === projectId && 
          state.currentAIOfficeProject.aiOffice.cubicles[cubicleIdx]) {
        state.currentAIOfficeProject.aiOffice.cubicles[cubicleIdx].aiMode = newMode;
      }
      showToast(`Mode changed to ${modeName}`);
      
      // Update the action button for the cubicle
      const actionButton = document.querySelector(`#cubicle-action-${projectId}-${cubicleIdx}`);
      if (actionButton) {
        const profileActionsResponse = await fetch('/api/profile-actions');
        const profileActions = await profileActionsResponse.json();
        const action = profileActions.actions[newMode];
        
        if (action) {
          actionButton.setAttribute('title', action.description);
          actionButton.setAttribute('onclick', `window.aiOffice.executeProfileAction('${projectId}', ${cubicleIdx}, '${newMode}')`);
          const actionName = actionButton.querySelector('.action-name');
          if (actionName) {
            actionName.textContent = action.name;
          }
        }
      }
      
      // Reload projects to ensure persistence
      await loadProjects();
    } else {
      const error = await response.json();
      alert('Failed to change mode: ' + error.error);
      // Reset dropdown to previous value
      openAIOfficeGrid(projectId);
    }
  } catch (error) {
    console.error('Error changing cubicle mode:', error);
    alert('Error changing mode: ' + error.message);
    // Reset dropdown to previous value
    openAIOfficeGrid(projectId);
  }
}