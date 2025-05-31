#!/usr/bin/env node

// Collaborative Coding Sessions - Code together with AI and humans
// Real-time collaborative editing with AI assistance

const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Active coding sessions
const sessions = new Map();

// Session class
class CodingSession {
  constructor(id, name, creator) {
    this.id = id;
    this.name = name;
    this.creator = creator;
    this.participants = new Map();
    this.aiAgents = new Map();
    this.files = new Map();
    this.chat = [];
    this.cursors = new Map();
    this.created = new Date();
  }
  
  addParticipant(userId, ws) {
    this.participants.set(userId, {
      id: userId,
      ws,
      name: `User ${userId.slice(0, 4)}`,
      color: this.generateColor(),
      cursor: { line: 0, column: 0 }
    });
  }
  
  addAI(agentId, capabilities) {
    this.aiAgents.set(agentId, {
      id: agentId,
      capabilities,
      active: true,
      lastAction: null
    });
  }
  
  broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    this.participants.forEach((participant, id) => {
      if (id !== excludeId && participant.ws.readyState === 1) {
        participant.ws.send(data);
      }
    });
  }
  
  generateColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3'];
    return colors[this.participants.size % colors.length];
  }
}

// Create new session
router.post('/sessions', (req, res) => {
  const { name, creatorId } = req.body;
  
  const sessionId = uuidv4();
  const session = new CodingSession(sessionId, name || 'Untitled Session', creatorId);
  
  // Add default AI agent
  session.addAI('claude-code', ['code-generation', 'debugging', 'refactoring']);
  
  sessions.set(sessionId, session);
  
  res.json({
    session: {
      id: sessionId,
      name: session.name,
      shareUrl: `http://localhost:8080/collab/${sessionId}`,
      participants: 0,
      aiAgents: 1
    }
  });
});

// Get session details
router.get('/sessions/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    session: {
      id: session.id,
      name: session.name,
      participants: session.participants.size,
      aiAgents: session.aiAgents.size,
      files: Array.from(session.files.keys()),
      created: session.created
    }
  });
});

// List active sessions
router.get('/sessions', (req, res) => {
  const activeSessions = Array.from(sessions.values())
    .filter(s => s.participants.size > 0 || Date.now() - s.created < 3600000) // Active or created within last hour
    .map(s => ({
      id: s.id,
      name: s.name,
      participants: s.participants.size,
      aiAgents: s.aiAgents.size,
      created: s.created
    }));
    
  res.json({ sessions: activeSessions });
});

// AI suggestion endpoint
router.post('/sessions/:sessionId/ai-suggest', async (req, res) => {
  const { code, context, type = 'complete' } = req.body;
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Simulate AI suggestions based on type
  let suggestion;
  
  switch (type) {
    case 'complete':
      suggestion = {
        type: 'completion',
        text: '// TODO: Implement function\n  return result;',
        confidence: 0.92
      };
      break;
      
    case 'refactor':
      suggestion = {
        type: 'refactoring',
        original: code,
        improved: code.replace(/var /g, 'const ').replace(/function/g, 'const'),
        explanation: 'Updated to use modern JavaScript syntax'
      };
      break;
      
    case 'debug':
      suggestion = {
        type: 'debug',
        issue: 'Potential null reference on line 3',
        fix: 'Add null check before accessing property',
        code: `if (obj && obj.property) {\n  // safe to use\n}`
      };
      break;
      
    case 'explain':
      suggestion = {
        type: 'explanation',
        summary: 'This code implements a binary search algorithm',
        details: 'It recursively divides the array in half to find the target value'
      };
      break;
  }
  
  // Broadcast AI suggestion to all participants
  session.broadcast({
    type: 'ai-suggestion',
    payload: suggestion
  });
  
  res.json({ suggestion });
});

// WebSocket server for real-time collaboration
const wss = new WebSocketServer({ port: 3014 });

wss.on('connection', (ws) => {
  let currentSession = null;
  let userId = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join':
          const session = sessions.get(data.sessionId);
          if (session) {
            userId = data.userId || uuidv4();
            currentSession = session;
            session.addParticipant(userId, ws);
            
            // Send session state to new participant
            ws.send(JSON.stringify({
              type: 'session-state',
              payload: {
                files: Array.from(session.files.entries()),
                participants: Array.from(session.participants.values()).map(p => ({
                  id: p.id,
                  name: p.name,
                  color: p.color,
                  cursor: p.cursor
                })),
                chat: session.chat.slice(-50) // Last 50 messages
              }
            }));
            
            // Notify others
            session.broadcast({
              type: 'user-joined',
              payload: {
                userId,
                name: session.participants.get(userId).name,
                color: session.participants.get(userId).color
              }
            }, userId);
          }
          break;
          
        case 'code-change':
          if (currentSession) {
            // Update file content
            currentSession.files.set(data.payload.file, data.payload.content);
            
            // Broadcast to others
            currentSession.broadcast({
              type: 'code-update',
              payload: {
                file: data.payload.file,
                changes: data.payload.changes,
                userId
              }
            }, userId);
          }
          break;
          
        case 'cursor-move':
          if (currentSession && userId) {
            const participant = currentSession.participants.get(userId);
            if (participant) {
              participant.cursor = data.payload;
              currentSession.broadcast({
                type: 'cursor-update',
                payload: {
                  userId,
                  cursor: data.payload
                }
              }, userId);
            }
          }
          break;
          
        case 'chat':
          if (currentSession) {
            const chatMessage = {
              id: uuidv4(),
              userId,
              text: data.payload.text,
              timestamp: new Date()
            };
            
            currentSession.chat.push(chatMessage);
            currentSession.broadcast({
              type: 'chat-message',
              payload: chatMessage
            });
          }
          break;
          
        case 'ai-request':
          if (currentSession) {
            // Simulate AI processing
            setTimeout(() => {
              currentSession.broadcast({
                type: 'ai-response',
                payload: {
                  requestId: data.payload.requestId,
                  response: `AI: I'll help you with "${data.payload.prompt}"`,
                  code: '// AI generated code here'
                }
              });
            }, 1000);
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket error:', error);
    }
  });
  
  ws.on('close', () => {
    if (currentSession && userId) {
      currentSession.participants.delete(userId);
      currentSession.broadcast({
        type: 'user-left',
        payload: { userId }
      });
    }
  });
});

// Export router
module.exports = router;

// Standalone server if run directly
if (require.main === module) {
  const app = express();
  app.use(express.json());
  app.use('/api/collab', router);
  
  const PORT = 3015;
  app.listen(PORT, () => {
    console.log(`👥 Collaborative Coding Server running on port ${PORT}`);
    console.log(`🔌 WebSocket server on port 3014`);
  });
}