// Terminal management functions
import { state, setState } from './state.js';
import { showToast, copyToClipboard } from './utils.js';
import { clipboardService } from '../clipboard.js';
import { TerminalFactory } from '../terminalFactory.js';
import { getTerminalSettings } from './terminalSettings.js';
import { initializeMainTerminalResize } from './terminalResize.js';

export function sendToTerminal(command) {
  if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
    try {
      state.currentWs.send(JSON.stringify({
        type: 'input',
        data: command
      }));
    } catch (e) {
      // Fallback to raw send
      state.currentWs.send(command);
    }
  }
}

export function exitClaude() {
  // Deprecated - use exitLLM instead
  exitLLM();
}

export function exitLLM() {
  // Check if button config has a custom exit sequence
  let exitSequence;
  let delay;
  
  if (state.buttonConfig?.ai?.exit?.exitSequence) {
    exitSequence = state.buttonConfig.ai.exit.exitSequence;
    delay = 50; // Default delay for custom sequences
  } else {
    // Use LLM config defaults
    exitSequence = state.llmConfig?.exitSequence || '\x03\x03';
    delay = state.llmConfig?.exitDelay || 50;
  }
  
  // Handle exit sequence - if it contains multiple Ctrl+C, split and send with delay
  if (exitSequence === '\x03\x03') {
    sendToTerminal('\x03');
    setTimeout(() => sendToTerminal('\x03'), delay);
  } else {
    sendToTerminal(exitSequence);
  }
}

export function sendLLMCommand() {
  // Check if button config has a custom command
  let command;
  if (state.buttonConfig?.ai?.start?.command) {
    command = state.buttonConfig.ai.start.command;
  } else {
    command = state.llmConfig?.command || 'claude';
  }
  sendToTerminal(command + '\n');
}

export function copyLLMCommand() {
  // Use same logic as sendLLMCommand to get the actual command
  let command;
  if (state.buttonConfig?.ai?.start?.command) {
    command = state.buttonConfig.ai.start.command;
  } else {
    command = state.llmConfig?.command || 'claude';
  }
  copyToClipboard(command, 'Command copied!');
}


