// Multiproject view management
import { state, setState } from './state.js';
import { showToast } from './utils.js';
import { splitPaneManager } from './splitPane.js';
import * as aiOffice from './aiOffice.js';
import { makeResizable } from './terminalResize.js';
import { getTerminalSettings } from './terminalSettings.js';
import { TerminalFactory } from '../terminalFactory.js';
import { loadProjects } from './projects.js';

// Multiproject state
let rootPane = null;
const projectPanes = new Map(); // Map pane ID to project data
const savedConfigs = new Map(); // Saved multiproject configurations

// Helper function to check if a pane can be closed
function canClosePane(paneId) {
  // Can't close the root pane
  if (!rootPane || rootPane.id === paneId) return false;
  
  // Otherwise, any child pane can be closed
  return true;
}

// Initialize multiproject view
export function initializeMultiproject() {
  const container = document.getElementById('multiproject-view');
  if (!container) {
    console.error('Multiproject container not found');
    return;
  }
  
  // Create root pane
  rootPane = splitPaneManager.createRootPane(container.querySelector('#multiproject-panes'));
  
  // Set initial content
  rootPane.setContent(createWelcomeContent());
  
  // Listen for pane content moved events
  window.addEventListener('pane-content-moved', handlePaneContentMoved);
  
  // Listen for pane resize events
  window.addEventListener('pane-resized', handlePaneResized);
}

// Handle pane content moved event (when panes are removed)
function handlePaneContentMoved(event) {
  const { paneId, oldPaneId } = event.detail;
  
  // Check if the old pane had a project loaded
  const project = projectPanes.get(oldPaneId);
  if (project) {
    // Clean up old pane data
    cleanupPaneTerminals(oldPaneId, project);
    projectPanes.delete(oldPaneId);
    
    // Re-create the content in the new pane
    projectPanes.set(paneId, project);
    createPaneAIOffice(paneId, project).then(content => {
      splitPaneManager.setPaneContent(paneId, content);
      
      // Re-initialize terminals after DOM update
      setTimeout(() => {
        initializePaneTerminals(paneId, project);
        // Generate buttons for this pane
        generatePaneButtons(paneId, project);
      }, 100);
    });
  } else {
    // No project was loaded, show project selector
    splitPaneManager.setPaneContent(paneId, createProjectSelector(paneId));
  }
}

// Debounced auto-save for resize events
let resizeSaveTimeout = null;
function debouncedAutoSave() {
  if (resizeSaveTimeout) {
    clearTimeout(resizeSaveTimeout);
  }
  resizeSaveTimeout = setTimeout(autoSaveConfiguration, 1000);
}

// Handle pane resize event
function handlePaneResized(event) {
  const { paneId } = event.detail;
  const project = projectPanes.get(paneId);
  
  if (project) {
    // Resize all terminals in this pane
    for (let idx = 0; idx < project.aiOffice.cubicles.length; idx++) {
      const terminalKey = `pane-${paneId}-${project.id}-${idx}`;
      const cubicleData = state.cubicleTerminals.get(terminalKey);
      const ws = state.cubicleWebSockets.get(terminalKey);
      
      if (cubicleData && cubicleData.fitAddon) {
        // Fit terminal to new size
        cubicleData.fitAddon.fit();
        
        // Send resize message to server
        if (ws && ws.readyState === WebSocket.OPEN) {
          const dimensions = cubicleData.fitAddon.proposeDimensions();
          if (dimensions) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: dimensions.cols,
              rows: dimensions.rows
            }));
          }
        }
      }
    }
  }
  
  // Debounced auto-save after resize
  debouncedAutoSave();
}

// Create welcome content for empty pane
function createWelcomeContent(paneId = null) {
  const canSplitVertical = rootPane ? splitPaneManager.canSplitPaneVertical(rootPane.id, 4) : true;
  const canClose = paneId ? canClosePane(paneId) : false;
  
  const div = document.createElement('div');
  div.className = 'pane-welcome';
  div.innerHTML = `
    <div class="text-center p-8 relative">
      ${canClose ? `
      <button onclick="window.multiproject.closePaneSelector('${paneId}')" 
              class="absolute top-2 right-2 text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-700 transition-colors"
              title="Close pane">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
      ` : ''}
      <h3 class="text-xl font-semibold mb-4 text-gray-300">Multiproject Workspace</h3>
      <p class="text-gray-400 mb-2">Split this pane to work with multiple projects simultaneously</p>
      <p class="text-xs text-gray-500 mb-6">Up to 4 projects can be displayed side-by-side</p>
      <div class="flex justify-center gap-4">
        ${canSplitVertical ? `
        <button onclick="window.multiproject.splitPaneVertical('${rootPane.id}')" 
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
          <svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h2m6-14h2a2 2 0 012 2v10a2 2 0 01-2 2h-2m-6-14v14"></path>
          </svg>
          Split Vertical
        </button>
        ` : ''}
        <button onclick="window.multiproject.splitPaneHorizontal('${rootPane.id}')" 
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
          <svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 9V7a2 2 0 012-2h10a2 2 0 012 2v2M5 15v2a2 2 0 002 2h10a2 2 0 002-2v-2m-14-6h14"></path>
          </svg>
          Split Horizontal
        </button>
      </div>
    </div>
  `;
  return div;
}

