// Global state management

export const state = {
  // Terminal state
  currentTerminal: null,
  currentWs: null,
  currentPath: null,
  cubicleTerminals: new Map(),
  cubicleWebSockets: new Map(),
  fitAddon: null,
  
  // UI state
  resizeListener: null,
  currentAIOfficeProject: null,
  
  // Settings
  terminalSettings: null,
  
  // LLM Configuration
  llmConfig: {
    name: 'Claude',
    command: 'claude',
    exitSequence: '\x03\x03',
    exitDelay: 50
  },
  
  // Constants
  DEFAULT_CUBICLE_COUNT: 3,
  MAX_CUBICLE_COUNT: 10
};

// State setters
export function setState(key, value) {
  if (key in state) {
    state[key] = value;
  }
}

export function getState(key) {
  return state[key];
}