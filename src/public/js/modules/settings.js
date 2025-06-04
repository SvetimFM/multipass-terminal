// Settings management module
import { terminalSettings } from './terminalSettings.js';
import { showToast } from './utils.js';

// Initialize settings UI
export function initializeSettings() {
  const settings = terminalSettings.getTerminalSettings();
  
  // Update displays
  updateFontSizeDisplay(settings.fontSize);
  updateScrollbackDisplay(settings.scrollback);
  
  // Update sliders
  const fontSlider = document.getElementById('font-size-slider');
  const scrollbackSlider = document.getElementById('scrollback-slider');
  const scrollbackInput = document.getElementById('scrollback-input');
  
  if (fontSlider) fontSlider.value = settings.fontSize;
  if (scrollbackSlider) scrollbackSlider.value = settings.scrollback;
  if (scrollbackInput) scrollbackInput.value = settings.scrollback;
}

// Open settings modal
export function openSettings() {
  initializeSettings();
  document.getElementById('settings-modal').classList.remove('hidden');
}

// Close settings modal
export function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// Update font size from slider
export function updateFontSizeFromSlider(value) {
  const size = parseInt(value);
  if (terminalSettings.updateFontSize(size)) {
    updateFontSizeDisplay(size);
  }
}

// Increase font size
export function increaseFontSize() {
  const current = terminalSettings.getTerminalSettings().fontSize;
  const newSize = Math.min(current + 1, terminalSettings.MAX_FONT_SIZE);
  if (terminalSettings.updateFontSize(newSize)) {
    updateFontSizeDisplay(newSize);
    const slider = document.getElementById('font-size-slider');
    if (slider) slider.value = newSize;
  }
}

// Decrease font size
export function decreaseFontSize() {
  const current = terminalSettings.getTerminalSettings().fontSize;
  const newSize = Math.max(current - 1, terminalSettings.MIN_FONT_SIZE);
  if (terminalSettings.updateFontSize(newSize)) {
    updateFontSizeDisplay(newSize);
    const slider = document.getElementById('font-size-slider');
    if (slider) slider.value = newSize;
  }
}

// Update scrollback from slider
export function updateScrollbackFromSlider(value) {
  const size = parseInt(value);
  if (terminalSettings.updateScrollback(size)) {
    updateScrollbackDisplay(size);
    const input = document.getElementById('scrollback-input');
    if (input) input.value = size;
  }
}

// Update scrollback from input
export function updateScrollbackFromInput(value) {
  const size = parseInt(value);
  if (size >= terminalSettings.MIN_SCROLLBACK && size <= terminalSettings.MAX_SCROLLBACK) {
    if (terminalSettings.updateScrollback(size)) {
      updateScrollbackDisplay(size);
      const slider = document.getElementById('scrollback-slider');
      if (slider) slider.value = size;
    }
  } else {
    showToast(`Scrollback must be between ${terminalSettings.MIN_SCROLLBACK} and ${terminalSettings.MAX_SCROLLBACK} lines`);
    // Reset input to current value
    const current = terminalSettings.getTerminalSettings().scrollback;
    const input = document.getElementById('scrollback-input');
    if (input) input.value = current;
  }
}

// Apply preset
export function applyPreset(preset) {
  let fontSize, scrollback;
  
  switch (preset) {
    case 'small':
      fontSize = 12;
      scrollback = 1000;
      break;
    case 'medium':
      fontSize = 14;
      scrollback = 2000;
      break;
    case 'large':
      fontSize = 16;
      scrollback = 3000;
      break;
    case 'max':
      fontSize = 18;
      scrollback = 5000;
      break;
    default:
      return;
  }
  
  // Apply both settings
  terminalSettings.updateFontSize(fontSize);
  terminalSettings.updateScrollback(scrollback);
  
  // Update UI
  updateFontSizeDisplay(fontSize);
  updateScrollbackDisplay(scrollback);
  
  // Update sliders and inputs
  const fontSlider = document.getElementById('font-size-slider');
  const scrollbackSlider = document.getElementById('scrollback-slider');
  const scrollbackInput = document.getElementById('scrollback-input');
  
  if (fontSlider) fontSlider.value = fontSize;
  if (scrollbackSlider) scrollbackSlider.value = scrollback;
  if (scrollbackInput) scrollbackInput.value = scrollback;
  
  showToast(`Applied ${preset} preset`);
}

// Update font size display
function updateFontSizeDisplay(size) {
  const displays = ['settings-font-size-display', 'font-size-display', 'grid-font-size-display'];
  displays.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = `${size}px`;
    }
  });
}

// Update scrollback display
function updateScrollbackDisplay(size) {
  const display = document.getElementById('settings-scrollback-display');
  if (display) {
    display.textContent = `${size} lines`;
  }
}

// Load current tmux config
export async function loadCurrentTmuxConfig() {
  try {
    const response = await fetch('/api/tmux-config');
    const data = await response.json();
    
    const textarea = document.getElementById('tmux-config-textarea');
    if (textarea) {
      textarea.value = data.config;
      showToast('Current tmux configuration loaded');
    }
  } catch (error) {
    console.error('Error loading tmux config:', error);
    showToast('Failed to load tmux configuration');
  }
}

// Apply tmux config
export async function applyTmuxConfig() {
  const textarea = document.getElementById('tmux-config-textarea');
  const config = textarea?.value?.trim();
  
  if (!config) {
    showToast('Please enter a tmux configuration');
    return;
  }
  
  try {
    const response = await fetch('/api/tmux-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ config })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showToast(`Configuration applied to ${data.sessions} sessions`);
    } else {
      showToast(data.error || 'Failed to apply configuration');
    }
  } catch (error) {
    console.error('Error applying tmux config:', error);
    showToast('Failed to apply tmux configuration');
  }
}

// Reset tmux config to default
export async function resetTmuxConfig() {
  try {
    // Load the default config from the project
    const response = await fetch('/.tmux.conf');
    const defaultConfig = await response.text();
    
    const textarea = document.getElementById('tmux-config-textarea');
    if (textarea) {
      textarea.value = defaultConfig;
      showToast('Reset to default configuration');
    }
  } catch (error) {
    console.error('Error resetting tmux config:', error);
    showToast('Failed to reset configuration');
  }
}

// Export for window object
export const settings = {
  openSettings,
  closeSettings,
  updateFontSizeFromSlider,
  updateScrollbackFromSlider,
  updateScrollbackFromInput,
  increaseFontSize,
  decreaseFontSize,
  applyPreset,
  initializeSettings,
  loadCurrentTmuxConfig,
  applyTmuxConfig,
  resetTmuxConfig
};