import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { WebSocketService } from './services/websocket.service';

const PORT = parseInt(process.env.PORT || '3010');
const WS_PORT = parseInt(process.env.WS_PORT || '3011');

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`=� HTTP Server running on port ${PORT}`);
  console.log(`< Environment: ${process.env.NODE_ENV}`);
});

// Start WebSocket server
const wsService = new WebSocketService(WS_PORT);
console.log(`= WebSocket Server running on port ${WS_PORT}`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing servers');
  server.close(() => {
    console.log('HTTP server closed');
  });
  wsService.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing servers');
  server.close(() => {
    console.log('HTTP server closed');
  });
  wsService.close();
  process.exit(0);
});