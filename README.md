# Multipass AI Terminal

A web-based terminal management system with per-project AI Offices for remote development. Each project can have its own isolated AI Office with multiple "cubicles" (workspace terminals) for AI-assisted development.

## Features

- **Project Management**: Organize your development projects with dedicated workspaces
- **AI Office**: Create isolated terminal environments for AI development
- **Multiple Cubicles**: Each AI Office can have multiple terminal sessions
- **GitHub Integration**: Clone repositories directly into cubicles
- **Session Management**: Persistent tmux sessions accessible from anywhere
- **Mobile Optimized**: Responsive design works on all devices
- **Auto-Accept Mode**: Automatically accept AI suggestions during development

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment configuration:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` to configure your settings:
   - `PORT`: Server port (default: 9999)
   - `HOST`: Server host (default: 0.0.0.0)
   - `DEFAULT_WORKSPACE`: Default directory for browsing

## Usage

### Starting the Server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### Using the Shell Script

```bash
./start-multipass.sh
```

## Architecture

- **Express.js** server for HTTP API
- **WebSocket** for real-time terminal communication
- **node-pty** for terminal emulation
- **tmux** for persistent session management

## Project Structure

```
.
├── multipass-refactored.js    # Main server file
├── src/
│   ├── public/               # Frontend assets
│   │   ├── css/             # Styles
│   │   ├── js/              # Client-side JavaScript
│   │   └── index.html       # Main UI
│   ├── routes/              # API routes
│   │   ├── browse.js        # File browser
│   │   ├── projects.js      # Project management
│   │   └── sessions.js      # Session management
│   ├── services/            # Business logic
│   │   └── aiOffice.js      # AI Office management
│   └── utils/               # Utilities
│       ├── constants.js     # Application constants
│       └── validation.js    # Input validation
└── start-multipass.sh       # Startup script
```

## Security Note

This application is designed for use on trusted networks (like Tailscale VPN). It does not include authentication by default. Do not expose it to the public internet without adding proper authentication.

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

MIT