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

// Button Configuration Functions
let currentButtonConfig = null;

// Load button configuration into UI
export async function loadButtonConfig() {
  try {
    const response = await fetch('/api/button-config');
    const config = await response.json();
    currentButtonConfig = config;
    
    const container = document.getElementById('button-config-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Display quick commands
    if (config.quickCommands && config.quickCommands.length > 0) {
      config.quickCommands.forEach((button, index) => {
        const buttonEl = createButtonListItem(button, index);
        container.appendChild(buttonEl);
      });
    }
  } catch (error) {
    console.error('Error loading button config:', error);
    showToast('Failed to load button configuration');
  }
}

// Create a button list item for the settings UI
function createButtonListItem(button, index) {
  const div = document.createElement('div');
  div.className = 'flex items-center gap-2 p-2 bg-gray-800 rounded';
  
  div.innerHTML = `
    <div class="flex-1">
      <div class="font-semibold text-sm">${button.label}</div>
      <div class="text-xs text-gray-400 font-mono">${button.command.replace(/\n/g, '\\n')}</div>
    </div>
    <button onclick="window.settings.editButton(${index})" 
            class="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">
      Edit
    </button>
    <button onclick="window.settings.removeButton(${index})" 
            class="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs">
      ✕
    </button>
  `;
  
  return div;
}

// Open button editor
export function editButton(index) {
  if (!currentButtonConfig || !currentButtonConfig.quickCommands[index]) return;
  
  const button = currentButtonConfig.quickCommands[index];
  document.getElementById('button-editor-index').value = index;
  document.getElementById('button-editor-label').value = button.label || '';
  document.getElementById('button-editor-command').value = button.command || '';
  document.getElementById('button-editor-mobile-label').value = button.mobileLabel || '';
  document.getElementById('button-editor-style').value = button.className || 'bg-gray-600';
  document.getElementById('button-editor-tooltip').value = button.title || '';
  document.getElementById('button-editor-title').textContent = 'Edit Button';
  
  document.getElementById('button-editor-modal').classList.remove('hidden');
}

// Add new button
export function addNewButton() {
  document.getElementById('button-editor-index').value = '';
  document.getElementById('button-editor-label').value = '';
  document.getElementById('button-editor-command').value = '';
  document.getElementById('button-editor-mobile-label').value = '';
  document.getElementById('button-editor-style').value = 'bg-gray-600';
  document.getElementById('button-editor-tooltip').value = '';
  document.getElementById('button-editor-title').textContent = 'Add New Button';
  
  document.getElementById('button-editor-modal').classList.remove('hidden');
}

// Save button from editor
export async function saveButtonEditor() {
  const index = document.getElementById('button-editor-index').value;
  const button = {
    label: document.getElementById('button-editor-label').value,
    command: document.getElementById('button-editor-command').value,
    mobileLabel: document.getElementById('button-editor-mobile-label').value || undefined,
    className: document.getElementById('button-editor-style').value,
    title: document.getElementById('button-editor-tooltip').value || undefined
  };
  
  if (!button.label || !button.command) {
    showToast('Label and command are required');
    return;
  }
  
  if (!currentButtonConfig) {
    currentButtonConfig = { quickCommands: [] };
  }
  
  if (index === '') {
    // Add new button
    currentButtonConfig.quickCommands.push(button);
  } else {
    // Update existing button
    currentButtonConfig.quickCommands[parseInt(index)] = button;
  }
  
  await saveButtonConfig();
  closeButtonEditor();
}

// Remove button
export async function removeButton(index) {
  if (!confirm('Remove this button?')) return;
  
  if (currentButtonConfig && currentButtonConfig.quickCommands) {
    currentButtonConfig.quickCommands.splice(index, 1);
    await saveButtonConfig();
  }
}

// Save button configuration to server
async function saveButtonConfig() {
  try {
    const response = await fetch('/api/button-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(currentButtonConfig)
    });
    
    if (response.ok) {
      showToast('Button configuration saved');
      loadButtonConfig();
      
      // Notify terminal module to regenerate buttons
      if (window.terminal && window.terminal.generateQuickCommandButtons) {
        // Update state with new config
        if (window.state) {
          window.state.buttonConfig = currentButtonConfig;
        }
        window.terminal.generateQuickCommandButtons();
      }
    } else {
      showToast('Failed to save configuration');
    }
  } catch (error) {
    console.error('Error saving button config:', error);
    showToast('Failed to save configuration');
  }
}

// Close button editor
export function closeButtonEditor() {
  document.getElementById('button-editor-modal').classList.add('hidden');
}

// Reload button configuration
export async function reloadButtonConfig() {
  await loadButtonConfig();
  showToast('Button configuration reloaded');
}

// Initialize settings UI (update existing function)
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
  
  // Load button configuration
  loadButtonConfig();
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
  resetTmuxConfig,
  // Button configuration functions
  loadButtonConfig,
  editButton,
  addNewButton,
  saveButtonEditor,
  removeButton,
  closeButtonEditor,
  reloadButtonConfig
};