export async function attachTerminal(sessionName) {
  // Hide other views
  document.getElementById('projects-view').classList.add('hidden');
  document.getElementById('sessions-view').classList.add('hidden');
  document.getElementById('terminal-view').classList.remove('hidden');
  document.getElementById('main-header').classList.add('hidden');
  
  // Set current session name
  document.getElementById('current-session').textContent = sessionName;
  
  // Generate buttons from configuration
  generateQuickCommandButtons();
  
  // Close existing WebSocket if any
  if (state.currentWs) {
    state.currentWs.close();
  }
  
  // Connect to WebSocket
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.currentWs = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
  
  // Create terminal if not exists
  if (!state.currentTerminal) {
    const terminalContainer = document.getElementById('terminal');
    terminalContainer.innerHTML = '';
    
    const settings = getTerminalSettings();
    const { terminal, fitAddon } = TerminalFactory.createTerminalWithContainer(terminalContainer, {
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      theme: settings.theme,
      scrollback: settings.scrollback,
      rightClickSelectsWord: false
    });
    
    state.currentTerminal = terminal;
    state.fitAddon = fitAddon;
    
    // Add copy/paste keyboard shortcuts
    setupTerminalCopyPaste(state.currentTerminal);
    
    // Ensure mouse wheel scrolls the terminal viewport instead of cycling commands
    setupTerminalMouseWheel(state.currentTerminal);
    
    // Handle resize with debouncing
    if (state.resizeListener) {
      window.removeEventListener('resize', state.resizeListener);
    }
    
    let resizeTimer = null;
    state.resizeListener = () => {
      // Clear any pending resize
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      
      // Debounce resize events
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        
        // Send resize message to server
        if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
          const dimensions = fitAddon.proposeDimensions();
          if (dimensions) {
            state.currentWs.send(JSON.stringify({
              type: 'resize',
              cols: dimensions.cols,
              rows: dimensions.rows
            }));
          }
        }
      }, 150); // Debounce for 150ms
    };
    window.addEventListener('resize', state.resizeListener);
  }
  
  // Initialize resize functionality for main terminal
  setTimeout(() => {
    initializeMainTerminalResize();
  }, 100);
  
  // Selection preservation state
  let isSelecting = false;
  let selectionBuffer = [];
  let bufferTimer = null;
  
  // Track mouse selection state
  const terminalElement = state.currentTerminal.element;
  terminalElement.addEventListener('mousedown', () => {
    isSelecting = true;
  });
  
  terminalElement.addEventListener('mouseup', () => {
    isSelecting = false;
    // Flush any buffered data after selection is complete
    if (selectionBuffer.length > 0) {
      setTimeout(() => {
        selectionBuffer.forEach(data => state.currentTerminal.write(data));
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
          selectionBuffer.forEach(data => state.currentTerminal.write(data));
          selectionBuffer = [];
        }, 50);
      }
    }
  });
  
  // Handle WebSocket events
  state.currentWs.onopen = () => {
    console.log('WebSocket connected');
    state.currentTerminal.focus();
    
    // Send initial resize to ensure sync
    if (state.fitAddon) {
      state.fitAddon.fit();
      const dimensions = state.fitAddon.proposeDimensions();
      if (dimensions && state.currentWs.readyState === WebSocket.OPEN) {
        state.currentWs.send(JSON.stringify({
          type: 'resize',
          cols: dimensions.cols,
          rows: dimensions.rows
        }));
      }
    }
  };
  
  state.currentWs.onmessage = (event) => {
    // If user is selecting text, buffer the data instead of writing immediately
    if (isSelecting && state.currentTerminal.hasSelection()) {
      selectionBuffer.push(event.data);
      
      // Clear any existing timer
      if (bufferTimer) {
        clearTimeout(bufferTimer);
      }
      
      // Set a timeout to flush buffer if selection takes too long
      bufferTimer = setTimeout(() => {
        if (selectionBuffer.length > 0) {
          selectionBuffer.forEach(data => state.currentTerminal.write(data));
          selectionBuffer = [];
        }
        bufferTimer = null;
      }, 1000); // Flush after 1 second max
    } else {
      // Normal write when not selecting
      state.currentTerminal.write(event.data);
    }
  };
  
  state.currentWs.onerror = (error) => {
    console.error('WebSocket error:', error);
    showToast('Connection error');
  };
  
  state.currentWs.onclose = () => {
    console.log('WebSocket disconnected');
    showToast('Connection closed');
  };
  
  // Send terminal input to WebSocket with proper message format
  state.currentTerminal.onData((data) => {
    if (state.currentWs.readyState === WebSocket.OPEN) {
      // Try to use new protocol, fallback to raw for compatibility
      try {
        state.currentWs.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      } catch (e) {
        // Fallback to raw send
        state.currentWs.send(data);
      }
    }
  });
}

export function closeTerminal() {
  if (state.currentWs) {
    state.currentWs.close();
    state.currentWs = null;
  }
  if (state.currentTerminal) {
    state.currentTerminal.dispose();
    state.currentTerminal = null;
  }
  if (state.resizeListener) {
    window.removeEventListener('resize', state.resizeListener);
    state.resizeListener = null;
  }
  
  
  // Show projects view
  document.getElementById('terminal-view').classList.add('hidden');
  document.getElementById('projects-view').classList.remove('hidden');
  document.getElementById('main-header').classList.remove('hidden');
}

// Setup mouse wheel scrolling
function setupTerminalMouseWheel(term) {
  if (!term) return;
  
  // Ensure terminal is not in application cursor mode which can cause
  // mouse wheel to cycle through command history instead of scrolling
  term.options.applicationCursor = false;
  
  // Enable mouse events for scrolling
  term.options.mouseEvents = true;
  
  // If the terminal has a viewport, ensure it's scrollable
  if (term.viewport) {
    term.viewport.syncScrollArea();
  }
}

