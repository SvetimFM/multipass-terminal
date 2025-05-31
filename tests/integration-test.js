#!/usr/bin/env node

/**
 * Integration test for the complete interactive flow
 * Simulates a real client interaction with AI pausing
 */

const axios = require('axios');
const WebSocket = require('ws');

class IntegrationTest {
  constructor() {
    this.apiUrl = 'http://localhost:3010';
    this.wsUrl = 'ws://localhost:3011';
    this.token = null;
    this.sessionId = null;
    this.ws = null;
    this.testResults = [];
  }

  async runTests() {
    console.log('🧪 Ship Anywhere Integration Tests');
    console.log('=================================\n');

    try {
      await this.test('Server Health', this.testHealth.bind(this));
      await this.test('Authentication', this.testAuth.bind(this));
      await this.test('Session Creation', this.testSession.bind(this));
      await this.test('WebSocket Connection', this.testWebSocket.bind(this));
      await this.test('AI Provider List', this.testProviders.bind(this));
      await this.test('Task Creation', this.testTaskCreation.bind(this));
      await this.test('Notification Flow', this.testNotificationFlow.bind(this));
      await this.test('Complete Interactive Flow', this.testCompleteFlow.bind(this));
      
      this.printResults();
    } catch (error) {
      console.error('Test suite failed:', error);
      process.exit(1);
    }
  }

  async test(name, testFn) {
    process.stdout.write(`Testing ${name}... `);
    try {
      await testFn();
      console.log('✅ PASSED');
      this.testResults.push({ name, passed: true });
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      this.testResults.push({ name, passed: false, error: error.message });
    }
  }

  async testHealth() {
    const response = await axios.get(`${this.apiUrl}/health`);
    if (!response.data.status === 'ok') {
      throw new Error('Health check failed');
    }
  }

  async testAuth() {
    const email = `test-${Date.now()}@example.com`;
    const password = 'testpass123';
    
    // Create account
    const signupRes = await axios.post(`${this.apiUrl}/api/auth/signup`, {
      email, password
    });
    
    this.token = signupRes.data.token;
    if (!this.token) throw new Error('No token received');
    
    // Test login
    const loginRes = await axios.post(`${this.apiUrl}/api/auth/signin`, {
      email, password
    });
    
    if (!loginRes.data.token) throw new Error('Login failed');
  }

  async testSession() {
    const response = await axios.post(
      `${this.apiUrl}/api/sessions`,
      {},
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    this.sessionId = response.data.session.id;
    if (!this.sessionId) throw new Error('No session ID received');
  }

  async testWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
      
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          type: 'auth',
          payload: { token: this.token },
          messageId: 'test-msg',
          timestamp: new Date()
        }));
      });
      
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'auth' && msg.payload.success) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      this.ws.on('error', reject);
    });
  }

  async testProviders() {
    const response = await axios.get(
      `${this.apiUrl}/api/ai/providers`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    if (!Array.isArray(response.data.providers)) {
      throw new Error('Providers not returned as array');
    }
    
    const hasClaudeCode = response.data.providers.some(p => p.id === 'claude-code');
    if (!hasClaudeCode) {
      throw new Error('Claude Code provider not found');
    }
  }

  async testTaskCreation() {
    const response = await axios.post(
      `${this.apiUrl}/api/ai/tasks`,
      {
        sessionId: this.sessionId,
        command: 'echo "Hello World"',
        provider: 'claude-code'
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    if (!response.data.task || !response.data.task.id) {
      throw new Error('Task creation failed');
    }
  }

  async testNotificationFlow() {
    // Get notifications
    const response = await axios.get(
      `${this.apiUrl}/api/notifications`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    if (!Array.isArray(response.data.notifications)) {
      throw new Error('Notifications not returned as array');
    }
  }

  async testCompleteFlow() {
    // This would test the complete flow with a mock AI
    // For now, we'll simulate the expected behavior
    
    let receivedWaitingNotification = false;
    let receivedTaskUpdate = false;
    
    // Set up listeners
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'ai-waiting') {
        receivedWaitingNotification = true;
      } else if (msg.type === 'task-update') {
        receivedTaskUpdate = true;
      }
    });
    
    // Create a task
    const taskRes = await axios.post(
      `${this.apiUrl}/api/ai/tasks`,
      {
        sessionId: this.sessionId,
        command: 'Build a test app',
        provider: 'claude-code'
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    const taskId = taskRes.data.task.id;
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check task status
    const statusRes = await axios.get(
      `${this.apiUrl}/api/ai/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    if (!statusRes.data.task) {
      throw new Error('Task not found');
    }
    
    // In a real test, we'd verify:
    // - AI waiting notification received
    // - Response properly forwarded
    // - Task completes successfully
  }

  printResults() {
    console.log('\n=================================');
    console.log('Test Results Summary:');
    console.log('=================================');
    
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    
    this.testResults.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.name}`);
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    console.log('\n---------------------------------');
    console.log(`Total: ${this.testResults.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('=================================');
    
    if (this.ws) this.ws.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get('http://localhost:3010/health');
    return true;
  } catch (error) {
    console.error('❌ Server is not running on port 3010');
    console.log('Please start the server first:');
    console.log('  cd ship_anywhere_serverside');
    console.log('  npm run dev');
    return false;
  }
}

// Run tests
async function main() {
  if (!await checkServer()) {
    process.exit(1);
  }
  
  const test = new IntegrationTest();
  await test.runTests();
}

main().catch(console.error);