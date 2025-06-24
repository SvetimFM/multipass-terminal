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
import { terminalSettings, initializeFontSizeControls } from './modules/terminalSettings.js';
import { terminalResize } from './modules/terminalResize.js';
import { settings } from './modules/settings.js';

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
window.terminalSettings = terminalSettings;
window.terminalResize = terminalResize;
window.settings = settings;

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Ship Anywhere app...');
  
  // Initialize terminal settings
  initializeFontSizeControls();
  settings.initializeSettings();
  
  // Fetch LLM configuration
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const config = await response.json();
      if (config.currentLLM) {
        state.llmConfig = config.currentLLM;
        updateLLMButtons();
        checkAISetup();
      }
    }
  } catch (error) {
    console.error('Failed to fetch LLM config:', error);
  }
  
  // Fetch button configuration
  try {
    const response = await fetch('/api/button-config');
    if (response.ok) {
      const buttonConfig = await response.json();
      state.buttonConfig = buttonConfig;
      // Generate buttons dynamically when terminal view is shown
    }
  } catch (error) {
    console.error('Failed to fetch button config:', error);
  }
  
  // Load initial data
  await projects.loadProjects();
  
  // Set up mobile features if on mobile
  if (utils.isMobile()) {
    mobile.createMobileFAB();
    mobile.addLongPressSupport();
    mobile.updateMobileCommandsExpanded();
  } else {
    mobile.addDesktopCopyButtons();
  }
  
  // Set up event listeners
  setupEventListeners();
  
  // Check for mobile and adjust UI
  handleResponsiveUI();
  window.addEventListener('resize', handleResponsiveUI);
});

function setupEventListeners() {
  // Session form submission
  const sessionForm = document.getElementById('session-form');
  if (sessionForm) {
    sessionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sessions.createSession();
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
      fab.classList.add('hidden');
    }
  }
}

// Global error handler
window.addEventListener('error', (event) => {
  // Ignore null errors and certain terminal-related errors
  if (!event.error || event.error === null) {
    return;
  }
  
  // Log the error with more context
  console.error('Global error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
  
  // Only show toast for non-terminal errors
  if (event.filename && !event.filename.includes('xterm')) {
    utils.showToast('An error occurred. Check console for details.');
  }
});

// Update LLM buttons with current LLM name
function updateLLMButtons() {
  const llmName = state.llmConfig?.name || 'Claude';
  const llmCommand = state.llmConfig?.command || 'claude';
  
  // Update button configuration if loaded
  if (state.buttonConfig && state.buttonConfig.ai) {
    if (state.buttonConfig.ai.start) {
      state.buttonConfig.ai.start.label = llmName;
      state.buttonConfig.ai.start.mobileLabel = `🤖 ${llmName}`;
    }
    if (state.buttonConfig.ai.exit) {
      state.buttonConfig.ai.exit.label = `Exit ${llmName}`;
      state.buttonConfig.ai.exit.mobileLabel = '🛑 Exit';
    }
  }
  
  // Update existing button text (for buttons already rendered)
  const buttons = [
    document.getElementById('llm-button'),
    document.getElementById('llm-button-mobile'),
    document.getElementById('exit-llm-button'),
    document.getElementById('launch-llm-all-button'),
    document.getElementById('exit-llm-all-button')
  ];
  
  buttons.forEach(btn => {
    if (btn) {
      if (btn.id === 'llm-button' || btn.id === 'llm-button-mobile') {
        btn.textContent = btn.id === 'llm-button-mobile' ? `🤖 ${llmName}` : llmCommand;
      } else if (btn.id === 'exit-llm-button') {
        btn.textContent = `Exit ${llmName}`;
      } else if (btn.id === 'launch-llm-all-button') {
        btn.textContent = `🤖 Launch ${llmName} (All)`;
      } else if (btn.id === 'exit-llm-all-button') {
        btn.textContent = `🛑 Exit ${llmName} (All)`;
      }
    }
  });
  
  // Update menu text
  const menuTexts = [
    document.getElementById('launch-llm-menu-text'),
    document.getElementById('exit-llm-menu-text')
  ];
  
  if (menuTexts[0]) menuTexts[0].textContent = `Launch ${llmName} (All)`;
  if (menuTexts[1]) menuTexts[1].textContent = `Exit ${llmName} (All)`;
}

// Check if AI is properly set up
function checkAISetup() {
  const llmName = state.llmConfig?.name || '';
  const llmCommand = state.llmConfig?.command || '';
  
  // Check if using default/custom config
  if (llmName === 'Your AI Assistant' || llmCommand === 'your-ai-command') {
    // Show setup prompt
    const setupPrompt = document.getElementById('ai-setup-prompt');
    if (setupPrompt) {
      setupPrompt.classList.remove('hidden');
    }
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  // Close all WebSocket connections
  if (state.currentWs) state.currentWs.close();
  state.cubicleWebSockets.forEach(ws => ws.close());
  
  // Dispose all terminals
  if (state.currentTerminal) state.currentTerminal.dispose();
  state.cubicleTerminals.forEach(({ term }) => term.dispose());
});