// Create project selector content
function createProjectSelector(paneId) {
  const canSplitVertical = splitPaneManager.canSplitPaneVertical(paneId, 4);
  const verticalPaneCount = rootPane ? splitPaneManager.getVerticalPaneCount(rootPane) : 0;
  const canClose = canClosePane(paneId);
  
  const div = document.createElement('div');
  div.className = 'pane-project-selector';
  div.innerHTML = `
    <div class="p-4 relative">
      ${canClose ? `
      <button onclick="window.multiproject.closePaneSelector('${paneId}')" 
              class="absolute top-2 right-2 text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-700 transition-colors"
              title="Close pane">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
      ` : ''}
      <h3 class="text-lg font-semibold mb-3">Select Project</h3>
      <p class="text-xs text-gray-400 mb-2">Projects in view: ${verticalPaneCount}</p>
      <select id="project-select-${paneId}" class="w-full bg-gray-800 p-2 rounded mb-4">
        <option value="">Choose a project...</option>
      </select>
      <div class="flex gap-2">
        <button onclick="window.multiproject.loadProjectInPane('${paneId}')" 
                class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors">
          Load Project
        </button>
        ${canSplitVertical ? `
        <button onclick="window.multiproject.splitPaneVertical('${paneId}')" 
                class="px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                title="Split Vertical">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h2m6-14h2a2 2 0 012 2v10a2 2 0 01-2 2h-2m-6-14v14"></path>
          </svg>
        </button>
        ` : `
        <button class="px-3 py-2 bg-gray-500 opacity-50 cursor-not-allowed rounded"
                title="Maximum 4 projects reached" disabled>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h2m6-14h2a2 2 0 012 2v10a2 2 0 01-2 2h-2m-6-14v14"></path>
          </svg>
        </button>
        `}
        <button onclick="window.multiproject.splitPaneHorizontal('${paneId}')" 
                class="px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                title="Split Horizontal">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 9V7a2 2 0 012-2h10a2 2 0 012 2v2M5 15v2a2 2 0 002 2h10a2 2 0 002-2v-2m-14-6h14"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  // Load projects into selector
  setTimeout(() => {
    populateProjectSelector(`project-select-${paneId}`);
  }, 0);
  
  return div;
}

// Populate project selector with available projects
async function populateProjectSelector(selectId) {
  try {
    const response = await fetch('/api/projects');
    const data = await response.json();
    const select = document.getElementById(selectId);
    
    if (!select) return;
    
    // Clear existing options except the first
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    // Add projects with AI Office
    data.projects.forEach(project => {
      if (project.aiOffice) {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = `${project.name} (${project.aiOffice.cubicleCount} cubicles)`;
        select.appendChild(option);
      }
    });
  } catch (error) {
    console.error('Error loading projects:', error);
    showToast('Failed to load projects');
  }
}

// Split pane vertically
export function splitPaneVertical(paneId) {
  // Check if we can split vertically (max 4 projects)
  if (!splitPaneManager.canSplitPaneVertical(paneId, 4)) {
    showToast('Maximum 4 projects allowed in vertical layout');
    return;
  }
  
  // Check if the current pane has a project loaded
  const existingProject = projectPanes.get(paneId);
  
  const children = splitPaneManager.splitPane(paneId, splitPaneManager.SPLIT_TYPE.VERTICAL);
  if (children) {
    if (existingProject) {
      // Preserve existing project in first child
      projectPanes.set(children[0].id, existingProject);
      projectPanes.delete(paneId); // Remove old pane association
      
      // Recreate the project content in first child
      createPaneAIOffice(children[0].id, existingProject).then(content => {
        splitPaneManager.setPaneContent(children[0].id, content);
        setTimeout(() => {
          initializePaneTerminals(children[0].id, existingProject);
          generatePaneButtons(children[0].id, existingProject);
        }, 100);
      });
      
      // Show project selector only in second child
      splitPaneManager.setPaneContent(children[1].id, createProjectSelector(children[1].id));
    } else {
      // No existing project, show selectors in both
      children.forEach(child => {
        splitPaneManager.setPaneContent(child.id, createProjectSelector(child.id));
      });
    }
    
    // Auto-save after split
    setTimeout(autoSaveConfiguration, 200);
  }
}

// Split pane horizontally
export function splitPaneHorizontal(paneId) {
  // Check if the current pane has a project loaded
  const existingProject = projectPanes.get(paneId);
  
  const children = splitPaneManager.splitPane(paneId, splitPaneManager.SPLIT_TYPE.HORIZONTAL);
  if (children) {
    if (existingProject) {
      // Preserve existing project in first child
      projectPanes.set(children[0].id, existingProject);
      projectPanes.delete(paneId); // Remove old pane association
      
      // Recreate the project content in first child
      createPaneAIOffice(children[0].id, existingProject).then(content => {
        splitPaneManager.setPaneContent(children[0].id, content);
        setTimeout(() => {
          initializePaneTerminals(children[0].id, existingProject);
          generatePaneButtons(children[0].id, existingProject);
        }, 100);
      });
      
      // Show project selector only in second child
      splitPaneManager.setPaneContent(children[1].id, createProjectSelector(children[1].id));
    } else {
      // No existing project, show selectors in both
      children.forEach(child => {
        splitPaneManager.setPaneContent(child.id, createProjectSelector(child.id));
      });
    }
    
    // Auto-save after split
    setTimeout(autoSaveConfiguration, 200);
  }
}

// Load project in a specific pane
export async function loadProjectInPane(paneId) {
  const select = document.getElementById(`project-select-${paneId}`);
  if (!select || !select.value) {
    showToast('Please select a project');
    return;
  }
  
  const projectId = select.value;
  
  try {
    // Fetch project details
    const response = await fetch('/api/projects');
    const data = await response.json();
    const project = data.projects.find(p => p.id === projectId);
    
    if (!project || !project.aiOffice) {
      showToast('Project not found or has no AI Office');
      return;
    }
    
    // Store project-pane association
    projectPanes.set(paneId, project);
    
    // Create AI Office view for this pane
    const aiOfficeContent = await createPaneAIOffice(paneId, project);
    splitPaneManager.setPaneContent(paneId, aiOfficeContent);
    
    // Initialize terminals after DOM update
    setTimeout(() => {
      initializePaneTerminals(paneId, project);
      // Generate buttons for this pane
      generatePaneButtons(paneId, project);
      // Auto-save the configuration
      autoSaveConfiguration();
    }, 100);
    
  } catch (error) {
    console.error('Error loading project:', error);
    showToast('Failed to load project');
  }
}

// Create AI Office content for a pane
async function createPaneAIOffice(paneId, project) {
  const canSplitVertical = splitPaneManager.canSplitPaneVertical(paneId, 4);
  const verticalPaneCount = rootPane ? splitPaneManager.getVerticalPaneCount(rootPane) : 0;
  
  const div = document.createElement('div');
  div.className = 'pane-ai-office';
  div.innerHTML = `
    <div class="h-full flex flex-col">
      <div class="bg-gray-800 p-2 border-b border-gray-700 flex-shrink-0">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-sm">${project.name}</span>
            <span class="text-xs text-gray-400">(${project.aiOffice.cubicleCount} cubicles)</span>
            ${!canSplitVertical ? `<span class="text-xs text-yellow-400">[${verticalPaneCount}/4 projects]</span>` : ''}
          </div>
          <div class="flex gap-1">
            ${canSplitVertical ? `
            <button onclick="window.multiproject.splitPaneVertical('${paneId}')" 
                    class="text-gray-400 hover:text-blue-400 p-1 rounded hover:bg-gray-700 transition-colors"
                    title="Split vertical - Add another project side by side">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h2m6-14h2a2 2 0 012 2v10a2 2 0 01-2 2h-2m-6-14v14"></path>
              </svg>
            </button>
            ` : `
            <button class="text-gray-600 p-1 rounded cursor-not-allowed opacity-50"
                    title="Maximum 4 projects reached" disabled>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h2m6-14h2a2 2 0 012 2v10a2 2 0 01-2 2h-2m-6-14v14"></path>
              </svg>
            </button>
            `}
            <button onclick="window.multiproject.splitPaneHorizontal('${paneId}')" 
                    class="text-gray-400 hover:text-blue-400 p-1 rounded hover:bg-gray-700 transition-colors"
                    title="Split horizontal - Add another project above/below">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 9V7a2 2 0 012-2h10a2 2 0 012 2v2M5 15v2a2 2 0 002 2h10a2 2 0 002-2v-2m-14-6h14"></path>
              </svg>
            </button>
            <div class="w-px h-4 bg-gray-600"></div>
            <button onclick="window.multiproject.closePane('${paneId}')" 
                    class="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-700 transition-colors"
                    title="Close pane">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Project-specific button bar -->
        <div id="pane-buttons-${paneId}" class="flex gap-2 mt-2 px-2 overflow-x-auto">
          <!-- Buttons will be generated here -->
        </div>
      </div>
      
      <div class="flex-1 overflow-hidden">
        <div id="pane-terminals-${paneId}" class="h-full overflow-y-auto p-2">
          <!-- Terminals will be loaded here in vertical stack -->
        </div>
      </div>
    </div>
  `;
  
  return div;
}

// Initialize terminals for a pane
async function initializePaneTerminals(paneId, project) {
  const container = document.getElementById(`pane-terminals-${paneId}`);
  if (!container) return;
  
  // Clear existing content
  container.innerHTML = '';
  
  // First, fetch all sessions to find regular terminals for this project
  try {
    const response = await fetch('/api/sessions');
    const data = await response.json();
    
    // Filter for non-cubicle sessions belonging to this project
    const regularSessions = data.sessions.filter(session => 
      session.projectId === project.id && !session.isCubicle
    );
    
    // Create terminals for regular sessions
    for (const session of regularSessions) {
      const terminalId = `pane-${paneId}-session-${session.name}`;
      const terminalKey = `pane-${paneId}-session-${session.name}`;
      
      // Create wrapper div for the terminal with resize functionality
      const wrapperDiv = document.createElement('div');
      wrapperDiv.style.position = 'relative';
      wrapperDiv.style.marginBottom = '12px';
      
      // Create the actual container that will be resized
      const resizableContainer = document.createElement('div');
      resizableContainer.className = 'resizable-terminal-container';
      resizableContainer.style.position = 'relative';
      resizableContainer.style.height = '400px';
      resizableContainer.style.minHeight = '200px';
      
      const termDiv = document.createElement('div');
      termDiv.className = 'bg-gray-900 rounded border border-gray-700 overflow-hidden h-full flex flex-col';
      termDiv.innerHTML = `
        <div class="bg-gray-800 px-2 py-1 border-b border-gray-700 flex-shrink-0">
          <div class="flex justify-between items-center">
            <span class="text-xs font-medium">📺 ${session.name}</span>
            <div class="flex gap-1">
              <button onclick="window.multiproject.sendEscToPaneSession('${paneId}', '${session.name}')" 
                      class="text-gray-400 hover:text-orange-400 p-1 rounded hover:bg-gray-700 transition-colors" 
                      title="Send ESC key">
                <span class="text-xs font-bold">ESC</span>
              </button>
              <button onclick="window.multiproject.pasteToPaneSession('${paneId}', '${session.name}')" 
                      class="text-gray-400 hover:text-green-400 p-1 rounded hover:bg-gray-700 transition-colors" 
                      title="Paste">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div id="${terminalId}" class="pane-terminal flex-1 overflow-hidden h-full"></div>
      `;
      
      resizableContainer.appendChild(termDiv);
      wrapperDiv.appendChild(resizableContainer);
      container.appendChild(wrapperDiv);
      
      // Initialize terminal connection
      await new Promise(resolve => setTimeout(resolve, 50));
      await initializeSessionTerminal(terminalId, terminalKey, session.name);
      
      // Initialize resize functionality
      makeResizable(resizableContainer, terminalKey, {
        onResize: (height) => {
          // Similar resize handling as cubicles
          const terminalData = state.cubicleTerminals.get(terminalKey);
          const ws = state.cubicleWebSockets.get(terminalKey);
          
          if (terminalData && terminalData.fitAddon) {
            setTimeout(() => {
              terminalData.fitAddon.fit();
              
              if (ws && ws.readyState === WebSocket.OPEN) {
                const dimensions = terminalData.fitAddon.proposeDimensions();
                if (dimensions) {
                  ws.send(JSON.stringify({
                    type: 'resize',
                    cols: dimensions.cols,
                    rows: dimensions.rows
                  }));
                }
              }
            }, 10);
          }
        },
        minHeight: 200,
        maxHeight: 800
      });
    }
  } catch (error) {
    console.error('Failed to fetch regular sessions:', error);
  }
  
  // Fetch AI modes for the dropdowns
  let aiModes = { modes: {} };
  try {
    const modesResponse = await fetch('/api/ai-modes');
    aiModes = await modesResponse.json();
  } catch (error) {
    console.error('Failed to fetch AI modes:', error);
  }
  
  // Create mode options HTML
  const modeOptions = Object.entries(aiModes.modes).map(([key, mode]) => 
    `<option value="${key}">${mode.name}</option>`
  ).join('');
  
  // Create terminal for each cubicle
  for (let idx = 0; idx < project.aiOffice.cubicles.length; idx++) {
    const cubicle = project.aiOffice.cubicles[idx];
    const terminalId = `pane-${paneId}-cubicle-${project.id}-${idx}`;
    const terminalKey = `pane-${paneId}-${project.id}-${idx}`;
    const currentMode = cubicle.aiMode || 'default';
    
    // Create wrapper div for the terminal with resize functionality
    const wrapperDiv = document.createElement('div');
    wrapperDiv.style.position = 'relative';
    wrapperDiv.style.marginBottom = '12px';
    
    // Create the actual container that will be resized
    const resizableContainer = document.createElement('div');
    resizableContainer.className = 'resizable-terminal-container';
    resizableContainer.style.position = 'relative';
    resizableContainer.style.height = '400px';
    resizableContainer.style.minHeight = '200px';
    
    const termDiv = document.createElement('div');
    termDiv.className = 'bg-gray-900 rounded border border-gray-700 overflow-hidden h-full flex flex-col';
    termDiv.innerHTML = `
      <div class="bg-gray-800 px-2 py-1 border-b border-gray-700 flex-shrink-0">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium">${cubicle.name}</span>
            <select id="pane-cubicle-mode-${paneId}-${project.id}-${idx}"
                    onchange="window.multiproject.changePaneCubicleMode('${paneId}', '${project.id}', ${idx}, this.value)" 
                    class="bg-gray-700 text-xs px-1 py-0.5 rounded border border-gray-600 hover:border-purple-500 focus:border-purple-500 focus:outline-none cursor-pointer text-purple-400 font-medium"
                    title="AI Mode">
              ${modeOptions}
            </select>
          </div>
          <div class="flex gap-1">
            <button onclick="window.multiproject.sendEscToPaneTerminal('${paneId}', '${project.id}', ${idx})" 
                    class="text-gray-400 hover:text-orange-400 p-1 rounded hover:bg-gray-700 transition-colors" 
                    title="Send ESC key">
              <span class="text-xs font-bold">ESC</span>
            </button>
            <button onclick="window.multiproject.pasteToPaneTerminal('${paneId}', '${project.id}', ${idx})" 
                    class="text-gray-400 hover:text-green-400 p-1 rounded hover:bg-gray-700 transition-colors" 
                    title="Paste">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div id="${terminalId}" class="pane-terminal flex-1 overflow-hidden h-full"></div>
    `;
    
    resizableContainer.appendChild(termDiv);
    wrapperDiv.appendChild(resizableContainer);
    container.appendChild(wrapperDiv);
    
    // Set the current mode in the dropdown
    const selectElement = document.getElementById(`pane-cubicle-mode-${paneId}-${project.id}-${idx}`);
    if (selectElement) {
      selectElement.value = currentMode;
    }
    
    // Initialize terminal with delay to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 50));
    await aiOffice.initCubicleTerminal(project, cubicle, idx, false, terminalId);
    
    // Initialize resize functionality on the resizable container
    makeResizable(resizableContainer, terminalKey, {
      onResize: (height) => {
        // The makeResizable function already updates the container height
        // Trigger terminal fit and send resize to server
        const cubicleData = state.cubicleTerminals.get(terminalKey);
        const ws = state.cubicleWebSockets.get(terminalKey);
        
        if (cubicleData && cubicleData.fitAddon) {
          // Small delay to let DOM update
          setTimeout(() => {
            cubicleData.fitAddon.fit();
            
            // Send resize message to server
            if (ws && ws.readyState === WebSocket.OPEN) {
              const dimensions = cubicleData.fitAddon.proposeDimensions();
              if (dimensions) {
                ws.send(JSON.stringify({
                  type: 'resize',
                  cols: dimensions.cols,
                  rows: dimensions.rows
                }));
              }
            }
          }, 10);
        }
      },
      minHeight: 200,
      maxHeight: 800
    });
  }
}

// Close a pane selector (empty pane)
export function closePaneSelector(paneId) {
  if (!canClosePane(paneId)) {
    showToast('Cannot close the root pane');
    return;
  }
  
  // Remove the pane
  splitPaneManager.removePane(paneId);
  
  // Update UI to reflect new pane count
  setTimeout(() => {
    // Refresh any visible project selectors to update split button states
    const selectors = document.querySelectorAll('.pane-project-selector');
    selectors.forEach(selector => {
      const pane = selector.closest('.split-pane');
      if (pane && pane.id) {
        const currentPaneId = pane.id;
        // Only update if it's showing a project selector (not loaded project)
        if (!projectPanes.has(currentPaneId)) {
          splitPaneManager.setPaneContent(currentPaneId, createProjectSelector(currentPaneId));
        }
      }
    });
    // Auto-save after closing
    autoSaveConfiguration();
  }, 100);
}

// Close a pane
export function closePane(paneId) {
  // Clean up project association
  const project = projectPanes.get(paneId);
  if (project) {
    // Clean up terminals
    cleanupPaneTerminals(paneId, project);
    projectPanes.delete(paneId);
  }
  
  // Remove the pane - this will trigger pane-content-moved event if needed
  splitPaneManager.removePane(paneId);
  
  // Update UI to reflect new pane count
  setTimeout(() => {
    // Refresh any visible project selectors to update split button states
    const selectors = document.querySelectorAll('.pane-project-selector');
    selectors.forEach(selector => {
      const pane = selector.closest('.split-pane');
      if (pane && pane.id) {
        const currentPaneId = pane.id;
        // Only update if it's showing a project selector (not loaded project)
        if (!projectPanes.has(currentPaneId)) {
          splitPaneManager.setPaneContent(currentPaneId, createProjectSelector(currentPaneId));
        }
      }
    });
    // Auto-save after closing
    autoSaveConfiguration();
  }, 100);
}

// Initialize a regular session terminal (not a cubicle)
async function initializeSessionTerminal(terminalId, terminalKey, sessionName) {
  const container = document.getElementById(terminalId);
  if (!container) {
    console.error('Container not found for session terminal:', terminalId);
    return;
  }
  
  // Clear existing content
  container.innerHTML = '';
  
  // Create terminal using TerminalFactory
  const settings = getTerminalSettings();
  const terminalOptions = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    theme: settings.theme,
    scrollback: settings.scrollback,
    rightClickSelectsWord: false
  };
  
  const terminalInstance = TerminalFactory.createTerminalWithContainer(container, terminalOptions);
  const term = terminalInstance.terminal;
  const fitAddon = terminalInstance.fitAddon;
  
  // Store terminal reference
  state.cubicleTerminals.set(terminalKey, { term, fitAddon });
  
  // Connect to WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
  
  ws.onopen = () => {
    console.log(`Connected to session ${sessionName}`);
    fitAddon.fit();
    
    // Send initial resize
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
    console.error(`WebSocket error for session ${sessionName}:`, error);
  };
  
  ws.onclose = () => {
    console.log(`Disconnected from session ${sessionName}`);
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
  
  // Store WebSocket reference
  state.cubicleWebSockets.set(terminalKey, ws);
}

// Clean up terminals when closing a pane
function cleanupPaneTerminals(paneId, project) {
  // Clean up all terminals in this pane (both session and cubicle terminals)
  // Iterate through all WebSocket connections and find ones for this pane
  state.cubicleWebSockets.forEach((ws, terminalKey) => {
    if (terminalKey.startsWith(`pane-${paneId}-`)) {
      // Close WebSocket
      ws.close();
      state.cubicleWebSockets.delete(terminalKey);
      
      // Also clean up the terminal instance
      const termData = state.cubicleTerminals.get(terminalKey);
      if (termData && termData.term) {
        termData.term.dispose();
        state.cubicleTerminals.delete(terminalKey);
      }
    }
  });
}

// Send ESC key to a specific terminal in a pane
export function sendEscToPaneTerminal(paneId, projectId, cubicleIdx) {
  const terminalKey = `pane-${paneId}-${projectId}-${cubicleIdx}`;
  const ws = state.cubicleWebSockets.get(terminalKey);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
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

// Paste to a specific terminal in a pane
export async function pasteToPaneTerminal(paneId, projectId, cubicleIdx) {
  const terminalKey = `pane-${paneId}-${projectId}-${cubicleIdx}`;
  const ws = state.cubicleWebSockets.get(terminalKey);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
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
    showToast('Unable to paste - check clipboard permissions');
  }
}

// Send ESC to a pane session terminal
export function sendEscToPaneSession(paneId, sessionName) {
  const terminalKey = `pane-${paneId}-session-${sessionName}`;
  const ws = state.cubicleWebSockets.get(terminalKey);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
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

// Paste to a session terminal in a pane
export async function pasteToPaneSession(paneId, sessionName) {
  const terminalKey = `pane-${paneId}-session-${sessionName}`;
  const ws = state.cubicleWebSockets.get(terminalKey);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Terminal not connected');
    return;
  }
  
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
    showToast('Unable to paste - check clipboard permissions');
  }
}

// Change cubicle mode from multiproject view
export async function changePaneCubicleMode(paneId, projectId, cubicleIdx, newMode) {
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
      // Update the local project data in the pane
      const project = projectPanes.get(paneId);
      if (project && project.aiOffice.cubicles[cubicleIdx]) {
        project.aiOffice.cubicles[cubicleIdx].aiMode = newMode;
      }
      showToast(`Mode changed to ${modeName}`);
      
      // Also update the select element to reflect the change
      const selectElement = document.querySelector(`#pane-cubicle-mode-${paneId}-${projectId}-${cubicleIdx}`);
      if (selectElement) {
        selectElement.value = newMode;
      }
    } else {
      const error = await response.json();
      alert('Failed to change mode: ' + error.error);
      // Reset dropdown to previous value
      const project = projectPanes.get(paneId);
      if (project && project.aiOffice.cubicles[cubicleIdx]) {
        const previousMode = project.aiOffice.cubicles[cubicleIdx].aiMode || 'default';
        const selectElement = document.querySelector(`#pane-cubicle-mode-${paneId}-${projectId}-${cubicleIdx}`);
        if (selectElement) {
          selectElement.value = previousMode;
        }
      }
    }
  } catch (error) {
    console.error('Error changing cubicle mode:', error);
    alert('Error changing mode: ' + error.message);
  }
}

