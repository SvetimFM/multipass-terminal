# Ship Anywhere Mobile Client

A mobile-optimized web client for controlling AI coding assistants remotely.

## Features

- 📱 **Mobile-First Design**: Optimized for vertical mobile experience
- 🔄 **Real-time Updates**: Live AI output streaming via WebSocket
- 💬 **Interactive Flow**: Get notifications when AI needs input
- 🎯 **Quick Actions**: Common commands at your fingertips
- 📲 **PWA Support**: Install as a mobile app
- 🔌 **Offline Capable**: Basic functionality works offline

## Quick Start

### 1. Start the Server

Make sure the Ship Anywhere server is running:
```bash
cd ship_anywhere_serverside
npm run dev
```

### 2. Serve the Client

You can serve the client files using any static web server:

```bash
# Using Python
cd client
python -m http.server 8080

# Using Node.js
npx serve .

# Using VS Code Live Server
# Right-click index.html → "Open with Live Server"
```

### 3. Open on Mobile

1. Open your phone's browser
2. Navigate to `http://your-computer-ip:8080`
3. The app will automatically create a demo account

### 4. Install as PWA (Optional)

On mobile browsers, you can install Ship Anywhere as an app:
- **iOS**: Tap Share → "Add to Home Screen"
- **Android**: Menu → "Add to Home Screen" or "Install App"

## How It Works

1. **Send Commands**: Type or select a command to run on your AI agent
2. **Real-time Output**: See the AI's output stream in real-time
3. **Interactive Prompts**: When AI needs input, you'll get a notification
4. **Quick Responses**: Use quick action buttons or type custom responses
5. **Complete Tasks**: AI continues with your input until task completion

## Key Differences from the Shared Example

The example you shared was a "task approval" interface (swipe to approve/reject pre-made tasks). Our implementation provides the actual interactive command execution flow:

| Feature | Shared Example | Our Implementation |
|---------|---------------|-------------------|
| Purpose | Approve/reject AI suggestions | Execute commands interactively |
| Flow | Swipe cards | Real-time command execution |
| AI Interaction | Pre-made tasks | Live AI pause/response |
| Output | Task status | Streaming console output |
| Use Case | Task management | Remote AI control |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Mobile Web  │────▶│   Server    │────▶│ AI Agent    │
│    (PWA)    │◀────│  Port 3010  │◀────│(Claude/etc) │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      │ 1. Send command    │ 2. Start AI       │
      │                    │ 3. Stream output ─▶│
      │◀─ 4. Show output   │                    │
      │                    │ 5. AI pauses ─────▶│
      │◀─ 6. Notification  │                    │
      │ 7. Your response ─▶│ 8. Forward ───────▶│
      │                    │ 9. AI continues ──▶│
```

## Customization

### Change API Endpoints

Edit `app.js`:
```javascript
const API_URL = 'https://your-server.com';
const WS_URL = 'wss://your-server.com/ws';
```

### Add More Quick Commands

Edit the quick commands array in `app.js`:
```javascript
['npm test', 'git status', 'npm run build', 'your-command-here']
```

### Customize Themes

The app uses Tailwind CSS. Modify classes in `app.js` to change colors and styling.

## Security Notes

- Demo mode creates temporary accounts
- For production, implement proper authentication
- Use HTTPS/WSS for secure connections
- Add API rate limiting and validation

## Browser Support

- ✅ Modern mobile browsers (iOS Safari, Chrome, Firefox)
- ✅ Desktop browsers (Chrome, Firefox, Safari, Edge)
- ⚠️ Requires WebSocket support
- ⚠️ PWA features require HTTPS in production