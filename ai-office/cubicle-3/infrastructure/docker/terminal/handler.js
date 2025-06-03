const express = require('express');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Initialize AWS clients
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
const snsClient = new SNSClient({});

// Environment variables
const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/app/workspace';
const LOG_DIR = process.env.LOG_DIR || '/app/logs';
const METADATA_TABLE_NAME = process.env.METADATA_TABLE_NAME;
const PROJECT_BUCKET_NAME = process.env.PROJECT_BUCKET_NAME;
const NOTIFICATION_TOPIC_ARN = process.env.NOTIFICATION_TOPIC_ARN;

// Initialize Express app
const app = express();
app.use(express.json());

// Store active sessions
const sessions = new Map();

class TerminalSession {
  constructor(sessionId, userId, projectId) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.projectId = projectId;
    this.workDir = path.join(WORKSPACE_DIR, sessionId);
    this.process = null;
    this.output = [];
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.clients = new Set();
  }

  async initialize() {
    // Create working directory
    await fs.mkdir(this.workDir, { recursive: true });
    
    // Download project files from S3 if projectId provided
    if (this.projectId) {
      await this.syncProjectFiles();
    }

    // Start bash process
    this.process = spawn('bash', [], {
      cwd: this.workDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        USER: 'aioffice',
        HOME: '/home/aioffice',
        PATH: process.env.PATH,
      },
      shell: false,
    });

    // Handle process output
    this.process.stdout.on('data', (data) => {
      const output = data.toString();
      this.output.push({ type: 'stdout', data: output, timestamp: Date.now() });
      this.broadcast({ type: 'output', data: output });
      this.lastActivity = Date.now();
    });

    this.process.stderr.on('data', (data) => {
      const output = data.toString();
      this.output.push({ type: 'stderr', data: output, timestamp: Date.now() });
      this.broadcast({ type: 'error', data: output });
      this.lastActivity = Date.now();
    });

    this.process.on('exit', (code, signal) => {
      this.broadcast({ type: 'exit', code, signal });
      this.cleanup();
    });

    // Update session status in DynamoDB
    await this.updateStatus('active');
  }

  async syncProjectFiles() {
    try {
      const prefix = `${this.userId}/${this.projectId}/`;
      const command = new GetObjectCommand({
        Bucket: PROJECT_BUCKET_NAME,
        Key: `${prefix}.manifest`,
      });

      const response = await s3Client.send(command);
      const manifest = JSON.parse(await response.Body.transformToString());

      // Download each file
      for (const file of manifest.files || []) {
        const fileKey = `${prefix}${file.path}`;
        const filePath = path.join(this.workDir, file.path);
        
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        const fileResponse = await s3Client.send(new GetObjectCommand({
          Bucket: PROJECT_BUCKET_NAME,
          Key: fileKey,
        }));

        const content = await fileResponse.Body.transformToByteArray();
        await fs.writeFile(filePath, content);
      }
    } catch (error) {
      console.error('Failed to sync project files:', error);
    }
  }

  async execute(command) {
    if (!this.process || this.process.killed) {
      throw new Error('Session terminated');
    }

    this.output.push({ type: 'input', data: command, timestamp: Date.now() });
    this.process.stdin.write(command + '\n');
    this.lastActivity = Date.now();

    // Log command execution
    await this.logCommand(command);
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  addClient(ws) {
    this.clients.add(ws);
    
    // Send session info and recent output
    ws.send(JSON.stringify({
      type: 'session-info',
      sessionId: this.sessionId,
      workDir: this.workDir,
    }));

    // Send last 100 lines of output
    const recentOutput = this.output.slice(-100);
    recentOutput.forEach(entry => {
      ws.send(JSON.stringify({
        type: entry.type === 'stdout' ? 'output' : 'error',
        data: entry.data,
      }));
    });
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  async updateStatus(status) {
    try {
      await dynamoClient.send(new PutCommand({
        TableName: METADATA_TABLE_NAME,
        Item: {
          pk: `USER#${this.userId}`,
          sk: `TERMINAL_SESSION#${this.sessionId}`,
          sessionId: this.sessionId,
          userId: this.userId,
          projectId: this.projectId,
          status,
          startTime: this.startTime,
          lastActivity: this.lastActivity,
          workDir: this.workDir,
          ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
        },
      }));
    } catch (error) {
      console.error('Failed to update session status:', error);
    }
  }

  async logCommand(command) {
    try {
      const logEntry = {
        sessionId: this.sessionId,
        userId: this.userId,
        command,
        timestamp: Date.now(),
      };

      // Log to file
      const logFile = path.join(LOG_DIR, `${this.sessionId}.log`);
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');

      // Log to DynamoDB
      await dynamoClient.send(new PutCommand({
        TableName: METADATA_TABLE_NAME,
        Item: {
          pk: `TERMINAL_LOG#${this.sessionId}`,
          sk: `CMD#${Date.now()}`,
          ...logEntry,
          ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        },
      }));
    } catch (error) {
      console.error('Failed to log command:', error);
    }
  }

  async saveWorkspace() {
    try {
      const files = await this.listFiles(this.workDir);
      const manifest = { files: [], savedAt: Date.now() };

      for (const file of files) {
        const relativePath = path.relative(this.workDir, file);
        const content = await fs.readFile(file);
        
        // Upload to S3
        await s3Client.send(new PutObjectCommand({
          Bucket: PROJECT_BUCKET_NAME,
          Key: `${this.userId}/${this.projectId || this.sessionId}/${relativePath}`,
          Body: content,
        }));

        manifest.files.push({
          path: relativePath,
          size: content.length,
          modified: (await fs.stat(file)).mtime.getTime(),
        });
      }

      // Save manifest
      await s3Client.send(new PutObjectCommand({
        Bucket: PROJECT_BUCKET_NAME,
        Key: `${this.userId}/${this.projectId || this.sessionId}/.manifest`,
        Body: JSON.stringify(manifest),
        ContentType: 'application/json',
      }));

      return manifest;
    } catch (error) {
      console.error('Failed to save workspace:', error);
      throw error;
    }
  }

  async listFiles(dir, files = []) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        // Skip node_modules and .git directories
        if (!['node_modules', '.git', '.venv', '__pycache__'].includes(item.name)) {
          await this.listFiles(fullPath, files);
        }
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  async cleanup() {
    try {
      // Kill the process
      if (this.process && !this.process.killed) {
        this.process.kill('SIGTERM');
      }

      // Save workspace if project
      if (this.projectId) {
        await this.saveWorkspace();
      }

      // Update status
      await this.updateStatus('terminated');

      // Clean up workspace
      await fs.rm(this.workDir, { recursive: true, force: true });

      // Notify about session termination
      if (NOTIFICATION_TOPIC_ARN) {
        await snsClient.send(new PublishCommand({
          TopicArn: NOTIFICATION_TOPIC_ARN,
          Subject: 'Terminal Session Terminated',
          Message: JSON.stringify({
            sessionId: this.sessionId,
            userId: this.userId,
            duration: Date.now() - this.startTime,
            outputLines: this.output.length,
          }),
        }));
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    sessions: sessions.size,
    memory: process.memoryUsage(),
  });
});

// Create new terminal session
app.post('/sessions', async (req, res) => {
  try {
    const { userId, projectId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const sessionId = uuidv4();
    const session = new TerminalSession(sessionId, userId, projectId);
    
    await session.initialize();
    sessions.set(sessionId, session);

    res.json({
      sessionId,
      workDir: session.workDir,
      websocketUrl: `/sessions/${sessionId}/ws`,
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Execute command in session
app.post('/sessions/:sessionId/execute', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { command } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await session.execute(command);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to execute command:', error);
    res.status(500).json({ error: 'Failed to execute command' });
  }
});

// Save session workspace
app.post('/sessions/:sessionId/save', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const manifest = await session.saveWorkspace();
    res.json({ manifest });
  } catch (error) {
    console.error('Failed to save workspace:', error);
    res.status(500).json({ error: 'Failed to save workspace' });
  }
});

// Terminate session
app.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await session.cleanup();
    sessions.delete(sessionId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to terminate session:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`Terminal handler listening on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;
  const match = pathname.match(/^\/sessions\/([^\/]+)\/ws$/);
  
  if (match) {
    const sessionId = match[1];
    const session = sessions.get(sessionId);
    
    if (session) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        session.addClient(ws);
        
        ws.on('message', async (message) => {
          try {
            const data = JSON.parse(message);
            
            if (data.type === 'command') {
              await session.execute(data.command);
            }
          } catch (error) {
            console.error('WebSocket message error:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
          }
        });

        ws.on('close', () => {
          session.removeClient(ws);
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          session.removeClient(ws);
        });
      });
    } else {
      socket.destroy();
    }
  } else {
    socket.destroy();
  }
});

// Cleanup inactive sessions periodically
setInterval(async () => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > timeout && session.clients.size === 0) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      await session.cleanup();
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Close server
  server.close();
  
  // Cleanup all sessions
  for (const [sessionId, session] of sessions.entries()) {
    await session.cleanup();
  }
  
  process.exit(0);
});