// Show multiproject view
export async function showMultiproject() {
  // Hide other views
  document.getElementById('projects-view').classList.add('hidden');
  document.getElementById('sessions-view').classList.add('hidden');
  document.getElementById('terminal-view').classList.add('hidden');
  document.getElementById('ai-office-grid').classList.add('hidden');
  
  // Refresh project configurations to ensure we don't show deleted cubicles/terminals
  await loadProjects();
  
  // Show multiproject view
  const multiprojectView = document.getElementById('multiproject-view');
  if (multiprojectView) {
    multiprojectView.classList.remove('hidden');
    
    // Initialize if not already done, or restore from autosave
    if (!rootPane) {
      // Check for autosaved configuration
      const autosave = sessionStorage.getItem('multiproject-autosave');
      if (autosave) {
        try {
          const config = JSON.parse(autosave);
          // Initialize and restore configuration
          initializeMultiproject();
          // Use a slightly modified load that doesn't show toast
          restoreAutosavedConfiguration(config);
          return; // Configuration restored, no need for manual initialization
        } catch (e) {
          console.error('Failed to restore autosaved configuration:', e);
          // Fall through to normal initialization
        }
      }
      
      // Normal initialization if no autosave or restore failed
      initializeMultiproject();
    }
    
    // Reconnect terminals for all active panes
    setTimeout(() => {
      projectPanes.forEach((project, paneId) => {
        // Check if the pane still exists in DOM
        const paneElement = document.getElementById(paneId);
        if (paneElement && project) {
          // Reinitialize terminals for this pane
          initializePaneTerminals(paneId, project);
        }
      });
      
      // Trigger resize event for terminal fitting after terminals are reconnected
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 200);
    }, 100);
  }
}

