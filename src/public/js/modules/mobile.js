// Mobile-specific UI functions
import { state } from './state.js';
import { showToast, copyToClipboard, MOBILE_BREAKPOINT } from './utils.js';
import { clipboardService } from '../clipboard.js';

// Terminal font size controls
let currentFontSize = 14;

export function toggleMobileCommands() {
  const expanded = document.getElementById('mobile-commands-expanded');
  const arrow = document.getElementById('mobile-commands-arrow');
  
  if (expanded.classList.contains('button-group-collapsed')) {
    expanded.classList.remove('button-group-collapsed');
    expanded.classList.add('button-group-expanded');
    arrow.textContent = '▲';
  } else {
    expanded.classList.remove('button-group-expanded');
    expanded.classList.add('button-group-collapsed');
    arrow.textContent = '▼';
  }
}

export async function copyTerminalSelection() {
  if (!state.currentTerminal) return;
  
  const selection = state.currentTerminal.getSelection();
  if (selection) {
    await copyToClipboard(selection, 'Copied to clipboard!');
  } else {
    showToast('Nothing to copy');
  }
}

export async function pasteToTerminal() {
  if (!state.currentTerminal || !state.currentWs) return;
  
  try {
    const text = await clipboardService.pasteFromClipboard();
    if (text && state.currentWs.readyState === WebSocket.OPEN) {
      state.currentWs.send(text);
      showToast('Pasted!');
    }
  } catch (err) {
    // Clipboard API might not be available
    showToast('Paste not supported on this device');
  }
}

export function reconnectTerminal() {
  if (!state.currentWs || state.currentWs.readyState !== WebSocket.OPEN) {
    const sessionName = document.getElementById('current-session').textContent;
    if (sessionName) {
      // Close existing connection
      if (state.currentWs) state.currentWs.close();
      
      // Reconnect
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      state.currentWs = new WebSocket(`${protocol}//${window.location.host}/terminal/${sessionName}`);
      
      state.currentWs.onopen = () => {
        showToast('Reconnected!');
      };
      
      state.currentWs.onmessage = (event) => {
        if (state.currentTerminal) state.currentTerminal.write(event.data);
      };
      
      state.currentWs.onerror = () => {
        showToast('Connection failed');
      };
      
      if (state.currentTerminal) {
        state.currentTerminal.onData((data) => {
          if (state.currentWs.readyState === WebSocket.OPEN) {
            state.currentWs.send(data);
          }
        });
      }
    }
  } else {
    showToast('Already connected');
  }
}

