// Application constants

module.exports = {
  // Default values
  DEFAULT_CUBICLE_COUNT: 3,
  MAX_CUBICLE_COUNT: 10,
  DEFAULT_TERMINAL_COLS: 80,
  DEFAULT_TERMINAL_ROWS: 30,
  
  // File paths
  PROJECTS_FILE: '.claude-projects.json',
  AI_README_FILE: '.AI_README',
  
  // Session naming
  AI_OFFICE_SESSION_PREFIX: 'ai-office-',
  
  // Timeouts
  WEBSOCKET_HEARTBEAT_INTERVAL: 30000,
  AUTO_ACCEPT_INTERVAL: 2000,
  
  // Terminal settings
  TERMINAL_THEME: {
    background: '#1a1b26',
    foreground: '#a9b1d6'
  },
  
  // Grid layout
  MOBILE_BREAKPOINT: 768,
  
  // Error messages
  ERROR_PROJECT_NOT_FOUND: 'Project not found',
  ERROR_AI_OFFICE_NOT_FOUND: 'AI Office not found',
  ERROR_INVALID_PATH: 'Invalid path: directory traversal not allowed',
  ERROR_SESSION_EXISTS: 'Session name already exists'
};