// Setup copy/paste for terminal
function setupTerminalCopyPaste(term) {
  // Track paste in progress to prevent multiple pastes
  let pasteInProgress = false;
  
  // Handle keyboard shortcuts
  term.attachCustomKeyEventHandler((event) => {
    // Ctrl+C for copy (when there's a selection)
    if (event.ctrlKey && event.key === 'c' && term.hasSelection()) {
      copyTerminalSelection(term);
      return false;
    }
    // Ctrl+V for paste
    if (event.ctrlKey && event.key === 'v') {
      event.preventDefault();
      event.stopPropagation();
      
      // Prevent multiple pastes
      if (pasteInProgress) {
        return false;
      }
      
      pasteInProgress = true;
      pasteToTerminal(term).finally(() => {
        // Reset after a short delay to ensure we don't miss legitimate paste attempts
        setTimeout(() => {
          pasteInProgress = false;
        }, 100);
      });
      return false;
    }
    // Ctrl+Shift+C for copy (common terminal shortcut)
    if (event.ctrlKey && event.shiftKey && event.key === 'C') {
      copyTerminalSelection(term);
      return false;
    }
    // Ctrl+Shift+V for paste (common terminal shortcut)
    if (event.ctrlKey && event.shiftKey && event.key === 'V') {
      event.preventDefault();
      event.stopPropagation();
      
      // Prevent multiple pastes
      if (pasteInProgress) {
        return false;
      }
      
      pasteInProgress = true;
      pasteToTerminal(term).finally(() => {
        // Reset after a short delay
        setTimeout(() => {
          pasteInProgress = false;
        }, 100);
      });
      return false;
    }
    return true;
  });
}

// Copy selected text from terminal
export function copyTerminalSelection(term = state.currentTerminal) {
  if (!term || !term.hasSelection()) {
    showToast('No text selected');
    return;
  }
  
  const selection = term.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection).then(() => {
      showToast('Copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = selection;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Copied to clipboard!');
      } catch (e) {
        showToast('Copy failed');
      }
      document.body.removeChild(textarea);
    });
  }
}

// Paste text to terminal
export async function pasteToTerminal(term = state.currentTerminal) {
  if (!term) {
    showToast('No terminal active');
    return Promise.resolve();
  }
  
  try {
    const text = await navigator.clipboard.readText();
    if (text && state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
      try {
        state.currentWs.send(JSON.stringify({
          type: 'input',
          data: text
        }));
      } catch (e) {
        // Fallback to raw send
        state.currentWs.send(text);
      }
      showToast('Pasted!');
    }
    return Promise.resolve();
  } catch (err) {
    // Fallback or permission denied
    showToast('Unable to paste - check clipboard permissions');
    return Promise.resolve();
  }
}

// For AI Office grid terminals
export function broadcastToAllTerminals(command) {
  state.cubicleWebSockets.forEach((ws) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'input',
          data: command
        }));
      } catch (e) {
        // Fallback to raw send
        ws.send(command);
      }
    }
  });
}

export function exitClaudeAll() {
  // Deprecated - use exitLLMAll instead
  exitLLMAll();
}

export function exitLLMAll() {
  // Check if button config has a custom exit sequence
  let exitSequence;
  let delay;
  
  if (state.buttonConfig?.ai?.exit?.exitSequence) {
    exitSequence = state.buttonConfig.ai.exit.exitSequence;
    delay = 50; // Default delay for custom sequences
  } else {
    // Use LLM config defaults
    exitSequence = state.llmConfig?.exitSequence || '\x03\x03';
    delay = state.llmConfig?.exitDelay || 50;
  }
  
  // Handle exit sequence - if it contains multiple Ctrl+C, split and send with delay
  if (exitSequence === '\x03\x03') {
    broadcastToAllTerminals('\x03');
    setTimeout(() => broadcastToAllTerminals('\x03'), delay);
  } else {
    broadcastToAllTerminals(exitSequence);
  }
}

export function broadcastLLMCommand() {
  // Check if button config has a custom command
  let command;
  if (state.buttonConfig?.ai?.start?.command) {
    command = state.buttonConfig.ai.start.command;
  } else {
    command = state.llmConfig?.command || 'claude';
  }
  broadcastToAllTerminals(command + '\n');
}


