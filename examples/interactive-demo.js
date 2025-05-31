#!/usr/bin/env node

/**
 * Interactive AI Demo - Shows the notification/response flow
 * Demonstrates how AI agents pause and wait for user input
 */

const axios = require('axios');
const WebSocket = require('ws');
const readline = require('readline');
const { promisify } = require('util');

class InteractiveAIDemo {
  constructor() {
    this.apiUrl = 'http://localhost:3010';
    this.wsUrl = 'ws://localhost:3011';
    this.token = null;
    this.sessionId = null;
    this.ws = null;
    this.pendingNotifications = [];
  }

  async setup() {
    // Login or create account
    const email = 'demo@interactive.ai';
    const password = 'demo123';
    
    try {
      const loginRes = await axios.post(`${this.apiUrl}/api/auth/signin`, {
        email, password
      });
      this.token = loginRes.data.token;
    } catch {
      // Create account
      await axios.post(`${this.apiUrl}/api/auth/signup`, {
        email, password
      });
      const loginRes = await axios.post(`${this.apiUrl}/api/auth/signin`, {
        email, password
      });
      this.token = loginRes.data.token;
    }

    // Create session
    const sessionRes = await axios.post(
      `${this.apiUrl}/api/sessions`,
      {},
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    this.sessionId = sessionRes.data.session.id;

    // Connect WebSocket
    await this.connectWebSocket();
    console.log('✅ Setup complete!\n');
  }

  connectWebSocket() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          type: 'auth',
          payload: { token: this.token },
          messageId: 'auth-msg',
          timestamp: new Date()
        }));
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        switch (msg.type) {
          case 'auth':
            if (msg.payload.success) resolve();
            break;
            
          case 'ai-waiting':
            this.handleAIWaiting(msg.payload);
            break;
            
          case 'task-update':
            console.log(`\n📊 Task Update: ${msg.payload.status}`);
            break;
            
          case 'task:message':
            if (msg.payload.message.type === 'stdout') {
              console.log(`🤖: ${msg.payload.message.content}`);
            }
            break;
        }
      });
    });
  }

  async handleAIWaiting(notification) {
    console.log('\n' + '='.repeat(50));
    console.log('🔔 AI is waiting for your input!');
    console.log('='.repeat(50));
    console.log(`\n📝 ${notification.title}`);
    console.log(`💬 ${notification.body}\n`);
    
    if (notification.data.responseOptions) {
      console.log('Options:', notification.data.responseOptions.join(', '));
    }
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const question = promisify(rl.question).bind(rl);
    const response = await question('Your response: ');
    rl.close();
    
    // Send response
    await axios.post(
      `${this.apiUrl}/api/notifications/${notification.id}/respond`,
      { response },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    console.log('✅ Response sent!\n');
  }

  async runInteractiveTask(command, provider = 'claude-code') {
    console.log(`\n🚀 Starting interactive task with ${provider}...`);
    console.log(`📝 Command: "${command}"\n`);
    
    const taskRes = await axios.post(
      `${this.apiUrl}/api/ai/tasks`,
      {
        sessionId: this.sessionId,
        command,
        provider
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    const taskId = taskRes.data.task.id;
    console.log(`📋 Task ID: ${taskId}\n`);
    console.log('Waiting for AI to process...\n');
    
    // Poll for completion
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const result = await axios.get(
          `${this.apiUrl}/api/ai/tasks/${taskId}`,
          { headers: { Authorization: `Bearer ${this.token}` } }
        );
        
        if (result.data.task.status === 'completed' || 
            result.data.task.status === 'failed') {
          clearInterval(checkInterval);
          
          console.log('\n' + '='.repeat(50));
          console.log(`✅ Task ${result.data.task.status}!`);
          console.log('='.repeat(50));
          
          if (result.data.task.result) {
            console.log('\nFinal Output:');
            console.log(result.data.task.result);
          }
          
          resolve(result.data.task);
        }
      }, 2000);
    });
  }

  async checkNotifications() {
    const res = await axios.get(
      `${this.apiUrl}/api/notifications?limit=5`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    
    return res.data.notifications;
  }
}

// Demo scenarios
async function main() {
  const demo = new InteractiveAIDemo();
  await demo.setup();

  console.log('🎭 Interactive AI Demo');
  console.log('=' * 50);
  console.log('\nThis demo shows how AI agents pause and wait for your input.\n');

  // Example 1: Task that will ask questions
  console.log('📚 Example 1: Creating a full-stack app');
  console.log('The AI will ask you questions about your preferences.\n');
  
  await demo.runInteractiveTask(
    'Create a new web application. Ask me about my preferences for framework, database, and features.',
    'claude-code'
  );

  console.log('\n\n' + '='.repeat(50));
  console.log('📚 Example 2: Code review with questions');
  console.log('The AI will ask for clarification during review.\n');
  
  await demo.runInteractiveTask(
    'Review this code and ask me questions if you need clarification: function calc(a,b) { return a + b * 2 / 3 - 1; }',
    'claude-code'
  );

  console.log('\n\n🎉 Demo complete!');
  console.log('\nThe AI naturally paused when it needed input, sent you notifications,');
  console.log('and continued working after receiving your responses.');
  
  // Check remaining notifications
  const notifications = await demo.checkNotifications();
  if (notifications.length > 0) {
    console.log(`\n📬 You have ${notifications.length} notifications waiting.`);
  }
  
  process.exit(0);
}

// Run demo
main().catch(console.error);