// Hide multiproject view
export function hideMultiproject() {
  const multiprojectView = document.getElementById('multiproject-view');
  if (multiprojectView) {
    multiprojectView.classList.add('hidden');
  }
}

// Save current multiproject configuration
export function saveConfiguration(name) {
  if (!rootPane) {
    showToast('No multiproject view to save');
    return;
  }
  
  if (!name) {
    name = `Config ${new Date().toLocaleString()}`;
  }
  
  // Build configuration object
  const config = buildConfigurationObject(name);
  
  // Save to localStorage
  const configs = JSON.parse(localStorage.getItem('multiproject-configs') || '{}');
  configs[name] = config;
  localStorage.setItem('multiproject-configs', JSON.stringify(configs));
  
  showToast(`Configuration "${name}" saved`);
  return config;
}

// Build configuration object (extracted for reuse)
function buildConfigurationObject(name = 'autosave') {
  const config = {
    name,
    timestamp: Date.now(),
    paneStructure: serializePaneStructure(rootPane),
    projects: {}
  };
  
  // Save project associations
  projectPanes.forEach((project, paneId) => {
    config.projects[paneId] = {
      id: project.id,
      name: project.name,
      path: project.path
    };
  });
  
  return config;
}

// Auto-save current configuration to session storage
function autoSaveConfiguration() {
  if (!rootPane) return;
  
  try {
    const config = buildConfigurationObject('autosave');
    sessionStorage.setItem('multiproject-autosave', JSON.stringify(config));
  } catch (e) {
    console.error('Failed to auto-save multiproject configuration:', e);
  }
}