export function saveTerminalOutput() {
  if (!state.currentTerminal) return;
  
  const selection = state.currentTerminal.getSelection() || state.currentTerminal.buffer.active.getLine(0)?.translateToString();
  if (selection) {
    const blob = new Blob([selection], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-output-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Output saved!');
  } else {
    showToast('No output to save');
  }
}

export function increaseFontSize() {
  if (currentFontSize < 24) {
    currentFontSize += 2;
    if (state.currentTerminal) {
      state.currentTerminal.options.fontSize = currentFontSize;
      showToast(`Font size: ${currentFontSize}px`);
    }
  }
}

export function decreaseFontSize() {
  if (currentFontSize > 10) {
    currentFontSize -= 2;
    if (state.currentTerminal) {
      state.currentTerminal.options.fontSize = currentFontSize;
      showToast(`Font size: ${currentFontSize}px`);
    }
  }
}

export function createMobileFAB() {
  if (window.innerWidth > 768) return; // Only on mobile
  
  const fab = document.createElement('div');
  fab.className = 'fab bg-blue-600 hidden';
  fab.innerHTML = '⚡';
  fab.onclick = toggleFABMenu;
  
  const fabMenu = document.createElement('div');
  fabMenu.className = 'fab-menu hidden';
  fabMenu.innerHTML = `
    <button onclick="window.terminal.sendToTerminal('claude\\n')" class="bg-blue-500">🤖</button>
    <button onclick="window.terminal.sendToTerminal('\\x1b[Z')" class="bg-purple-500">⇧</button>
    <button onclick="window.mobile.copyTerminalSelection()" class="bg-green-500">📋</button>
  `;
  
  document.body.appendChild(fab);
  document.body.appendChild(fabMenu);
}

function toggleFABMenu() {
  const fabMenu = document.querySelector('.fab-menu');
  if (fabMenu) {
    fabMenu.classList.toggle('hidden');
  }
}

export function updateMobileCommandsExpanded() {
  const expandedSection = document.getElementById('mobile-commands-expanded');
  if (expandedSection && window.innerWidth <= MOBILE_BREAKPOINT) {
    const existingContent = expandedSection.querySelector('.terminal-commands-mobile');
    if (existingContent) {
      // Add utility buttons section
      const utilitySection = document.createElement('div');
      utilitySection.className = 'terminal-commands-mobile mt-2';
      utilitySection.innerHTML = `
        <button onclick="window.mobile.reconnectTerminal()" class="bg-blue-600 rounded haptic-feedback">🔌 Reconnect</button>
        <button onclick="window.mobile.saveTerminalOutput()" class="bg-green-600 rounded haptic-feedback">💾 Save Output</button>
        <button onclick="window.mobile.increaseFontSize()" class="bg-gray-600 rounded haptic-feedback">🔍+ Zoom In</button>
        <button onclick="window.mobile.decreaseFontSize()" class="bg-gray-600 rounded haptic-feedback">🔍- Zoom Out</button>
        <button onclick="state.currentTerminal && state.currentTerminal.scrollToBottom()" class="bg-gray-600 rounded haptic-feedback">⬇️ Bottom</button>
        <button onclick="state.currentTerminal && state.currentTerminal.scrollToTop()" class="bg-gray-600 rounded haptic-feedback">⬆️ Top</button>
      `;
      expandedSection.appendChild(utilitySection);
      
      // Add copy commands section
      const copySection = document.createElement('div');
      copySection.className = 'mt-2 p-2 bg-gray-800 rounded';
      copySection.innerHTML = `
        <div class="text-xs text-gray-400 mb-2">Quick Copy Commands:</div>
        <div class="flex flex-wrap gap-2">
          <button onclick="window.utils.copyToClipboard('claude', 'Command copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded">claude</button>
          <button onclick="window.utils.copyToClipboard('ls -la', 'Command copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded">ls -la</button>
          <button onclick="window.utils.copyToClipboard('git status', 'Command copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded">git status</button>
          <button onclick="window.utils.copyToClipboard('git pull', 'Command copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded">git pull</button>
          <button onclick="window.utils.copyToClipboard('git push', 'Command copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded">git push</button>
          <button onclick="window.utils.copyToClipboard('npm install', 'Command copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded">npm install</button>
          <button onclick="window.utils.copyToClipboard('npm start', 'Command copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded">npm start</button>
        </div>
      `;
      expandedSection.appendChild(copySection);
    }
  }
}

export function addLongPressSupport() {
  if (window.innerWidth > MOBILE_BREAKPOINT) return;
  
  let pressTimer;
  let longPressHint;
  const longPressDuration = 500;
  
  // Create long press hint element
  if (!document.getElementById('long-press-hint')) {
    longPressHint = document.createElement('div');
    longPressHint.id = 'long-press-hint';
    longPressHint.className = 'long-press-hint';
    longPressHint.textContent = 'Hold to copy command';
    document.body.appendChild(longPressHint);
  } else {
    longPressHint = document.getElementById('long-press-hint');
  }
  
  // Add long press to all command buttons
  document.addEventListener('touchstart', (e) => {
    const button = e.target.closest('button[onclick*="sendToTerminal"]');
    if (!button) return;
    
    // Show hint after 200ms
    setTimeout(() => {
      if (pressTimer) {
        longPressHint.classList.add('show');
      }
    }, 200);
    
    // Extract command from onclick attribute
    const onclickAttr = button.getAttribute('onclick');
    const match = onclickAttr.match(/sendToTerminal\('(.+?)'\)/); 
    if (!match) return;
    
    let command = match[1]
      .replace(/\\n/g, '')
      .replace(/\\x1b\[Z/g, 'Shift+Tab')
      .replace(/\\x03/g, 'Ctrl+C');
    
    pressTimer = setTimeout(() => {
      e.preventDefault();
      copyToClipboard(command, 'Command copied!');
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(50);
      button.classList.add('copying');
      setTimeout(() => button.classList.remove('copying'), 300);
      longPressHint.classList.remove('show');
    }, longPressDuration);
  });
  
  document.addEventListener('touchend', () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    longPressHint.classList.remove('show');
  });
  
  document.addEventListener('touchmove', () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    longPressHint.classList.remove('show');
  });
}

export function addDesktopCopyButtons() {
  // Add event delegation for dynamically created copy buttons
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-copy]')) {
      const textToCopy = e.target.getAttribute('data-copy');
      const message = e.target.getAttribute('data-copy-message') || 'Copied!';
      copyToClipboard(textToCopy, message);
    }
  });
}

// Detect mobile and show FAB in terminal view
window.addEventListener('resize', () => {
  const fab = document.querySelector('.fab');
  if (window.innerWidth <= 768 && document.getElementById('terminal-view').classList.contains('hidden') === false) {
    if (fab) fab.classList.remove('hidden');
  } else {
    if (fab) fab.classList.add('hidden');
  }
});