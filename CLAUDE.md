# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Start the server (production)
npm start

# Start with hot reload (development)
npm run dev

# The server runs on http://localhost:3000 by default
```

## High-Level Architecture

Multipass is a terminal-based interface for AI assistants that provides isolated workspaces ("AI Offices" with "cubicles") for experimenting with AI-assisted development.

### Core Architecture Concepts

1. **Client-Server Model with WebSockets**
   - Express server (`multipass-refactored.js`) handles HTTP and WebSocket connections
   - WebSockets provide real-time terminal communication between browser and server
   - Uses `node-pty` to spawn pseudo-terminals and `tmux` for session persistence

2. **AI Office/Cubicle System**
   - Each project can have an "AI Office" containing multiple isolated "cubicles"
   - Cubicles are Git-based copies of the project for safe AI experimentation
   - Changes in cubicles are isolated from the main project until explicitly synced
   - Managed by `src/services/aiOffice.js` with Git operations in `src/utils/gitOperations.js`

3. **Frontend Module System**
   - Pure vanilla JavaScript with ES6 modules (no framework dependencies)
   - Main entry point: `src/public/js/app.js`
   - Core modules in `src/public/js/modules/` handle specific features:
     - `terminal.js`: Terminal interaction and xterm.js integration
     - `aiOffice.js`: Grid view and cubicle terminal management
     - `projects.js`: Project list and management
     - `state.js`: Global state management

4. **Session Management**
   - Terminal sessions persist using `tmux` (survive browser disconnections)
   - Session metadata stored in `.claude-sessions.json`
   - Multiple terminals can be viewed simultaneously in grid layout

### Key Configuration Points

- **LLM Configuration**: `src/utils/constants.js` contains LLM settings and app defaults
- **AI Modes**: `config/ai-modes.js` defines different AI personality modes (Frontend Dev, Backend Dev, etc.)
- **Environment Variables**: Set in `.env` file (PORT, HOST, SHELL)

### Important Implementation Details

- WebSocket protocol for terminal data: Uses binary messages for efficiency
- Terminal resize handling: Synchronized between frontend and backend via WebSocket
- File browsing: RESTful API endpoints in `src/routes/browse.js`
- Mobile support: Responsive design with touch-optimized controls

When modifying the codebase, maintain the modular structure and ensure WebSocket connections are properly managed to prevent memory leaks.