// Serialize pane structure recursively
function serializePaneStructure(pane) {
  const structure = {
    id: pane.id,
    splitType: pane.splitType,
    size: pane.size
  };
  
  if (pane.children && pane.children.length > 0) {
    structure.children = pane.children.map(child => serializePaneStructure(child));
  }
  
  return structure;
}

// Load a saved configuration
export async function loadConfiguration(name) {
  const configs = JSON.parse(localStorage.getItem('multiproject-configs') || '{}');
  const config = configs[name];
  
  if (!config) {
    showToast('Configuration not found');
    return;
  }
  
  // Clear current view
  if (rootPane) {
    const container = document.getElementById('multiproject-panes');
    container.innerHTML = '';
    projectPanes.clear();
  }
  
  // Recreate pane structure
  rootPane = splitPaneManager.createRootPane(document.querySelector('#multiproject-panes'));
  await recreatePaneStructure(rootPane, config.paneStructure, config.projects);
  
  // Close the layouts panel after loading
  document.getElementById('multiproject-layouts-panel').classList.add('hidden');
  
  showToast(`Configuration "${name}" loaded`);
}

// Restore autosaved configuration (silent version of loadConfiguration)
async function restoreAutosavedConfiguration(config) {
  // Clear current view
  if (rootPane) {
    const container = document.getElementById('multiproject-panes');
    container.innerHTML = '';
    projectPanes.clear();
  }
  
  // Refresh project configurations before restoring
  await loadProjects();
  
  // Recreate pane structure
  rootPane = splitPaneManager.createRootPane(document.querySelector('#multiproject-panes'));
  await recreatePaneStructure(rootPane, config.paneStructure, config.projects);
}