// Generate quick command buttons dynamically from configuration
export function generateQuickCommandButtons() {
  const buttonConfig = state.buttonConfig;
  if (!buttonConfig) return;
  
  // Desktop buttons container
  const desktopContainer = document.querySelector('.bg-gray-700.p-2.flex.gap-2.overflow-x-auto.flex-shrink-0.hidden.md\\:flex');
  if (desktopContainer) {
    desktopContainer.innerHTML = generateDesktopButtons(buttonConfig);
  }
  
  // Mobile buttons container
  const mobileContainer = document.querySelector('.mobile-button-grid');
  if (mobileContainer) {
    mobileContainer.innerHTML = generateMobileButtons(buttonConfig);
  }
  
  // AI Office grid buttons
  generateAIOfficeButtons();
}

// Generate buttons for AI Office grid view
export function generateAIOfficeButtons() {
  const buttonConfig = state.buttonConfig;
  if (!buttonConfig) return;
  
  const container = document.getElementById('ai-office-quick-commands');
  if (!container) return;
  
  // Clear existing content
  container.innerHTML = '';
  
  // AI buttons for broadcast
  if (buttonConfig.ai) {
    if (buttonConfig.ai.start) {
      const startButton = document.createElement('button');
      startButton.onclick = () => window.terminal.broadcastLLMCommand();
      startButton.className = `context-button ${buttonConfig.ai.start.className} hover:bg-blue-700`;
      startButton.id = 'launch-llm-all-button';
      startButton.innerHTML = `🤖 ${buttonConfig.ai.start.label} (All)`;
      container.appendChild(startButton);
    }
    if (buttonConfig.ai.exit) {
      const exitButton = document.createElement('button');
      exitButton.onclick = () => window.terminal.exitLLMAll();
      exitButton.className = `context-button ${buttonConfig.ai.exit.className} hover:bg-red-700`;
      exitButton.id = 'exit-llm-all-button';
      exitButton.innerHTML = `🛑 ${buttonConfig.ai.exit.label} (All)`;
      container.appendChild(exitButton);
    }
  }
  
  // Pulse Tab button for grid
  if (buttonConfig.utilityButtons?.pulseTab) {
    const pulseTabButton = document.createElement('button');
    pulseTabButton.onclick = () => window.terminal.broadcastToAllTerminals(buttonConfig.utilityButtons.pulseTab.command);
    pulseTabButton.className = `context-button ${buttonConfig.utilityButtons.pulseTab.className}`;
    pulseTabButton.title = buttonConfig.utilityButtons.pulseTab.title;
    pulseTabButton.innerHTML = `📢 ${buttonConfig.utilityButtons.pulseTab.label} (All)`;
    container.appendChild(pulseTabButton);
  }
  
  // Add separator
  const separator = document.createElement('div');
  separator.className = 'w-px h-6 bg-gray-600 mx-1';
  container.appendChild(separator);
  
  // Quick command buttons for broadcast
  if (buttonConfig.quickCommands && buttonConfig.quickCommands.length > 0) {
    buttonConfig.quickCommands.forEach(cmd => {
      const button = document.createElement('button');
      button.onclick = () => window.terminal.broadcastToAllTerminals(cmd.command);
      button.className = `context-button ${cmd.className}`;
      button.title = `${cmd.title || ''} (Broadcast to all)`;
      button.innerHTML = `📢 ${cmd.label}`;
      container.appendChild(button);
    });
  }
}

