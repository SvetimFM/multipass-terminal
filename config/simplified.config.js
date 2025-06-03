// Simplified configuration - removing overengineering
module.exports = {
  // Server settings
  server: {
    port: process.env.PORT || 9999,
    host: process.env.HOST || 'localhost'
  },

  // AI command - directly use the command without abstraction
  aiCommand: process.env.AI_COMMAND || 'claude',

  // Storage
  storage: {
    projectsFile: './projects.json',
    aiReadmeFile: '.AI_README'
  },

  // UI defaults
  ui: {
    defaultCubicleCount: 4,
    maxCubicleCount: 9
  },

  // Terminal defaults
  terminal: {
    cols: 80,
    rows: 30,
    fontSize: 12
  },

  // Simple feature flags
  features: {
    autoAccept: false,
    enableMobile: true
  }
};