// Recreate pane structure from saved configuration
async function recreatePaneStructure(pane, structure, projects) {
  if (structure.children && structure.children.length > 0) {
    // This pane should be split
    const children = splitPaneManager.splitPane(pane.id, structure.splitType);
    if (children) {
      // Restore child sizes
      children[0].size = structure.children[0].size;
      children[1].size = structure.children[1].size;
      pane.updateLayout();
      
      // Recursively recreate children
      await recreatePaneStructure(children[0], structure.children[0], projects);
      await recreatePaneStructure(children[1], structure.children[1], projects);
    }
  } else {
    // This is a leaf pane - check if it had a project
    const projectInfo = projects[structure.id];
    if (projectInfo) {
      // Try to load the project
      try {
        const response = await fetch('/api/projects');
        const data = await response.json();
        const project = data.projects.find(p => p.id === projectInfo.id);
        
        if (project && project.aiOffice) {
          projectPanes.set(pane.id, project);
          const aiOfficeContent = await createPaneAIOffice(pane.id, project);
          splitPaneManager.setPaneContent(pane.id, aiOfficeContent);
          
          setTimeout(() => {
            initializePaneTerminals(pane.id, project);
            // Generate buttons for this pane
            generatePaneButtons(pane.id, project);
          }, 100);
        } else {
          // Project not found, show selector
          splitPaneManager.setPaneContent(pane.id, createProjectSelector(pane.id));
        }
      } catch (error) {
        console.error('Error loading project:', error);
        splitPaneManager.setPaneContent(pane.id, createProjectSelector(pane.id));
      }
    } else {
      // No project was loaded in this pane
      splitPaneManager.setPaneContent(pane.id, createProjectSelector(pane.id));
    }
  }
}

