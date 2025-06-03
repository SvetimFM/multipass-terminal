// Terminal Settings management
import { state, setState } from './state.js';
import { showToast } from './utils.js';

// Default terminal settings
const DEFAULT_SETTINGS = {
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  theme: {
    background: '#1a1a1a',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4'
  }
};

// Font size limits
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;

// Load settings from localStorage
export function loadTerminalSettings() {
  try {
    const saved = localStorage.getItem('terminalSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      return { ...DEFAULT_SETTINGS, ...settings };
    }
  } catch (e) {
    console.error('Error loading terminal settings:', e);
  }
  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
export function saveTerminalSettings(settings) {
  try {
    localStorage.setItem('terminalSettings', JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('Error saving terminal settings:', e);
    return false;
  }
}

// Get current terminal settings
export function getTerminalSettings() {
  if (!state.terminalSettings) {
    state.terminalSettings = loadTerminalSettings();
  }
  return state.terminalSettings;
}

// Update font size for all terminals
export function updateFontSize(newSize) {
  if (newSize < MIN_FONT_SIZE || newSize > MAX_FONT_SIZE) {
    showToast(`Font size must be between ${MIN_FONT_SIZE} and ${MAX_FONT_SIZE}`);
    return false;
  }

  const settings = getTerminalSettings();
  settings.fontSize = newSize;
  
  // Save to localStorage
  if (saveTerminalSettings(settings)) {
    state.terminalSettings = settings;
    
    // Apply to main terminal if it exists
    if (state.currentTerminal) {
      state.currentTerminal.options.fontSize = newSize;
      state.currentTerminal.refresh(0, state.currentTerminal.rows - 1);
      
      // Refit terminal
      if (state.fitAddon) {
        state.fitAddon.fit();
      }
    }
    
    // Apply to all cubicle terminals
    state.cubicleTerminals.forEach(({ term, fitAddon }) => {
      if (term) {
        term.options.fontSize = newSize;
        term.refresh(0, term.rows - 1);
        if (fitAddon) {
          fitAddon.fit();
        }
      }
    });
    
    // Update all font size displays
    updateFontSizeDisplays(newSize);
    
    showToast(`Font size changed to ${newSize}px`);
    return true;
  }
  
  showToast('Failed to save font settings');
  return false;
}

// Initialize font size controls
export function initializeFontSizeControls() {
  const settings = getTerminalSettings();
  
  // Update UI elements with current font size
  updateFontSizeDisplays(settings.fontSize);
}

// Update all font size displays
function updateFontSizeDisplays(fontSize) {
  const displays = ['font-size-display', 'grid-font-size-display'];
  displays.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = `${fontSize}px`;
    }
  });
}

// Export for window object
export const terminalSettings = {
  updateFontSize,
  initializeFontSizeControls,
  getTerminalSettings,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE
};