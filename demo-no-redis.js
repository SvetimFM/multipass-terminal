#!/usr/bin/env node

/**
 * Demo of the AI pause/notification flow concept
 * This shows how the system works without needing Redis
 */

console.log('🎭 Ship Anywhere - Interactive AI Flow Demo');
console.log('=' .repeat(50));
console.log('\nThis demonstrates how AI agents naturally pause for input:\n');

// Simulate the flow
class AIFlowDemo {
  constructor() {
    this.notifications = [];
    this.currentTask = null;
  }

  async simulateAITask(command) {
    console.log(`📱 USER (on phone): "${command}"`);
    console.log('   ↓');
    console.log('🖥️  SERVER: Starting AI agent...');
    console.log('   ↓');
    
    this.currentTask = {
      id: 'task-' + Date.now(),
      command,
      status: 'processing',
      output: []
    };

    // Simulate AI processing
    await this.sleep(1000);
    
    // AI starts working
    console.log('🤖 AI: Analyzing request...');
    this.currentTask.output.push('Starting to build the application...');
    
    await this.sleep(1500);
    
    // AI needs input!
    console.log('   ↓');
    console.log('🤖 AI: "Which framework would you prefer?"');
    console.log('       "1. React"');
    console.log('       "2. Vue"');
    console.log('       "3. Angular"');
    console.log('   ↓');
    
    // Create notification
    const notification = {
      id: 'notif-' + Date.now(),
      type: 'ai_waiting',
      title: '🤖 AI needs your input',
      body: 'Which framework would you prefer?\n1. React\n2. Vue\n3. Angular',
      taskId: this.currentTask.id,
      requiresResponse: true,
      responseOptions: ['React', 'Vue', 'Angular']
    };
    
    this.notifications.push(notification);
    
    console.log('📱 NOTIFICATION sent to phone:');
    console.log(`   ${notification.title}`);
    console.log(`   ${notification.body}`);
    console.log('   ↓');
    
    // Simulate user thinking
    await this.sleep(2000);
    
    // User responds
    const userResponse = 'React';
    console.log(`📱 USER responds: "${userResponse}"`);
    console.log('   ↓');
    console.log('🖥️  SERVER: Forwarding response to AI...');
    console.log('   ↓');
    
    // AI continues with user's choice
    await this.sleep(1000);
    console.log(`🤖 AI: "Great! Setting up ${userResponse} project..."`);
    
    await this.sleep(1500);
    
    // AI asks another question
    console.log('   ↓');
    console.log('🤖 AI: "Should I include TypeScript? (y/n)"');
    console.log('   ↓');
    
    // Another notification
    const notification2 = {
      id: 'notif-' + Date.now(),
      type: 'ai_waiting',
      title: '🤖 AI needs your input',
      body: 'Should I include TypeScript? (y/n)',
      taskId: this.currentTask.id,
      requiresResponse: true,
      responseOptions: ['Yes', 'No']
    };
    
    console.log('📱 NOTIFICATION sent to phone:');
    console.log(`   ${notification2.body}`);
    console.log('   ↓');
    
    await this.sleep(2000);
    
    // User responds again
    console.log('📱 USER responds: "Yes"');
    console.log('   ↓');
    
    await this.sleep(1000);
    console.log('🤖 AI: "Perfect! Adding TypeScript configuration..."');
    console.log('🤖 AI: "Installing dependencies..."');
    console.log('🤖 AI: "Creating components..."');
    
    await this.sleep(2000);
    
    console.log('   ↓');
    console.log('✅ AI: "Project setup complete!"');
    
    this.currentTask.status = 'completed';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  showArchitecture() {
    console.log('\n📐 Architecture Overview:');
    console.log('=' .repeat(50));
    console.log(`
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ Mobile App  │────▶│   Server    │────▶│ AI Agent    │
    │   (You)     │◀────│  (Bridge)   │◀────│(Claude/etc) │
    └─────────────┘     └─────────────┘     └─────────────┘
           │                    │                    │
           │ 1. Send command    │ 2. Start AI       │
           │                    │                    │
           │                    │ 3. AI outputs ────▶│
           │                    │                    │
           │                    │ 4. Detect pause   │
           │◀─ 5. Notification  │                    │
           │                    │                    │
           │ 6. Your response ─▶│                    │
           │                    │ 7. Forward ───────▶│
           │                    │                    │
           │                    │ 8. AI continues ──▶│
    `);
  }
}

// Run the demo
async function main() {
  const demo = new AIFlowDemo();
  
  // Show architecture
  demo.showArchitecture();
  
  console.log('\n🚀 Starting Demo...');
  console.log('=' .repeat(50));
  console.log();
  
  // Run the simulation
  await demo.simulateAITask('Create a new web application with authentication');
  
  console.log('\n\n💡 Key Points:');
  console.log('=' .repeat(50));
  console.log('• AI agents naturally pause when they need input');
  console.log('• The server detects these pauses (no output for 3+ seconds)');
  console.log('• You get notifications on your phone with the AI\'s questions');
  console.log('• Your responses are piped back to the AI\'s stdin');
  console.log('• The AI continues working with your input');
  console.log('\n✨ No complex state machines - just natural conversation flow!');
}

main().catch(console.error);