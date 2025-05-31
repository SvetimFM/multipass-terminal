// Quick test without Redis dependency
const express = require('express');
const app = express();

app.use(express.json());

// Mock endpoints for testing
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/signup', (req, res) => {
  const { email, password } = req.body;
  res.json({
    user: { id: '123', email },
    token: 'mock-jwt-token'
  });
});

app.post('/api/auth/signin', (req, res) => {
  res.json({
    user: { id: '123', email: req.body.email },
    token: 'mock-jwt-token'
  });
});

app.post('/api/sessions', (req, res) => {
  res.json({
    session: { id: 'session-123' }
  });
});

app.post('/api/ai/tasks', (req, res) => {
  res.json({
    task: {
      id: 'task-123',
      status: 'queued',
      command: req.body.command
    }
  });
});

app.get('/api/ai/tasks/:id', (req, res) => {
  // Simulate AI waiting for input
  setTimeout(() => {
    res.json({
      task: {
        id: req.params.id,
        status: 'waiting',
        lastOutput: 'Should I use TypeScript for this project? (y/n)'
      }
    });
  }, 100);
});

app.get('/api/notifications', (req, res) => {
  res.json({
    notifications: [{
      id: 'notif-123',
      type: 'ai_waiting',
      title: '🤖 AI needs your input',
      body: 'Should I use TypeScript? (y/n)',
      data: {
        requiresResponse: true,
        responseOptions: ['Yes', 'No']
      }
    }]
  });
});

app.post('/api/notifications/:id/respond', (req, res) => {
  res.json({
    message: 'Response recorded',
    response: { response: req.body.response }
  });
});

const PORT = 3010;
app.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
  console.log('\nThis demonstrates the AI pause/notification flow:');
  console.log('1. AI asks a question and pauses');
  console.log('2. You get a notification');
  console.log('3. You respond');
  console.log('4. AI continues with your input\n');
});

// Simple demo
setTimeout(async () => {
  console.log('📱 Simulating mobile app interaction...\n');
  
  const axios = require('axios');
  const baseURL = `http://localhost:${PORT}`;
  
  try {
    // 1. Login
    console.log('1️⃣ Logging in...');
    const { data: auth } = await axios.post(`${baseURL}/api/auth/signin`, {
      email: 'user@example.com',
      password: 'password'
    });
    console.log('✅ Logged in:', auth.user.email);
    
    // 2. Create task
    console.log('\n2️⃣ Creating AI task...');
    const { data: taskData } = await axios.post(`${baseURL}/api/ai/tasks`, {
      command: 'Build a web app',
      sessionId: 'session-123'
    }, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    console.log('✅ Task created:', taskData.task.id);
    
    // 3. Check task status (AI is thinking...)
    console.log('\n3️⃣ AI is processing...');
    await new Promise(r => setTimeout(r, 1000));
    
    // 4. AI needs input!
    console.log('\n4️⃣ AI paused and needs input!');
    const { data: notifications } = await axios.get(`${baseURL}/api/notifications`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    
    const notif = notifications.notifications[0];
    console.log(`\n📱 NOTIFICATION: ${notif.title}`);
    console.log(`   ${notif.body}`);
    console.log(`   Options: ${notif.data.responseOptions.join(', ')}`);
    
    // 5. User responds
    console.log('\n5️⃣ User responds: "Yes"');
    await axios.post(`${baseURL}/api/notifications/${notif.id}/respond`, {
      response: 'Yes'
    }, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    
    console.log('✅ Response sent to AI!');
    console.log('\n6️⃣ AI continues with TypeScript setup...');
    
    console.log('\n✨ Demo complete! The AI received your input and continues working.');
    console.log('\nPress Ctrl+C to exit.');
    
  } catch (error) {
    console.error('Demo error:', error.message);
  }
}, 2000);