function generateDesktopButtons(config) {
  let html = '';
  
  // Utility buttons (Copy/Paste)
  if (config.utilityButtons) {
    if (config.utilityButtons.copy) {
      html += `<button onclick="window.terminal.copyTerminalSelection()" class="px-3 py-1 ${config.utilityButtons.copy.className} rounded text-sm" title="${config.utilityButtons.copy.title}">${config.utilityButtons.copy.label}</button>`;
    }
    if (config.utilityButtons.paste) {
      html += `<button onclick="window.terminal.pasteToTerminal()" class="px-3 py-1 ${config.utilityButtons.paste.className} rounded text-sm" title="${config.utilityButtons.paste.title}">${config.utilityButtons.paste.label}</button>`;
    }
  }
  
  // Separator
  html += '<div class="w-px bg-gray-600 mx-1"></div>';
  
  // AI buttons
  if (config.ai) {
    if (config.ai.start) {
      html += `<button onclick="window.terminal.sendLLMCommand()" class="px-3 py-1 ${config.ai.start.className} rounded text-sm font-semibold" id="llm-button" title="${config.ai.start.title}">${config.ai.start.label}</button>`;
    }
    if (config.ai.exit) {
      html += `<button onclick="window.terminal.exitLLM()" class="px-3 py-1 ${config.ai.exit.className} rounded text-sm font-semibold" title="${config.ai.exit.title}" id="exit-llm-button">${config.ai.exit.label}</button>`;
    }
  }
  
  // Pulse Tab button (replaces auto-accept)
  if (config.utilityButtons?.pulseTab) {
    const escapedCommand = config.utilityButtons.pulseTab.command.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    html += `<button onclick="window.terminal.broadcastToAllTerminals('${escapedCommand}')" class="px-3 py-1 ${config.utilityButtons.pulseTab.className} rounded text-sm" title="${config.utilityButtons.pulseTab.title}">${config.utilityButtons.pulseTab.label}</button>`;
  }
  
  // Shift+Tab button
  if (config.utilityButtons?.shiftTab) {
    const escapedCommand = config.utilityButtons.shiftTab.command.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    html += `<button onclick="window.terminal.sendToTerminal('${escapedCommand}')" class="px-3 py-1 ${config.utilityButtons.shiftTab.className} rounded text-sm" title="${config.utilityButtons.shiftTab.title}">${config.utilityButtons.shiftTab.label}</button>`;
  }
  
  // Escape button
  if (config.utilityButtons?.escape) {
    const escapedCommand = config.utilityButtons.escape.command.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    html += `<button onclick="window.terminal.sendToTerminal('${escapedCommand}')" class="px-3 py-1 ${config.utilityButtons.escape.className} rounded text-sm" title="${config.utilityButtons.escape.title}">${config.utilityButtons.escape.label}</button>`;
  }
  
  // Quick command buttons
  if (config.quickCommands && config.quickCommands.length > 0) {
    config.quickCommands.forEach(cmd => {
      const escapedCommand = cmd.command.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      html += `<button onclick="window.terminal.sendToTerminal('${escapedCommand}')" class="px-3 py-1 ${cmd.className} rounded text-sm" title="${cmd.title || ''}">${cmd.label}</button>`;
    });
  }
  
  return html;
}

function generateMobileButtons(config) {
  let html = '';
  
  // Priority buttons for mobile
  if (config.ai?.start) {
    const mobileLabel = config.ai.start.mobileLabel || config.ai.start.label;
    html += `<button onclick="window.terminal.sendLLMCommand()" class="priority-button ${config.ai.start.className} rounded haptic-feedback" oncontextmenu="window.terminal.copyLLMCommand(); return false;" id="llm-button-mobile">
      ${mobileLabel}
    </button>`;
  }
  
  if (config.ai?.exit) {
    const mobileLabel = config.ai.exit.mobileLabel || config.ai.exit.label;
    html += `<button onclick="window.terminal.exitLLM()" class="priority-button ${config.ai.exit.className} rounded haptic-feedback">
      ${mobileLabel}
    </button>`;
  }
  
  if (config.utilityButtons?.copy) {
    html += `<button onclick="window.mobile.copyTerminalSelection()" class="priority-button ${config.utilityButtons.copy.className} rounded haptic-feedback">
      ${config.utilityButtons.copy.label}
    </button>`;
  }
  
  if (config.utilityButtons?.paste) {
    html += `<button onclick="window.mobile.pasteToTerminal()" class="priority-button ${config.utilityButtons.paste.className} rounded haptic-feedback">
      ${config.utilityButtons.paste.label}
    </button>`;
  }
  
  return html;
}