// Get list of saved configurations
export function getSavedConfigurations() {
  const configs = JSON.parse(localStorage.getItem('multiproject-configs') || '{}');
  return Object.values(configs).sort((a, b) => b.timestamp - a.timestamp);
}

// Delete a saved configuration
export function deleteConfiguration(name) {
  const configs = JSON.parse(localStorage.getItem('multiproject-configs') || '{}');
  delete configs[name];
  localStorage.setItem('multiproject-configs', JSON.stringify(configs));
  showToast(`Configuration "${name}" deleted`);
}

// Generate buttons for a specific project pane
function generatePaneButtons(paneId, project) {
  const container = document.getElementById(`pane-buttons-${paneId}`);
  if (!container) return;
  
  // Clear existing buttons
  container.innerHTML = '';
  
  // Get button configuration from state
  const buttonConfig = state.buttonConfig;
  if (!buttonConfig) return;
  
  // Add AI buttons
  if (buttonConfig.ai?.start) {
    const startButton = document.createElement('button');
    startButton.onclick = () => broadcastToPaneTerminals(paneId, project, (buttonConfig.ai.start.command || state.llmConfig?.command || 'claude') + '\n');
    startButton.className = 'px-2 py-1 bg-blue-600 rounded text-xs font-semibold';
    startButton.title = buttonConfig.ai.start.title || 'Start AI Assistant';
    startButton.textContent = buttonConfig.ai.start.label;
    container.appendChild(startButton);
  }
  
  if (buttonConfig.ai?.exit) {
    const exitButton = document.createElement('button');
    exitButton.onclick = () => {
      // Get exit sequence from button config or LLM config
      const exitSequence = buttonConfig.ai.exit.exitSequence || state.llmConfig?.exitSequence || '\x03\x03';
      const delay = state.llmConfig?.exitDelay || 50;
      
      // Handle exit sequence - if it contains multiple Ctrl+C, split and send with delay
      if (exitSequence === '\x03\x03') {
        broadcastToPaneTerminals(paneId, project, '\x03');
        setTimeout(() => broadcastToPaneTerminals(paneId, project, '\x03'), delay);
      } else {
        broadcastToPaneTerminals(paneId, project, exitSequence);
      }
    };
    exitButton.className = 'px-2 py-1 bg-red-600 rounded text-xs font-semibold';
    exitButton.title = buttonConfig.ai.exit.title || 'Exit AI Assistant';
    exitButton.textContent = buttonConfig.ai.exit.label;
    container.appendChild(exitButton);
  }
  
  // Add separator
  if (buttonConfig.ai && buttonConfig.quickCommands?.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'w-px h-4 bg-gray-600';
    container.appendChild(separator);
  }
  
  // Add utility buttons (like Shift+Tab)
  if (buttonConfig.utilityButtons) {
    // Add Shift+Tab button if configured
    if (buttonConfig.utilityButtons.shiftTab) {
      const shiftTabBtn = buttonConfig.utilityButtons.shiftTab;
      const button = document.createElement('button');
      button.onclick = () => {
        // Ensure the command doesn't have a newline (Shift+Tab is a key sequence, not a command)
        const command = shiftTabBtn.command || '\x1b[Z';
        broadcastToPaneTerminals(paneId, project, command);
      };
      button.className = `px-2 py-1 ${shiftTabBtn.className || 'bg-purple-600'} rounded text-xs`;
      button.title = shiftTabBtn.title || 'Send Shift+Tab';
      button.textContent = shiftTabBtn.label;
      container.appendChild(button);
    }
  }
  
  // Add another separator if we have utility buttons and quick commands
  if (buttonConfig.utilityButtons && buttonConfig.quickCommands?.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'w-px h-4 bg-gray-600';
    container.appendChild(separator);
  }
  
  // Add quick command buttons
  if (buttonConfig.quickCommands && Array.isArray(buttonConfig.quickCommands)) {
    buttonConfig.quickCommands.forEach(btnConfig => {
      const button = document.createElement('button');
      button.onclick = () => broadcastToPaneTerminals(paneId, project, btnConfig.command);
      button.className = `px-2 py-1 ${btnConfig.className || 'bg-gray-600'} rounded text-xs`;
      button.title = btnConfig.title || '';
      button.textContent = btnConfig.label;
      container.appendChild(button);
    });
  }
}

