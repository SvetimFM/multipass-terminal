# Multipass - Terminal for AI

A flexible terminal-based interface for working with any command-line AI assistant (Claude, OpenAI CLI, or custom LLMs). Multipass provides isolated workspaces called "AI Offices" with multiple "cubicles" for experimenting with AI-assisted development.

## Features

- **LLM Agnostic**: Works with any terminal-based AI assistant
- **AI Office**: Create isolated workspaces with multiple cubicles for each project
- **Project Management**: Organize different projects with their own terminal sessions
- **Remote Sessions**: Access your AI sessions from anywhere via web browser
- **Session Persistence**: Terminal sessions persist across connections
- **Quick Commands**: Customizable buttons for common commands
- **Multi-Terminal View**: Work with multiple AI sessions simultaneously

## Configuration

Edit `config/llm.config.js` to configure your preferred AI assistant:

```javascript
module.exports = {
  default: 'claude', // Change to your preferred LLM
  
  llms: {
    claude: {
      name: 'Claude',
      command: 'claude',
      sessionPrefix: 'claude-',
      exitSequence: '\x03\x03', // Ctrl+C twice
      exitDelay: 50
    },
    // Add your custom LLM configuration here
  }
}
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your LLM in `config/llm.config.js`
4. Start the server:
   ```bash
   npm start
   ```
5. Open http://localhost:3000 in your browser

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

## Environment Variables

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `SHELL`: Shell to use for terminals (default: /bin/bash)

## Security

- Sessions are isolated per project
- No authentication by default (add your own if needed)
- Runs with the permissions of the server process

## License

MIT