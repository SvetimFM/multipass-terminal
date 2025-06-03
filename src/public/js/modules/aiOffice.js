// AI Office management functions
import { state, setState } from './state.js';
import { showToast } from './utils.js';
import { loadProjects } from './projects.js';

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
  
  // Create terminals for each cubicle
  project.aiOffice.cubicles.forEach((cubicle, idx) => {
    const termDiv = document.createElement('div');
    termDiv.className = 'bg-gray-800 rounded overflow-hidden flex flex-col';
    termDiv.innerHTML = `
      <div class="bg-gray-700 px-3 py-2 text-sm font-medium flex justify-between items-center">
        <span>${cubicle.name}</span>
        <button onclick="window.aiOffice.removeCubicle('${project.id}', ${idx})" class="text-red-400 hover:text-red-300 text-xs">✕</button>
      </div>
      <div id="cubicle-grid-terminal-${projectId}-${idx}" class="cubicle-terminal flex-1"></div>
    `;
    container.appendChild(termDiv);
    
    setTimeout(() => initCubicleTerminal(project, cubicle, idx, true), 100 * idx);
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

export function initCubicleTerminal(project, cubicle, idx, isGrid = false) {
  const terminalId = isGrid ? `cubicle-grid-terminal-${project.id}-${idx}` : `cubicle-terminal-${idx}`;
  const container = document.getElementById(terminalId);
  
  if (!container) return;
  
  // Clear existing content
  container.innerHTML = '';
  
  const term = new Terminal({
    cursorBlink: true,
    fontSize: isGrid ? 12 : 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1a1a1a',
      foreground: '#d4d4d4'
    }
  });
  
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  
  // Store terminal
  state.cubicleTerminals.set(`${project.id}-${idx}`, { term, fitAddon });
  
  // Connect WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${cubicle.name}`);
  
  ws.onopen = () => {
    console.log(`Connected to cubicle ${cubicle.name}`);
    fitAddon.fit();
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
      ws.send(data);
    }
  });
  
  // Store WebSocket
  state.cubicleWebSockets.set(`${project.id}-${idx}`, ws);
  
  // Handle resize for grid view
  if (isGrid) {
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
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