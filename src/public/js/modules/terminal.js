// Terminal management functions
import { state, setState } from './state.js';
import { showToast } from './utils.js';

export function sendToTerminal(command) {
  if (state.currentWs && state.currentWs.readyState === WebSocket.OPEN) {
    state.currentWs.send(command);
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
    
    state.currentTerminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#d4d4d4'
      }
    });
    
    const fitAddon = new FitAddon.FitAddon();
    state.currentTerminal.loadAddon(fitAddon);
    state.currentTerminal.open(terminalContainer);
    fitAddon.fit();
    
    // Handle resize
    if (state.resizeListener) {
      window.removeEventListener('resize', state.resizeListener);
    }
    state.resizeListener = () => fitAddon.fit();
    window.addEventListener('resize', state.resizeListener);
  }
  
  // Clear terminal
  state.currentTerminal.clear();
  
  // Handle WebSocket events
  state.currentWs.onopen = () => {
    console.log('WebSocket connected');
    state.currentTerminal.focus();
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
  
  // Send terminal input to WebSocket
  state.currentTerminal.onData((data) => {
    if (state.currentWs.readyState === WebSocket.OPEN) {
      state.currentWs.send(data);
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

// For AI Office grid terminals
export function broadcastToAllTerminals(command) {
  state.cubicleWebSockets.forEach((ws) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(command);
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