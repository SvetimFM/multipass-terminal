# Multipass - Terminal for AI with Per-Project AI Offices

Multipass is a web-based terminal management system designed for AI development workflows. It provides project-based organization with the ability to create multiple isolated AI workspaces (cubicles) per project.

## Key Features

### 🗂️ Project Management
- Add and organize multiple project folders
- Each project maintains its own context and settings
- Persistent project storage in `.claude-projects.json`

### 🤖 Per-Project AI Offices
- Create an "AI Office" with multiple cubicles for any project
- Each cubicle is an isolated workspace within the project
- Perfect for running multiple AI agents or experiments in parallel
- Simple setup: just click "Setup AI Office" on any project

### 📺 Three View Modes

1. **Projects View**: Manage your projects and AI Offices
   - Add new project folders via file browser
   - Setup/remove AI Office for each project
   - See at a glance which projects have AI Offices

2. **Sessions View**: Traditional terminal session management
   - Create named tmux sessions for any project
   - Quick access to all active sessions
   - Sessions persist even if you close the browser

3. **AI Offices View**: Consolidated view of all AI Offices
   - See all projects with AI Offices in one place
   - Quick access to individual cubicle terminals
   - "View All Terminals" for grid view of all cubicles in a project

### 🖥️ Terminal Features
- Full xterm.js terminal with tmux backend
- WebSocket-based real-time communication
- Responsive design for mobile, tablet, and desktop
- Grid layout adapts to screen size (1, 2, or 3 columns)

## Installation

```bash
npm install
```

## Usage

Start the server:
```bash
npm run multipass
# or
./multipass.js
```

Access the interface at: `http://100.110.230.98:9999` (or your Tailscale IP)

## How to Use AI Offices

1. **Add a Project**: Click "Add Project Folder" and select a directory
2. **Setup AI Office**: Click "Setup AI Office" on any project
3. **Choose Cubicle Count**: Enter how many cubicles you want (default: 3)
4. **Access Terminals**: 
   - Go to "AI Offices" view to see all offices
   - Click individual cubicles for single terminal
   - Click "View All Terminals" for grid view

## Architecture

### Data Structure
```javascript
// Project with AI Office
{
  id: 'proj-123456',
  name: 'My Project',
  path: '/home/user/projects/my-project',
  aiOffice: {
    enabled: true,
    cubicleCount: 3,
    cubicles: [
      { name: 'cubicle-1', path: '/home/user/projects/my-project/ai-office/cubicle-1' },
      { name: 'cubicle-2', path: '/home/user/projects/my-project/ai-office/cubicle-2' },
      { name: 'cubicle-3', path: '/home/user/projects/my-project/ai-office/cubicle-3' }
    ],
    createdAt: '2024-01-01T00:00:00.000Z'
  }
}
```

### File Structure
```
project-folder/
├── ai-office/           # Created when AI Office is setup
│   ├── cubicle-1/
│   │   └── README.md    # Starter file for cubicle
│   ├── cubicle-2/
│   │   └── README.md
│   └── cubicle-3/
│       └── README.md
└── ... (your project files)
```

### Session Naming
- Regular sessions: `claude-123456` or user-defined
- AI Office sessions: `ai-office-{projectId}-cubicle-{n}`

## Benefits

1. **Organization**: Keep AI experiments organized by project
2. **Isolation**: Each cubicle is independent, preventing conflicts
3. **Parallel Work**: Run multiple AI agents simultaneously
4. **Easy Access**: Quick navigation between projects and cubicles
5. **Persistence**: tmux sessions survive browser refreshes

## Requirements

- Node.js 14+
- tmux
- Unix-like environment (Linux, macOS, WSL)
- Tailscale (for network access)

## Security

- No authentication (designed for Tailscale networks)
- All terminals run with user permissions
- Projects are isolated by directory structure