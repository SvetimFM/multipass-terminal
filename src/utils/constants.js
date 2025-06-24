// Application constants
module.exports = {
  // Default values
  DEFAULT_CUBICLE_COUNT: 4,
  MAX_CUBICLE_COUNT: 9,
  DEFAULT_TERMINAL_COLS: 80,
  DEFAULT_TERMINAL_ROWS: 30,
  
  // File paths
  PROJECTS_FILE: './multipass-projects.json',
  AI_README_FILE: '.AI_README',
  
  // Session naming
  AI_OFFICE_SESSION_PREFIX: 'ai-office-',
  
  // Timeouts
  WEBSOCKET_HEARTBEAT_INTERVAL: 30000,
  AUTO_ACCEPT_INTERVAL: 2000,
  COMMAND_DEBOUNCE_DELAY: 50,
  RESIZE_DEBOUNCE_DELAY: 100,
  
  // Terminal settings
  TERMINAL_THEME: {
    background: '#1a1b26',
    foreground: '#a9b1d6'
  },
  TERMINAL_FONT_SIZE: 12,
  TERMINAL_FONT_FAMILY: 'Consolas, "Courier New", monospace',
  TERMINAL_CURSOR_BLINK: true,
  
  // Grid layout
  MOBILE_BREAKPOINT: 768,
  MAX_GRID_SIZE: 9,
  DEFAULT_GRID_SIZE: 4,
  
  // Error messages
  ERROR_PROJECT_NOT_FOUND: 'Project not found',
  ERROR_AI_OFFICE_NOT_FOUND: 'AI Office not found',
  ERROR_INVALID_PATH: 'Invalid path: directory traversal not allowed',
  ERROR_SESSION_EXISTS: 'Session name already exists',
  
  // Git defaults
  DEFAULT_GIT_REPO: process.env.DEFAULT_GIT_REPO || '',
  DEFAULT_GIT_BRANCH: 'main',
  GIT_CLONE_DEPTH: 1,
  
  // WebSocket events
  WS_EVENTS: {
    TERMINAL_DATA: 'terminal-data',
    TERMINAL_RESIZE: 'resize',
    TERMINAL_CLOSE: 'close',
    ERROR: 'error'
  },
  
  // UI Messages
  UI_MESSAGES: {
    COPY_SUCCESS: 'Copied to clipboard!',
    COPY_FAILURE: 'Failed to copy to clipboard',
    PASTE_FAILURE: 'Failed to paste from clipboard',
    CONNECTION_ERROR: 'WebSocket connection error',
    SESSION_CREATED: 'Session created successfully',
    SESSION_REMOVED: 'Session removed successfully'
  },
  
  // AI command
  AI_COMMAND: process.env.AI_COMMAND || 'claude',
  
  // LLM Configuration
  // To add your own AI assistant:
  // 1. Add a new entry in the 'llms' object below
  // 2. Set 'command' to the terminal command that launches your AI
  // 3. Set 'exitSequence' to the key combination that exits your AI (e.g., '\x03' for Ctrl+C)
  // 4. Change 'default' to your preferred AI assistant
  LLM_CONFIG: {
    default: 'custom',  // Change this to your preferred LLM
    llms: {
      custom: {
        name: 'Your AI Assistant',  // Display name for UI
        command: 'your-ai-command',  // Command to launch your AI in terminal
        sessionPrefix: 'ai-',        // Prefix for session names
        exitSequence: '\x03',        // Key sequence to exit (default: Ctrl+C)
        exitDelay: 50                // Delay in ms after sending exit sequence
      },
      // Example configurations:
      claude: {
        name: 'Claude',
        command: 'claude',
        sessionPrefix: 'claude-',
        exitSequence: '\x03\x03',    // Claude requires Ctrl+C twice
        exitDelay: 50
      },
      openai: {
        name: 'OpenAI CLI',
        command: 'openai',
        sessionPrefix: 'openai-',
        exitSequence: '\x03',
        exitDelay: 50
      },
      ollama: {
        name: 'Ollama',
        command: 'ollama run llama2',
        sessionPrefix: 'ollama-',
        exitSequence: '\x03',
        exitDelay: 50
      }
    },
    ui: {
      primaryColor: '#3b82f6',
      dangerColor: '#dc2626'
    }
  }
};