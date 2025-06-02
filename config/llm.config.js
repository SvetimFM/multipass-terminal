// LLM Configuration
// This file contains settings for different terminal-based LLMs
// Users can modify this to work with any terminal LLM

module.exports = {
  // Default LLM configuration (can be overridden by DEFAULT_LLM env var)
  default: process.env.DEFAULT_LLM || 'claude',
  
  // LLM configurations
  llms: {
    claude: {
      name: 'Claude',
      command: 'claude',
      sessionPrefix: 'claude-',
      exitSequence: '\x03\x03', // Ctrl+C twice
      exitDelay: 50, // ms between exit sequences
    },
    
    // Example configurations for other LLMs
    openai: {
      name: 'OpenAI CLI',
      command: 'openai',
      sessionPrefix: 'openai-',
      exitSequence: '\x03',
      exitDelay: 0,
    },
    
    custom: {
      name: 'Custom LLM',
      command: 'your-llm-command',
      sessionPrefix: 'llm-',
      exitSequence: '\x03',
      exitDelay: 0,
    }
  },
  
  // Storage configuration
  storage: {
    projectsFile: '.multipass-projects.json'
  },
  
  // UI configuration
  ui: {
    appTitle: 'Multipass - Terminal for AI',
    sessionPlaceholder: 'ai-session',
    defaultCubicleCount: 3,
    maxCubicleCount: 10
  }
};