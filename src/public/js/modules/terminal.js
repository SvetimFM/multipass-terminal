// Terminal management functions
import { state, setState } from './state.js';
import { showToast, copyToClipboard } from './utils.js';
import { clipboardService } from '../clipboard.js';
import { TerminalFactory } from '../terminalFactory.js';

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
  // Send Ctrl+C twice quickly to exit Claude
  sendToTerminal('\x03');
  setTimeout(() => sendToTerminal('\x03'), 50);
}

export function toggleAutoAccept() {
  state.autoAcceptMode = !state.autoAcceptMode;
  const btn = document.getElementById('auto-accept-btn');
  const status = document.getElementById('auto-accept-status');
  
  if (state.autoAcceptMode) {
    status.textContent = 'ON';
    btn.classList.remove('bg-gray-600');
    btn.classList.add('bg-green-600');
    
    // Send Shift+Tab immediately
    sendToTerminal('\x1b[Z');
    
    // Set up interval to send Shift+Tab
    state.autoAcceptInterval = setInterval(() => {
      if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
        state.currentWs.send('\x1b[Z');
      }
    }, state.AUTO_ACCEPT_INTERVAL);
  } else {
    status.textContent = 'OFF';
    btn.classList.remove('bg-green-600');
    btn.classList.add('bg-gray-600');
    
    if (state.autoAcceptInterval) {
      clearInterval(state.autoAcceptInterval);
      state.autoAcceptInterval = null;
    }
  }
  
  // Update mobile button if exists
  updateMobileAutoAcceptButton();
}

function updateMobileAutoAcceptButton() {
  const mobileBtnStatus = document.getElementById('auto-accept-status-mobile');
  if (mobileBtnStatus) {
    mobileBtnStatus.textContent = state.autoAcceptMode ? 'ON' : 'OFF';
  }
  
  const mobileBtn = document.getElementById('auto-accept-btn-mobile');
  if (mobileBtn) {
    if (state.autoAcceptMode) {
      mobileBtn.classList.remove('bg-gray-600');
      mobileBtn.classList.add('bg-green-600');
    } else {
      mobileBtn.classList.remove('bg-green-600');
      mobileBtn.classList.add('bg-gray-600');
    }
  }
}

export async function attachTerminal(sessionName) {
  // Hide other views
  document.getElementById('projects-view').classList.add('hidden');
  document.getElementById('sessions-view').classList.add('hidden');
  document.getElementById('terminal-view').classList.remove('hidden');
  document.getElementById('main-header').classList.add('hidden');
  
  // Set current session name
  document.getElementById('current-session').textContent = sessionName;
  
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
    
    const { terminal, fitAddon } = TerminalFactory.createTerminalWithContainer(terminalContainer, {
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#d4d4d4'
      },
      rightClickSelectsWord: true
    });
    
    state.currentTerminal = terminal;
    state.fitAddon = fitAddon;
    
    // Add copy/paste keyboard shortcuts
    setupTerminalCopyPaste(state.currentTerminal);
    
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
  
  // Clear terminal
  state.currentTerminal.clear();
  
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
    state.currentTerminal.write(event.data);
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
  
  // Clear auto-accept if active
  if (state.autoAcceptInterval) {
    clearInterval(state.autoAcceptInterval);
    state.autoAcceptInterval = null;
  }
  state.autoAcceptMode = false;
  
  // Show projects view
  document.getElementById('terminal-view').classList.add('hidden');
  document.getElementById('projects-view').classList.remove('hidden');
  document.getElementById('main-header').classList.remove('hidden');
}

// Setup copy/paste for terminal
function setupTerminalCopyPaste(term) {
  // Handle keyboard shortcuts
  term.attachCustomKeyEventHandler((event) => {
    // Ctrl+C for copy (when there's a selection)
    if (event.ctrlKey && event.key === 'c' && term.hasSelection()) {
      copyTerminalSelection(term);
      return false;
    }
    // Ctrl+V for paste
    if (event.ctrlKey && event.key === 'v') {
      pasteToTerminal(term);
      return false;
    }
    // Ctrl+Shift+C for copy (common terminal shortcut)
    if (event.ctrlKey && event.shiftKey && event.key === 'C') {
      copyTerminalSelection(term);
      return false;
    }
    // Ctrl+Shift+V for paste (common terminal shortcut)
    if (event.ctrlKey && event.shiftKey && event.key === 'V') {
      pasteToTerminal(term);
      return false;
    }
    return true;
  });
  
  // Add right-click context menu
  const container = term.element || term._core.element;
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (term.hasSelection()) {
      copyTerminalSelection(term);
      showToast('Copied to clipboard!');
    }
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
    return;
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
  } catch (err) {
    // Fallback or permission denied
    showToast('Unable to paste - check clipboard permissions');
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
  // Send Ctrl+C twice quickly to all terminals
  broadcastToAllTerminals('\x03');
  setTimeout(() => broadcastToAllTerminals('\x03'), 50);
}

export function toggleGridAutoAccept() {
  state.gridAutoAcceptMode = !state.gridAutoAcceptMode;
  const btn = document.getElementById('grid-auto-accept-btn');
  const status = document.getElementById('grid-auto-accept-status');
  
  if (state.gridAutoAcceptMode) {
    status.textContent = 'ON';
    btn.classList.remove('bg-gray-600');
    btn.classList.add('bg-green-600');
    
    // Send Shift+Tab once to all terminals
    broadcastToAllTerminals('\x1b[Z');
  } else {
    status.textContent = 'OFF';
    btn.classList.remove('bg-green-600');
    btn.classList.add('bg-gray-600');
  }
  
  // Update mobile button
  updateMobileGridAutoAcceptButton();
}

function updateMobileGridAutoAcceptButton() {
  const mobileBtnStatus = document.getElementById('grid-auto-accept-status-mobile');
  if (mobileBtnStatus) {
    mobileBtnStatus.textContent = state.gridAutoAcceptMode ? 'ON' : 'OFF';
  }
  
  const mobileBtn = document.getElementById('grid-auto-accept-btn-mobile');
  if (mobileBtn) {
    if (state.gridAutoAcceptMode) {
      mobileBtn.classList.remove('bg-gray-600');
      mobileBtn.classList.add('bg-green-600');
    } else {
      mobileBtn.classList.remove('bg-green-600');
      mobileBtn.classList.add('bg-gray-600');
    }
  }
}