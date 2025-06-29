// AI Office management functions
import { state, setState } from './state.js';
import { showToast, copyToClipboard } from './utils.js';
import { loadProjects } from './projects.js';
import { clipboardService } from '../clipboard.js';
import { TerminalFactory } from '../terminalFactory.js';
import { getTerminalSettings } from './terminalSettings.js';
import { initializeCubicleResize } from './terminalResize.js';

// Context menu state
let currentContextMenu = null;

// Show context menu for cubicle terminals
function showCubicleContextMenu(event, term, cubicleKey) {
  // Remove any existing context menu
  if (currentContextMenu) {
    currentContextMenu.remove();
  }
  
  // Get cubicle info from key
  const [projectId, cubicleIdx] = cubicleKey.split('-');
  const project = state.currentAIOfficeProject;
  const cubicle = project?.aiOffice?.cubicles[cubicleIdx];
  
  // Create context menu
  const menu = document.createElement('div');
  menu.className = 'absolute bg-gray-800 border border-gray-600 rounded shadow-lg py-1 z-50';
  menu.style.left = `${event.pageX}px`;
  menu.style.top = `${event.pageY}px`;
  
  // Menu items
  const menuItems = [];
  
  // Copy selection if text is selected
  if (term.hasSelection()) {
    menuItems.push({
      label: '📋 Copy',
      action: () => copyCubicleSelection(term)
    });
  }
  
  // Always show paste
  menuItems.push({
    label: '📝 Paste',
    action: () => pasteToCubicle(term, cubicleKey)
  });
  
  // Open in file explorer
  if (cubicle) {
    menuItems.push({
      label: '📁 Open in File Explorer',
      action: () => openCubicleInFileExplorer(cubicle.path)
    });
  }
  
  // Add separator if we have items above
  if (menuItems.length > 0) {
    menuItems.push({ separator: true });
  }
  
  // Terminal actions
  menuItems.push({
    label: '🔄 Clear Terminal',
    action: () => {
      term.clear();
      showToast('Terminal cleared');
    }
  });
  
  menuItems.push({
    label: '⎋ Send ESC',
    action: () => sendEscToCubicle(projectId, cubicleIdx)
  });
  
  // Build menu HTML
  menuItems.forEach((item, index) => {
    if (item.separator) {
      const separator = document.createElement('div');
      separator.className = 'border-t border-gray-700 my-1';
      menu.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm whitespace-nowrap';
      menuItem.textContent = item.label;
      menuItem.onclick = () => {
        item.action();
        menu.remove();
      };
      menu.appendChild(menuItem);
    }
  });
  
  // Add to body
  document.body.appendChild(menu);
  currentContextMenu = menu;
  
  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
      currentContextMenu = null;
    }
  };
  
  // Delay adding listeners to prevent immediate closure
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('contextmenu', closeMenu);
  }, 0);
  
  // Adjust position if menu goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${event.pageX - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${event.pageY - rect.height}px`;
  }
}

// Open cubicle in file explorer
export function openCubicleInFileExplorer(cubiclePath) {
  // Open the file browser modal with the cubicle path
  import('./fileBrowser.js').then(({ browseFolder }) => {
    document.getElementById('file-browser-modal').classList.remove('hidden');
    browseFolder(cubiclePath);
    showToast('Opened cubicle in file explorer');
  });
}

