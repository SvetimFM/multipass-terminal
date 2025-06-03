// Global state management

export const state = {
  // Terminal state
  currentTerminal: null,
  currentWs: null,
  currentPath: null,
  cubicleTerminals: new Map(),
  cubicleWebSockets: new Map(),
  
  // UI state
  autoAcceptMode: false,
  gridAutoAcceptMode: false,
  resizeListener: null,
  currentAIOfficeProject: null,
  autoAcceptInterval: null,
  
  // Constants
  AUTO_ACCEPT_INTERVAL: 2000,
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