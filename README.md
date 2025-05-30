# Ship Anywhere - Server Side

A secure, scalable server for remote command execution across Windows, Linux, and Mac machines. Built with Node.js, Express, WebSocket, and Redis.

## Features

- **Secure WebSocket Communication**: Real-time bidirectional communication between web clients and local agents
- **Multi-Platform Support**: Works on Windows, Linux, and macOS
- **Command Execution Pipeline**: Queue-based command execution with concurrent limits
- **Security First**: Command validation, rate limiting, and sandboxing
- **Subscription Management**: Stripe integration for billing (Free, Basic, Pro tiers)
- **Session Management**: Secure session handling with Redis
- **Real-time Status Updates**: Live agent status and command progress tracking

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Web Client │────▶│   Server    │◀────│Local Agent  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    └─────────────┘
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/signin` - Sign in
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/agents/register` - Register new agent

### Sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions` - List user sessions
- `GET /api/sessions/:id` - Get session details
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/:id/extend` - Extend session

### Commands
- `POST /api/commands/execute` - Execute command
- `GET /api/commands/:id` - Get command details
- `DELETE /api/commands/:id` - Cancel command
- `GET /api/commands/session/:sessionId` - Get session commands
- `GET /api/commands/stats` - Get command statistics

### Agents
- `GET /api/agents` - List user agents
- `GET /api/agents/:id` - Get agent details
- `PUT /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent
- `GET /api/agents/:id/status` - Get agent status

### Billing
- `GET /api/billing/plans` - Get subscription plans
- `POST /api/billing/checkout` - Create checkout session
- `POST /api/billing/portal` - Create billing portal session
- `PUT /api/billing/subscription` - Update subscription
- `POST /api/billing/webhook` - Stripe webhook

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

4. Set up Redis (choose one):
   
   Using Docker Compose (recommended):
   ```bash
   docker-compose up -d
   ```
   
   Or using Docker directly:
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

5. Build the project:
   ```bash
   npm run build
   ```

6. Run development server:
   ```bash
   npm run dev
   ```

## Environment Variables

- `PORT` - HTTP server port (default: 3001)
- `WS_PORT` - WebSocket server port (default: 3002)
- `JWT_SECRET` - Secret for JWT tokens
- `REDIS_URL` - Redis connection URL
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `CORS_ORIGIN` - Allowed CORS origin

## Security Features

- Command validation and sanitization
- Rate limiting per user/tier
- JWT-based authentication
- Secure WebSocket connections
- Command execution timeouts
- Blocked dangerous commands
- Path traversal prevention

## Subscription Tiers

### Free
- 100 commands/day
- 2 concurrent commands
- 1 minute execution time

### Basic ($5/mo)
- 1,000 commands/day
- 5 concurrent commands
- 2 minute execution time
- Priority support

### Pro ($20/mo)
- 10,000 commands/day
- 10 concurrent commands
- 5 minute execution time
- Premium support
- Team collaboration
- API access

## Development

```bash
# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Production Deployment

1. Build the project:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Use process manager (PM2 recommended):
   ```bash
   pm2 start dist/index.js --name ship-anywhere
   ```

4. Set up reverse proxy (nginx/caddy) for SSL

## License

MIT