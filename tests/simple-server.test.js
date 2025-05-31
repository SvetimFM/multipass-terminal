const request = require('supertest');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const API_URL = 'http://localhost:3010';
const WS_URL = 'ws://localhost:3011';
const SERVER_PATH = path.join(__dirname, '..', 'simple-ai-executor.js');

describe('Ship Anywhere Simple Server Tests', () => {
  let serverProcess;
  let sessionId;

  // Start server before tests
  beforeAll((done) => {
    console.log('Starting test server...');
    serverProcess = spawn('node', [SERVER_PATH]);
    
    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
      if (data.toString().includes('Ship Anywhere Server Ready')) {
        setTimeout(done, 1000); // Give it a moment to fully initialize
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });
  });

  // Kill server after tests
  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  describe('HTTP API Tests', () => {
    test('Health check endpoint', async () => {
      const response = await request(API_URL)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('time');
    });

    test('Create session without auth', async () => {
      const response = await request(API_URL)
        .post('/api/sessions')
        .expect(200);
      
      expect(response.body).toHaveProperty('session');
      expect(response.body.session).toHaveProperty('id');
      sessionId = response.body.session.id;
      console.log(`Created session: ${sessionId}`);
    });

    test('List AI providers', async () => {
      const response = await request(API_URL)
        .get('/api/ai/providers')
        .expect(200);
      
      expect(response.body).toHaveProperty('providers');
      expect(Array.isArray(response.body.providers)).toBe(true);
      expect(response.body.providers.length).toBeGreaterThan(0);
      
      const providers = response.body.providers;
      const providerIds = providers.map(p => p.id);
      expect(providerIds).toContain('claude-code');
      expect(providerIds).toContain('echo');
    });

    test('Execute echo command', async () => {
      const response = await request(API_URL)
        .post('/api/ai/execute')
        .send({
          sessionId,
          command: 'test command',
          provider: 'echo'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('task');
      expect(response.body.task).toHaveProperty('id');
      expect(response.body.task).toHaveProperty('command', 'test command');
      expect(response.body.task).toHaveProperty('provider', 'echo');
      expect(response.body.task).toHaveProperty('status', 'running');
    });

    test('Handle missing session', async () => {
      const response = await request(API_URL)
        .post('/api/ai/execute')
        .send({
          sessionId: 'non-existent-session',
          command: 'test',
          provider: 'echo'
        })
        .expect(404);
      
      expect(response.body).toHaveProperty('error', 'Session not found');
    });
  });

  describe('WebSocket Tests', () => {
    let ws;

    beforeEach((done) => {
      ws = new WebSocket(WS_URL);
      ws.on('open', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    test('WebSocket connection', (done) => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      done();
    });

    test('Register session via WebSocket', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'registered') {
          expect(message.payload).toHaveProperty('sessionId', sessionId);
          done();
        }
      });

      ws.send(JSON.stringify({
        type: 'register',
        payload: { sessionId }
      }));
    });

    test('Receive task output via WebSocket', (done) => {
      const outputs = [];
      
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'registered') {
          // Now execute a command
          request(API_URL)
            .post('/api/ai/execute')
            .send({
              sessionId,
              command: 'echo Hello WebSocket',
              provider: 'echo'
            })
            .end();
        } else if (message.type === 'task:output') {
          outputs.push(message.payload);
          
          if (message.payload.content.includes('Hello WebSocket')) {
            expect(outputs.length).toBeGreaterThan(0);
            done();
          }
        }
      });

      // Register first
      ws.send(JSON.stringify({
        type: 'register',
        payload: { sessionId }
      }));
    }, 10000);
  });

  describe('AI Provider Tests', () => {
    test('Execute bash command', async () => {
      const response = await request(API_URL)
        .post('/api/ai/execute')
        .send({
          sessionId,
          command: 'echo "Bash test"',
          provider: 'bash'
        })
        .expect(200);
      
      expect(response.body.task.provider).toBe('bash');
    });

    test('Execute Claude Code simulation', async () => {
      const response = await request(API_URL)
        .post('/api/ai/execute')
        .send({
          sessionId,
          command: 'create a react app',
          provider: 'claude-code'
        })
        .expect(200);
      
      expect(response.body.task.provider).toBe('claude-code');
    });
  });
});

// Run tests if called directly
if (require.main === module) {
  const jest = require('jest');
  jest.run(['--testPathPattern=simple-server.test.js']);
}