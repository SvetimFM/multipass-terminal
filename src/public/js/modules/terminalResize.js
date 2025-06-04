// Terminal Resize functionality with touch support
import { state } from './state.js';
import { showToast } from './utils.js';

// Default heights
const DEFAULT_HEIGHTS = {
  main: 400,
  cubicle: 400,
  minHeight: 400,
  maxHeight: 800
};

// Load saved heights from localStorage
export function loadTerminalHeights() {
  try {
    const saved = localStorage.getItem('terminalHeights');
    if (saved) {
      return { ...DEFAULT_HEIGHTS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading terminal heights:', e);
  }
  return DEFAULT_HEIGHTS;
}

// Save heights to localStorage
export function saveTerminalHeights(heights) {
  try {
    localStorage.setItem('terminalHeights', JSON.stringify(heights));
    return true;
  } catch (e) {
    console.error('Error saving terminal heights:', e);
    return false;
  }
}

// Make a terminal container resizable
export function makeResizable(container, terminalId, options = {}) {
  const {
    onResize = () => {},
    minHeight = DEFAULT_HEIGHTS.minHeight,
    maxHeight = DEFAULT_HEIGHTS.maxHeight,
    handlePosition = 'bottom'
  } = options;

  // Create resize handle
  const handle = document.createElement('div');
  handle.className = 'resize-handle resize-handle-' + handlePosition;
  handle.innerHTML = '<div class="resize-grip"></div>';
  
  // Add handle to container
  if (handlePosition === 'top') {
    container.insertBefore(handle, container.firstChild);
  } else {
    container.appendChild(handle);
  }

  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  // Mouse/Touch start
  const handleStart = (e) => {
    isResizing = true;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    startHeight = container.offsetHeight;
    
    // Add resizing class
    container.classList.add('resizing');
    document.body.style.cursor = 'ns-resize';
    
    // Prevent text selection while resizing
    e.preventDefault();
    
    // Add global listeners
    if (e.type.includes('touch')) {
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
    } else {
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
    }
  };

  // Mouse/Touch move
  const handleMove = (e) => {
    if (!isResizing) return;
    
    const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const deltaY = handlePosition === 'top' ? startY - currentY : currentY - startY;
    const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
    
    container.style.height = newHeight + 'px';
    
    // Call resize callback
    onResize(newHeight);
    
    // Prevent scrolling on touch devices
    if (e.type.includes('touch')) {
      e.preventDefault();
    }
  };

  // Mouse/Touch end
  const handleEnd = () => {
    if (!isResizing) return;
    
    isResizing = false;
    container.classList.remove('resizing');
    document.body.style.cursor = '';
    
    // Save the new height
    const heights = loadTerminalHeights();
    heights[terminalId] = container.offsetHeight;
    saveTerminalHeights(heights);
    
    // Remove global listeners
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('touchend', handleEnd);
  };

  // Add event listeners
  handle.addEventListener('mousedown', handleStart);
  handle.addEventListener('touchstart', handleStart, { passive: false });

  // Return cleanup function
  return () => {
    handle.removeEventListener('mousedown', handleStart);
    handle.removeEventListener('touchstart', handleStart);
    handle.remove();
  };
}

// Apply saved height to a container
export function applySavedHeight(container, terminalId) {
  const heights = loadTerminalHeights();
  const savedHeight = heights[terminalId];
  
  if (savedHeight) {
    container.style.height = savedHeight + 'px';
  }
}

// Initialize resize for main terminal
export function initializeMainTerminalResize() {
  const terminalView = document.getElementById('terminal-view');
  const terminalContainer = document.querySelector('.terminal-container');
  
  if (!terminalView || !terminalContainer) return;
  
  // Apply saved height
  applySavedHeight(terminalContainer, 'main');
  
  // Make resizable
  makeResizable(terminalContainer, 'main', {
    onResize: (height) => {
      // Trigger terminal fit if needed
      if (state.fitAddon) {
        requestAnimationFrame(() => {
          state.fitAddon.fit();
        });
      }
    }
  });
}

// Initialize resize for cubicle terminals
export function initializeCubicleResize(container, cubicleId) {
  if (!container) {
    console.error('Container not found for cubicle resize:', cubicleId);
    return;
  }
  
  // Make resizable
  const cubicleData = state.cubicleTerminals.get(cubicleId);
  
  return makeResizable(container, `cubicle-${cubicleId}`, {
    onResize: (height) => {
      // Trigger terminal fit if needed
      if (cubicleData && cubicleData.fitAddon) {
        requestAnimationFrame(() => {
          cubicleData.fitAddon.fit();
        });
      }
    },
    minHeight: DEFAULT_HEIGHTS.minHeight,
    maxHeight: DEFAULT_HEIGHTS.maxHeight
  });
}

// Export for window object
export const terminalResize = {
  makeResizable,
  applySavedHeight,
  initializeMainTerminalResize,
  initializeCubicleResize,
  loadTerminalHeights,
  saveTerminalHeights
};