// Setup mouse wheel scrolling for cubicle terminals
function setupCubicleMouseWheel(term) {
  if (!term) return;
  
  // Ensure terminal is not in application cursor mode
  term.options.applicationCursor = false;
  
  // Enable mouse events for scrolling
  term.options.mouseEvents = true;
  
  // Sync viewport if available
  if (term.viewport) {
    term.viewport.syncScrollArea();
  }
}

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
    if (event.ctrlKey && event.key === 'v' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      pasteToCubicle(term, cubicleKey);
      return false;
    }
    // Ctrl+Shift+C for copy
    if (event.ctrlKey && event.shiftKey && event.key === 'C') {
      copyCubicleSelection(term);
      return false;
    }
    // Ctrl+Shift+V for paste
    if (event.ctrlKey && event.shiftKey && event.key === 'V' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      pasteToCubicle(term, cubicleKey);
      return false;
    }
    return true;
  });
  
  // Add right-click context menu
  const container = term.element || term._core.element;
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCubicleContextMenu(e, term, cubicleKey);
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
  
  // Don't focus the terminal as it clears the selection
  
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
  
  // Generate dynamic buttons for AI Office
  if (window.terminal && window.terminal.generateAIOfficeButtons) {
    window.terminal.generateAIOfficeButtons();
  }
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
  
  // Load AI modes
  fetch('/api/ai-modes')
    .then(res => res.json())
    .then((aiModes) => {
      // Create mode options HTML
      const modeOptions = Object.entries(aiModes.modes).map(([key, mode]) => 
        `<option value="${key}">${mode.name}</option>`
      ).join('');
      
      // Create terminals for each cubicle
      project.aiOffice.cubicles.forEach((cubicle, idx) => {
        const currentMode = cubicle.aiMode || 'default';
        // Escape cubicle path for safe use in onclick handlers
        const escapedPath = cubicle.path.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        
        const termDiv = document.createElement('div');
        termDiv.className = 'bg-gray-800 rounded overflow-hidden shadow-lg border border-gray-700';
        termDiv.innerHTML = `
          <div class="bg-gray-900 border-b border-gray-700 px-3 py-2">
            <div class="flex items-center justify-between">
              <!-- Left section: Name and path -->
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-gray-200">${cubicle.name}</span>
                  <span class="text-xs text-gray-500">│</span>
                  <span class="text-xs text-gray-400 truncate font-mono">${cubicle.path.split('/').slice(-2).join('/')}</span>
                </div>
              </div>
              
              <!-- Center section: AI Mode selector -->
              <div class="flex items-center gap-2">
                <select onchange="window.aiOffice.changeCubicleMode('${project.id}', ${idx}, this.value)" 
                        class="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-700 hover:border-purple-500 focus:border-purple-500 focus:outline-none cursor-pointer text-purple-400 font-medium"
                        title="AI Mode">
                  ${modeOptions}
                </select>
              </div>
              
              <!-- Right section: Action buttons -->
              <div class="flex items-center gap-1">
                <button onclick="window.aiOffice.readAIReadme('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-blue-400 p-1.5 rounded hover:bg-gray-800 transition-colors" 
                        title="Copy .AI_README to clipboard">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                  </svg>
                </button>
                <button onclick="window.aiOffice.openCubicleInFileExplorer('${escapedPath}')" 
                        class="text-gray-400 hover:text-blue-400 p-1.5 rounded hover:bg-gray-800 transition-colors" 
                        title="Open in file explorer">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                  </svg>
                </button>
                <button onclick="window.aiOffice.pasteToCubicleTerminal('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-green-400 p-1.5 rounded hover:bg-gray-800 transition-colors" 
                        title="Paste to terminal">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                  </svg>
                </button>
                <button onclick="window.aiOffice.sendEscToCubicle('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-orange-400 p-1.5 rounded hover:bg-gray-800 transition-colors md:hidden" 
                        title="Send ESC key">
                  <span class="text-xs font-bold">ESC</span>
                </button>
                <div class="w-px h-4 bg-gray-700 mx-1"></div>
                <button onclick="window.aiOffice.removeCubicle('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-red-400 p-1.5 rounded hover:bg-gray-800 transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
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
        termDiv.className = 'bg-gray-800 rounded overflow-hidden shadow-lg border border-gray-700';
        termDiv.innerHTML = `
          <div class="bg-gray-900 border-b border-gray-700 px-3 py-2">
            <div class="flex items-center justify-between">
              <!-- Left section: Name and path -->
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-gray-200">${cubicle.name}</span>
                  <span class="text-xs text-gray-500">│</span>
                  <span class="text-xs text-gray-400 truncate font-mono">${cubicle.path.split('/').slice(-2).join('/')}</span>
                </div>
              </div>
              
              <!-- Right section: Action buttons -->
              <div class="flex items-center gap-1">
                <button onclick="window.aiOffice.readAIReadme('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-blue-400 p-1.5 rounded hover:bg-gray-800 transition-colors" 
                        title="Copy .AI_README to clipboard">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                  </svg>
                </button>
                <button onclick="window.aiOffice.openCubicleInFileExplorer('${escapedPath}')" 
                        class="text-gray-400 hover:text-blue-400 p-1.5 rounded hover:bg-gray-800 transition-colors" 
                        title="Open in file explorer">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                  </svg>
                </button>
                <button onclick="window.aiOffice.pasteToCubicleTerminal('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-green-400 p-1.5 rounded hover:bg-gray-800 transition-colors" 
                        title="Paste to terminal">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                  </svg>
                </button>
                <button onclick="window.aiOffice.sendEscToCubicle('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-orange-400 p-1.5 rounded hover:bg-gray-800 transition-colors md:hidden" 
                        title="Send ESC key">
                  <span class="text-xs font-bold">ESC</span>
                </button>
                <div class="w-px h-4 bg-gray-700 mx-1"></div>
                <button onclick="window.aiOffice.removeCubicle('${project.id}', ${idx})" 
                        class="text-gray-400 hover:text-red-400 p-1.5 rounded hover:bg-gray-800 transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div id="cubicle-grid-terminal-${projectId}-${idx}" class="cubicle-terminal"></div>
        `;
        container.appendChild(termDiv);
        
        setTimeout(async () => await initCubicleTerminal(project, cubicle, idx, true), 100 * idx);
      });
      
      // Load existing regular terminals after cubicles
      setTimeout(async () => await loadExistingTerminals(project), 100 * project.aiOffice.cubicles.length);
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

export async function initCubicleTerminal(project, cubicle, idx, isGrid = false, customTerminalId = null) {
  const terminalId = customTerminalId || (isGrid ? `cubicle-grid-terminal-${project.id}-${idx}` : `cubicle-terminal-${idx}`);
  const container = document.getElementById(terminalId);
  
  console.log('Initializing cubicle terminal:', { terminalId, container, project, cubicle, idx });
  
  if (!container) {
    console.error('Container not found for terminal:', terminalId);
    return;
  }
  
  // Clear existing content
  container.innerHTML = '';
  
  // Ensure container has height
  if (!container.offsetHeight) {
    container.style.height = '400px';
  }
  
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
    scrollback: settings.scrollback,
    rightClickSelectsWord: false
  };
  
  const terminalInstance = isGrid 
    ? TerminalFactory.createGridTerminal(container, terminalOptions)
    : TerminalFactory.createTerminalWithContainer(container, terminalOptions);
  
  console.log('Terminal instance created:', terminalInstance);
  
  const term = terminalInstance.terminal;
  const fitAddon = terminalInstance.fitAddon;
  
  console.log('Terminal and fitAddon:', { term, fitAddon });
  
  // Ensure terminal fits properly after creation
  setTimeout(() => {
    if (fitAddon) {
      fitAddon.fit();
    }
  }, 50);
  
  // Store terminal and websocket reference for this cubicle
  // Use custom terminal ID if provided for multiproject panes
  const terminalKey = customTerminalId ? customTerminalId.replace('-cubicle-', '-') : `${project.id}-${idx}`;
  state.cubicleTerminals.set(terminalKey, { term, fitAddon });
  
  // Setup copy/paste support
  setupCubicleCopyPaste(term, terminalKey);
  
  // Setup proper mouse wheel scrolling
  setupCubicleMouseWheel(term);
  
  // Selection preservation state for this cubicle
  let isSelecting = false;
  let selectionBuffer = [];
  let bufferTimer = null;
  
  // Track mouse selection state
  const terminalElement = term.element;
  terminalElement.addEventListener('mousedown', () => {
    isSelecting = true;
  });
  
  terminalElement.addEventListener('mouseup', () => {
    isSelecting = false;
    // Flush any buffered data after selection is complete
    if (selectionBuffer.length > 0) {
      setTimeout(() => {
        selectionBuffer.forEach(data => term.write(data));
        selectionBuffer = [];
      }, 50);
    }
  });
  
  // Also clear selection state if mouse leaves the terminal
  terminalElement.addEventListener('mouseleave', () => {
    if (isSelecting) {
      isSelecting = false;
      // Flush buffered data
      if (selectionBuffer.length > 0) {
        setTimeout(() => {
          selectionBuffer.forEach(data => term.write(data));
          selectionBuffer = [];
        }, 50);
      }
    }
  });
  
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
    // If user is selecting text, buffer the data instead of writing immediately
    if (isSelecting && term.hasSelection()) {
      selectionBuffer.push(event.data);
      
      // Clear any existing timer
      if (bufferTimer) {
        clearTimeout(bufferTimer);
      }
      
      // Set a timeout to flush buffer if selection takes too long
      bufferTimer = setTimeout(() => {
        if (selectionBuffer.length > 0) {
          selectionBuffer.forEach(data => term.write(data));
          selectionBuffer = [];
        }
        bufferTimer = null;
      }, 1000); // Flush after 1 second max
    } else {
      // Normal write when not selecting
      term.write(event.data);
    }
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
  state.cubicleWebSockets.set(terminalKey, ws);
  
  // Handle resize for grid view with debouncing
  if (isGrid) {
    // Initialize vertical resize functionality on the wrapper div
    const wrapperDiv = container.parentElement;
    if (wrapperDiv) {
      initializeCubicleResize(wrapperDiv, `${project.id}-${idx}`);
    }
    
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


// Read .AI_README in cubicle terminal - Copy to clipboard
export async function readAIReadme(projectId, cubicleIdx) {
  try {
    // Get the cubicle session name
    const project = state.currentAIOfficeProject;
    if (!project || project.id !== projectId) {
      showToast('Project not found');
      return;
    }
    
    const cubicle = project.aiOffice.cubicles[cubicleIdx];
    if (!cubicle) {
      showToast('Cubicle not found');
      return;
    }
    
    // Fetch the .AI_README content from the server
    const response = await fetch(`/api/projects/${projectId}/aioffice/cubicles/${cubicleIdx}/read-ai-readme`);
    
    if (!response.ok) {
      throw new Error('Failed to read .AI_README');
    }
    
    const data = await response.json();
    const content = data.content || '';
    
    // Copy the content to clipboard
    if (content) {
      await copyToClipboard(content);
      showToast('📖 .AI_README copied to clipboard! Paste it into the terminal.');
    } else {
      showToast('.AI_README is empty', 'warning');
    }
  } catch (error) {
    console.error('Error reading .AI_README:', error);
    showToast('Failed to read .AI_README', 'error');
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

// Load existing regular terminals for this project
async function loadExistingTerminals(project) {
  try {
    const response = await fetch('/api/sessions');
    const data = await response.json();
    
    // Filter for non-cubicle sessions belonging to this project
    const regularSessions = data.sessions.filter(session => 
      session.projectId === project.id && !session.isCubicle
    );
    
    // Create terminal UI for each existing session
    const container = document.getElementById('cubicle-terminals');
    for (const session of regularSessions) {
      await createTerminalUI(session.name, project, true);
    }
  } catch (error) {
    console.error('Failed to load existing terminals:', error);
  }
}

// Create terminal UI (used by both addTerminal and loadExistingTerminals)
async function createTerminalUI(sessionName, project, existingSession = false) {
  const container = document.getElementById('cubicle-terminals');
  
  // Extract display name from session name
  const displayName = sessionName.startsWith(`ai-office-${project.id}-`) 
    ? sessionName.replace(`ai-office-${project.id}-`, '')
    : sessionName;
  
  // Create terminal div
  const termDiv = document.createElement('div');
  termDiv.className = 'bg-gray-800 rounded overflow-hidden';
  termDiv.innerHTML = `
    <div class="bg-gray-900 border-b border-gray-700 px-3 py-2">
      <div class="flex items-center justify-between">
        <!-- Left section: Name and path -->
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-200">📺 ${displayName}</span>
            <span class="text-xs text-gray-500">│</span>
            <span class="text-xs text-gray-400 font-mono">Project Root</span>
          </div>
        </div>
        
        <!-- Right section: Action buttons -->
        <div class="flex items-center gap-1">
          <button onclick="window.aiOffice.pasteToProjectTerminal('${sessionName}')" 
                  class="text-gray-400 hover:text-green-400 p-1.5 rounded hover:bg-gray-800 transition-colors" 
                  title="Paste to terminal">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
          </button>
          <div class="w-px h-4 bg-gray-700 mx-1"></div>
          <button onclick="window.aiOffice.removeTerminalFromGrid('${sessionName}')" 
                  class="text-gray-400 hover:text-red-400 p-1.5 rounded hover:bg-gray-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
    <div id="terminal-grid-${sessionName}" class="cubicle-terminal"></div>
  `;
  container.appendChild(termDiv);
  
  // Initialize terminal
  if (existingSession) {
    // For existing sessions, just connect to them
    setTimeout(() => connectToExistingTerminal(project, sessionName), 100);
  } else {
    // For new sessions, create and initialize
    setTimeout(() => initProjectTerminal(project, sessionName), 100);
  }
}

export async function addTerminal() {
  if (!state.currentAIOfficeProject) return;
  
  const container = document.getElementById('cubicle-terminals');
  const terminalCount = container.children.length;
  const terminalName = `terminal-${terminalCount + 1}`;
  const sessionName = `ai-office-${state.currentAIOfficeProject.id}-${terminalName}`;
  
  // Use the new createTerminalUI function
  await createTerminalUI(sessionName, state.currentAIOfficeProject, false);
}

// Connect to an existing terminal session
async function connectToExistingTerminal(project, sessionName) {
  const container = document.getElementById(`terminal-grid-${sessionName}`);
  if (!container) {
    console.error('Container not found for terminal:', sessionName);
    return;
  }
  
  const settings = getTerminalSettings();
  const terminalOptions = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    theme: settings.theme,
    scrollback: settings.scrollback,
    rightClickSelectsWord: false
  };
  
  const { terminal: term, fitAddon } = TerminalFactory.createGridTerminal(container, terminalOptions);
  
  // Setup proper mouse wheel scrolling
  setupCubicleMouseWheel(term);
  
  // Connect to existing session via WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
  
  ws.onopen = () => {
    term.write('\r\n*** Connected to existing session ***\r\n');
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
}

function initProjectTerminal(project, sessionName) {
  const container = document.getElementById(`terminal-grid-${sessionName}`);
  
  const settings = getTerminalSettings();
  const terminalOptions = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    theme: settings.theme,
    scrollback: settings.scrollback,
    rightClickSelectsWord: false
  };
  
  const { terminal: term, fitAddon } = TerminalFactory.createGridTerminal(container, terminalOptions);
  
  // Setup proper mouse wheel scrolling for project terminal
  setupCubicleMouseWheel(term);
  
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
    
    // Initialize vertical resize functionality for project terminal
    setTimeout(() => {
      initializeCubicleResize(container, sessionName);
    }, 100);
    
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
  
  // Don't focus the terminal as it clears the selection
  
  try {
    const text = await navigator.clipboard.readText();
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

export async function sendEscToCubicle(projectId, cubicleIdx) {
  const cubicleKey = `${projectId}-${cubicleIdx}`;
  const ws = state.cubicleWebSockets.get(cubicleKey);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
  // Don't focus the terminal as it clears the selection
  
  try {
    ws.send(JSON.stringify({
      type: 'input',
      data: '\x1b'
    }));
    showToast('ESC sent');
  } catch (e) {
    // Fallback to raw send
    ws.send('\x1b');
    showToast('ESC sent');
  }
}