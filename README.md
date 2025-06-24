![image](https://github.com/user-attachments/assets/07675a38-1e9a-4421-90eb-90126f1969af)

# Multipass - Terminal UI for AI

A flexible terminal-based interface for working with any command-line AI assistant (Claude, OpenAI CLI, or custom LLMs). Multipass provides isolated workspaces called "AI Offices" with multiple "cubicles" for experimenting with AI-assisted development.

## The AI Office Concept

Multipass is based on an "AI Office" model - a workspace isolation pattern where each project gets its own AI Office containing multiple "cubicles" (isolated Git copies). This allows AI assistants to experiment freely without affecting your main codebase, similar to how developers work in feature branches but with complete filesystem isolation. Each cubicle can be assigned different AI roles (frontend specialist, backend engineer, QA tester) working simultaneously on the same project, with changes synced back to the parent only when you're ready. The result is a safe playground for AI-driven development where mistakes are contained, experiments are encouraged, and multiple AI perspectives can collaborate without conflicts.

## Notes (Please Read!)
### On Functionality
- Works best with projects that have a github repository to clone (additional support may be implemented if requested)
- Make sure tmux is installed
- No Windows support (use WSL)
- ⚠️ **SECURITY WARNING**: This application has **NO AUTHENTICATION** and provides **FULL TERMINAL ACCESS** to your system. Only run this locally or behind a secure VPN/Tailscale connection. **NEVER** expose this to the public internet.

### On Roles
- After selecting a role in a cubicle, request the model read .AI_README file in the parent directory - its not always picked up
- Unless .AI_README has been consumed, the model may attempt to escape cubicle - do monitor execution <3

## Features

****

- **LLM Agnostic**: Works with any terminal-based AI assistant
- **AI Office**: Create isolated workspaces with multiple cubicles for each project
- **Project Management**: Organize different projects with their own terminal sessions
- **Remote Sessions**: Access your AI sessions from anywhere via web browser
- **Session Persistence**: Terminal sessions persist across connections
- **Quick Commands**: Customizable buttons for common commands
- **Multi-Terminal View**: Work with multiple AI sessions simultaneously

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SvetimFM/multipass-ai-terminal.git
   cd multipass-ai-terminal
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment example and configure:
   ```bash
   cp env.example .env
   ```

4. Edit `.env` to set your preferences:
   ```bash
   PORT=3000                    # Server port
   HOST=127.0.0.1              # Use 127.0.0.1 for local only
   SHELL=/bin/bash             # Your preferred shell
   DEFAULT_WORKSPACE=$HOME/projects  # Where to store projects
   ```

5. Start the server:
   ```bash
   npm start     # Production mode
   # or
   npm run dev   # Development mode with hot reload
   ```

6. Open http://localhost:3000 in your browser


---

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- tmux (required for session persistence)
- git (required for AI Office functionality)
- Unix-like operating system (Linux, macOS, WSL on Windows)

## Usage

### Projects
- Click "Add Project Folder" to add a new project
- Each project can have its own AI Office with multiple cubicles

### AI Office
- Create isolated workspaces for AI experimentation
- Each cubicle is an independent copy of your project
- Changes in cubicles don't affect the main project
- Sync cubicles with parent project when needed

### Sessions
- Create new terminal sessions for any project
- Sessions persist even if you close the browser
- Access sessions from multiple devices

## Configuration
![image](https://github.com/user-attachments/assets/e67fcd23-934a-46c0-b8f8-f45e5d1546eb)


### Configuring Your AI Assistant

Edit `src/utils/constants.js` and find the `LLM_CONFIG` section to configure your AI assistant:

```javascript
LLM_CONFIG: {
  default: 'custom',  // Change this to match your AI assistant key below
  llms: {
    custom: {
      name: 'Your AI Assistant',     // Display name in the UI
      command: 'your-ai-command',    // Terminal command to launch your AI
      sessionPrefix: 'ai-',          // Prefix for session names
      exitSequence: '\x03',          // Key sequence to exit (e.g., '\x03' = Ctrl+C)
      exitDelay: 50                  // Delay in ms after sending exit sequence
    },
    // Example configurations included:
    // - claude: Uses 'claude' command, requires Ctrl+C twice to exit
    // - openai: Uses 'openai' command
    // - ollama: Uses 'ollama run llama2' command
  }
}
```

#### Adding Your Own AI Assistant

1. Add a new entry in the `llms` object
2. Set `command` to whatever terminal command launches your AI
3. Set `exitSequence` based on how your AI exits:
   - `'\x03'` = Ctrl+C (most common)
   - `'\x03\x03'` = Ctrl+C twice (for Claude)
   - `'\x04'` = Ctrl+D
   - `'exit\n'` = types "exit" and Enter
4. Change `default` to your AI's key name

### Customizing AI Assistant & Quick Command Buttons

The buttons that appear in the terminal interface are fully customizable. You can edit them in two ways:

1. **Through the UI**: Click the settings icon (⚙️) and look for "AI Assistant & Quick Command Buttons"
2. **Edit the config file**: Edit `config/buttons.config.js` to customize buttons directly

```javascript
module.exports = {
  // AI Assistant buttons
  ai: {
    start: {
      label: 'AI Assistant',        // Button text
      mobileLabel: '🤖 AI',        // Mobile button text
      command: 'claude',            // Command to launch AI (optional, defaults to LLM_CONFIG)
      className: 'bg-blue-600',     // Tailwind CSS classes
      title: 'Start AI Assistant'   // Tooltip
    },
    exit: {
      label: 'Exit AI',
      mobileLabel: '🛑 Exit',
      exitSequence: '\\x03\\x03',    // Exit sequence (optional, defaults to LLM_CONFIG)
      className: 'bg-red-600',
      title: 'Exit AI Assistant'
    }
  },
  
  // Quick command buttons
  quickCommands: [
    {
      label: 'git status',
      command: 'git status\n',      // Command to send to terminal
      className: 'bg-gray-600',
      title: 'Show git status'
    },
    // Add your own commands here...
  ]
}
```

#### Button Configuration Options

**For AI buttons:**
- **label**: Text displayed on the button
- **command** (start button): Override the AI command (optional, defaults to LLM_CONFIG)
- **exitSequence** (exit button): Override the exit sequence (optional, defaults to LLM_CONFIG)
- **className**: Tailwind CSS classes for styling
- **title**: Tooltip text shown on hover
- **mobileLabel**: Alternative text for mobile view (optional)

**For Quick Command buttons:**
- **label**: Text displayed on the button
- **command**: The exact command sent to the terminal (include `\n` for Enter)
- **className**: Tailwind CSS classes for styling
- **title**: Tooltip text shown on hover
- **mobileLabel**: Alternative text for mobile view (optional)

---

## Environment Variables

Create a `.env` file in the root directory with these variables:

```bash
# Server Configuration
PORT=3000                    # Port to run the server on
HOST=127.0.0.1              # Host to bind to (127.0.0.1 for local only)
SHELL=/bin/bash             # Shell to use for terminal sessions

# Workspace Configuration
DEFAULT_WORKSPACE=$HOME/projects  # Default directory for new projects

# Optional: AI Assistant Configuration
DEFAULT_LLM=claude          # Default LLM to use (claude, openai, etc.)

# Session Configuration (optional)
SESSION_TIMEOUT=86400       # Session timeout in seconds (default: 24 hours)
MAX_SESSIONS=50            # Maximum concurrent sessions
```

## Security Considerations

### ⚠️ Critical Security Information

1. **No Authentication**: This application provides unrestricted terminal access to anyone who can reach the web interface
2. **Full System Access**: Users have the same permissions as the process running the server
3. **Session Persistence**: Terminal sessions remain active even after disconnection

### Recommended Deployment Options

#### Option 1: Local Only (Recommended)
```bash
# In your .env file
HOST=127.0.0.1  # Only accessible from localhost
PORT=3000
```

#### Option 2: Tailscale (Secure Remote Access)
1. Install Tailscale: https://tailscale.com/download
2. Set up your Tailscale network
3. Configure Multipass to listen on your Tailscale IP:
   ```bash
   # In your .env file
   HOST=0.0.0.0  # Listen on all interfaces
   PORT=3000
   ```
4. Access via your Tailscale network: `http://your-machine-name:3000`

#### Option 3: VPN Access
- Deploy behind a corporate VPN or WireGuard
- Ensure the VPN is properly configured and secured

### Never Do This
- ❌ Don't expose to the public internet
- ❌ Don't run with root/sudo privileges
- ❌ Don't use on shared/multi-user systems without proper isolation

## Troubleshooting

### Common Issues

1. **"tmux: command not found"**
   - Install tmux: `sudo apt install tmux` (Ubuntu/Debian) or `brew install tmux` (macOS)

2. **"Permission denied" errors**
   - Ensure the user running the server has write permissions to the workspace directory
   - Check that the shell specified in `.env` is executable

3. **WebSocket connection failures**
   - Check that the PORT specified in `.env` is not already in use
   - Ensure your firewall allows WebSocket connections

4. **Sessions not persisting**
   - Verify tmux is installed and running
   - Check that `multipass-sessions.json` is writable

### Getting Help

- Check existing issues: https://github.com/SvetimFM/multipass-ai-terminal/issues
- Join discussions: https://github.com/SvetimFM/multipass-ai-terminal/discussions

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## Acknowledgments

- Built with [xterm.js](https://github.com/xtermjs/xterm.js) for terminal emulation
- Uses [node-pty](https://github.com/microsoft/node-pty) for pseudo-terminal support
- Inspired by the need for better AI-assisted development workflows and inhuman office design

## License

GPL v2.0 - See [LICENSE](LICENSE) file for details