// Broadcast command to all terminals in a specific pane
function broadcastToPaneTerminals(paneId, project, command) {
  let terminalCount = 0;
  let debugInfo = [];
  
  // Send to all cubicle terminals in this project
  for (let idx = 0; idx < project.aiOffice.cubicles.length; idx++) {
    const terminalKey = `pane-${paneId}-${project.id}-${idx}`;
    const ws = state.cubicleWebSockets.get(terminalKey);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'input',
          data: command
        }));
        terminalCount++;
      } catch (e) {
        ws.send(command);
        terminalCount++;
      }
    } else {
      debugInfo.push(`Terminal ${idx}: ${ws ? 'Not ready' : 'Not found'} (key: ${terminalKey})`);
    }
  }
  
  if (terminalCount > 0) {
    showToast(`Command sent to ${terminalCount} terminals in ${project.name}`);
  } else {
    console.warn('No connected terminals found:', debugInfo);
    console.warn('Available WebSocket keys:', Array.from(state.cubicleWebSockets.keys()));
    showToast('No connected terminals found - check console for details');
  }
}


// Show save configuration dialog
export function showSaveConfigDialog() {
  const name = prompt('Enter a name for this layout:', `Layout ${new Date().toLocaleDateString()}`);
  if (name) {
    saveConfiguration(name);
    // Refresh the layouts panel if it's open
    if (!document.getElementById('multiproject-layouts-panel').classList.contains('hidden')) {
      refreshLayoutsPanel();
    }
  }
}

// Toggle layouts panel
export function toggleLayoutsPanel() {
  const panel = document.getElementById('multiproject-layouts-panel');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    refreshLayoutsPanel();
  } else {
    panel.classList.add('hidden');
  }
}

// Refresh the layouts panel with current saved layouts
function refreshLayoutsPanel() {
  const container = document.getElementById('saved-layouts-list');
  if (!container) return;
  
  const configs = getSavedConfigurations();
  container.innerHTML = '';
  
  if (configs.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No saved layouts yet</p>';
    return;
  }
  
  configs.forEach(config => {
    const layoutCard = document.createElement('div');
    layoutCard.className = 'bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors';
    
    const date = new Date(config.timestamp);
    const projectCount = Object.keys(config.projects || {}).length;
    
    // Escape the config name for safe use in attributes
    const escapedName = config.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    
    layoutCard.innerHTML = `
      <div class="mb-2">
        <h4 class="font-semibold text-sm">${config.name}</h4>
        <p class="text-xs text-gray-400">
          ${projectCount} project${projectCount !== 1 ? 's' : ''} • ${date.toLocaleDateString()} ${date.toLocaleTimeString()}
        </p>
      </div>
      <div class="flex gap-2">
        <button data-config-name="${escapedName}" 
                class="load-config-btn flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors">
          Load
        </button>
        <button data-config-name="${escapedName}" 
                class="delete-config-btn px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
      </div>
    `;
    
    // Add event listeners to the buttons
    const loadBtn = layoutCard.querySelector('.load-config-btn');
    const deleteBtn = layoutCard.querySelector('.delete-config-btn');
    
    loadBtn.addEventListener('click', () => {
      loadConfiguration(config.name);
    });
    
    deleteBtn.addEventListener('click', () => {
      confirmDeleteConfiguration(config.name);
    });
    
    container.appendChild(layoutCard);
  });
}

// Confirm before deleting a configuration
export function confirmDeleteConfiguration(name) {
  if (confirm(`Delete layout "${name}"?`)) {
    deleteConfiguration(name);
    refreshLayoutsPanel();
  }
}

// Export for window object
export const multiprojectManager = {
  initializeMultiproject,
  showMultiproject,
  hideMultiproject,
  splitPaneVertical,
  splitPaneHorizontal,
  loadProjectInPane,
  closePane,
  closePaneSelector,
  sendEscToPaneTerminal,
  pasteToPaneTerminal,
  sendEscToPaneSession,
  pasteToPaneSession,
  saveConfiguration,
  loadConfiguration,
  getSavedConfigurations,
  deleteConfiguration,
  showSaveConfigDialog,
  toggleLayoutsPanel,
  confirmDeleteConfiguration,
  changePaneCubicleMode
};