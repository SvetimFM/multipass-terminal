#!/usr/bin/env node

/**
 * Example client for Ship Anywhere Server
 * Shows how to interact with the AI agent orchestration system
 */

const axios = require('axios');
const WebSocket = require('ws');
const readline = require('readline');

class ShipAnywhereClient {
  constructor(apiUrl = 'http://localhost:3010', wsUrl = 'ws://localhost:3011') {
    this.apiUrl = apiUrl;
    this.wsUrl = wsUrl;
    this.token = null;
    this.sessionId = null;
    this.ws = null;
  }

  async login(email, password) {
    try {
      const response = await axios.post(`${this.apiUrl}/api/auth/signin`, {
        email,
        password
      });
      this.token = response.data.token;
      console.log('✅ Logged in successfully');
      return true;
    } catch (error) {
      console.error('❌ Login failed:', error.response?.data?.error || error.message);
      return false;
    }
  }

  async createSession() {
    const response = await axios.post(
      `${this.apiUrl}/api/sessions`,
      {},
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    this.sessionId = response.data.session.id;
    console.log('📦 Created session:', this.sessionId);
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        // Authenticate WebSocket
        this.ws.send(JSON.stringify({
          type: 'auth',
          payload: { token: this.token },
          messageId: Date.now().toString(),
          timestamp: new Date()
        }));
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'auth' && message.payload.success) {
          console.log('🔌 WebSocket connected');
          resolve();
        } else if (message.type === 'task:message') {
          console.log(`\n🤖 ${message.payload.message.provider}:`, message.payload.message.content);
        } else if (message.type === 'error') {
          console.error('❌ WebSocket error:', message.payload.message);
          reject(new Error(message.payload.message));
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
    });
  }

  async runTask(command, provider = 'claude-code') {
    console.log(`\n📝 Running task with ${provider}...`);
    
    const response = await axios.post(
      `${this.apiUrl}/api/ai/tasks`,
      {
        sessionId: this.sessionId,
        command,
        provider
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    const taskId = response.data.task.id;
    console.log('📋 Task created:', taskId);

    // Poll for completion
    let task;
    do {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const result = await axios.get(
        `${this.apiUrl}/api/ai/tasks/${taskId}`,
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
      task = result.data.task;
    } while (task.status === 'queued' || task.status === 'processing');

    if (task.status === 'completed') {
      console.log('\n✅ Task completed!');
      console.log('\n--- Output ---');
      console.log(task.result);
      console.log('--- End Output ---\n');
    } else {
      console.error('❌ Task failed:', task.error);
    }

    return task;
  }

  async getProviders() {
    const response = await axios.get(
      `${this.apiUrl}/api/ai/providers`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    return response.data.providers;
  }

  async interactiveMode() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const providers = await this.getProviders();
    console.log('\n📦 Available AI providers:');
    providers.forEach(p => console.log(`  - ${p.id}: ${p.name}`));

    console.log('\n💬 Interactive mode started. Type your commands or "exit" to quit.\n');

    const askQuestion = () => {
      rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
          rl.close();
          this.ws?.close();
          process.exit(0);
        }

        // Check if user specified a provider
        let provider = 'claude-code';
        let command = input;
        
        if (input.startsWith('@')) {
          const parts = input.split(' ');
          provider = parts[0].substring(1);
          command = parts.slice(1).join(' ');
        }

        try {
          await this.runTask(command, provider);
        } catch (error) {
          console.error('❌ Error:', error.message);
        }

        askQuestion();
      });
    };

    askQuestion();
  }
}

// Example usage
async function main() {
  const client = new ShipAnywhereClient();

  // Get credentials from environment or use defaults
  const email = process.env.SHIP_EMAIL || 'demo@example.com';
  const password = process.env.SHIP_PASSWORD || 'demo123';

  console.log('🚀 Ship Anywhere Client Example\n');

  // Try to login
  if (!await client.login(email, password)) {
    // Create account if login fails
    console.log('Creating new account...');
    try {
      await axios.post(`${client.apiUrl}/api/auth/signup`, {
        email,
        password
      });
      await client.login(email, password);
    } catch (error) {
      console.error('Failed to create account:', error.response?.data?.error);
      process.exit(1);
    }
  }

  // Create session and connect WebSocket
  await client.createSession();
  await client.connectWebSocket();

  // Run example commands
  if (process.argv[2] === '--demo') {
    console.log('\n🎭 Running demo tasks...\n');
    
    // Example 1: Simple code generation
    await client.runTask('Create a Python function to calculate fibonacci numbers');
    
    // Example 2: Using different provider
    await client.runTask('Optimize this SQL query: SELECT * FROM users', 'github-copilot');
    
    // Example 3: Complex task
    await client.runTask('Build a REST API endpoint for user authentication with JWT');
    
    process.exit(0);
  } else {
    // Interactive mode
    await client.interactiveMode();
  }
}

// Run the example
main().catch(console.error);