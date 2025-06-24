// Button Configuration for Multipass Terminal
// This file controls the quick command buttons that appear below the terminal

module.exports = {
  // AI Assistant Buttons
  // These buttons control your AI assistant interaction
  ai: {
    // Button to start the AI assistant
    start: {
      label: 'AI Assistant',        // Display text on button
      mobileLabel: '🤖 AI',        // Display text on mobile button
      command: null,                // null = uses the command from LLM_CONFIG
      className: 'bg-blue-600',     // CSS classes for styling
      title: 'Start AI Assistant'   // Tooltip text
    },
    
    // Button to exit the AI assistant
    exit: {
      label: 'Exit AI',             // Display text on button
      mobileLabel: '🛑 Exit',       // Display text on mobile button
      exitSequence: '\x03\x03',     // Default: Ctrl+C twice
      className: 'bg-red-600',      // CSS classes for styling
      title: 'Exit AI Assistant'    // Tooltip text
    }
  },
  
  // Quick Command Buttons
  // These buttons send predefined commands to the terminal
  // You can add, remove, or modify these as needed
  quickCommands: [
    {
      label: 'ls -la',
      command: 'ls -la\n',
      className: 'bg-gray-600',
      title: 'List files with details'
    },
    {
      label: 'pwd',
      command: 'pwd\n',
      className: 'bg-gray-600',
      title: 'Print working directory'
    },
    {
      label: 'git status',
      command: 'git status\n',
      className: 'bg-gray-600',
      title: 'Show git status'
    },
    {
      label: 'git log',
      command: 'git log --oneline -10\n',
      className: 'bg-gray-600',
      title: 'Show recent git commits'
    },
    {
      label: 'npm run',
      command: 'npm run\n',
      className: 'bg-gray-600',
      title: 'List npm scripts'
    },
    {
      label: 'clear',
      command: 'clear\n',
      className: 'bg-gray-600',
      title: 'Clear terminal screen'
    }
  ],
  
  // Utility Buttons
  // These buttons perform special actions
  utilityButtons: {
    copy: {
      label: '📋 Copy',
      className: 'bg-green-600',
      title: 'Copy selected text (Ctrl+C)'
    },
    paste: {
      label: '📝 Paste',
      className: 'bg-green-600',
      title: 'Paste from clipboard (Ctrl+V)'
    },
    shiftTab: {
      label: '⇧ Tab',
      command: '\x1b[Z',
      className: 'bg-purple-600',
      title: 'Send Shift+Tab'
    },
    autoAccept: {
      label: 'Auto-Accept',
      className: 'bg-gray-600',
      title: 'Toggle auto-accept mode'
    }
  },
  
  // Mobile-specific settings
  mobile: {
    showHelpText: true,
    helpText: 'Tip: Long press command buttons to copy'
  }
};