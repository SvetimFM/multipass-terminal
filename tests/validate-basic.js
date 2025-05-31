#!/usr/bin/env node

// Simple validation script that tests if the server works
// without interfering with running processes

const http = require('http');
const WebSocket = require('ws');

console.log('🧪 Basic Validation Test');
console.log('=======================\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// Test HTTP endpoint
async function testHealth() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3010/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.status === 'ok') {
          resolve();
        } else {
          reject(new Error('Invalid health response'));
        }
      });
    }).on('error', reject);
  });
}

// Test session creation
async function testCreateSession() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({});
    const options = {
      hostname: 'localhost',
      port: 3010,
      path: '/api/sessions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.session && parsed.session.id) {
          resolve(parsed.session.id);
        } else {
          reject(new Error('Invalid session response'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Test WebSocket connection
async function testWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3011');
    
    ws.on('open', () => {
      ws.close();
      resolve();
    });
    
    ws.on('error', reject);
    
    setTimeout(() => reject(new Error('WebSocket timeout')), 5000);
  });
}

// Run tests
async function runTests() {
  console.log('Testing server endpoints...\n');
  
  await test('HTTP Health Check', testHealth);
  await test('WebSocket Connection', testWebSocket);
  
  let sessionId;
  await test('Create Session', async () => {
    sessionId = await testCreateSession();
  });
  
  if (sessionId) {
    console.log(`\n📝 Created test session: ${sessionId}`);
  }
  
  console.log('\n======================');
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n🎉 All basic tests passed!');
    console.log('The server is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed.');
    console.log('Please check the server logs.');
    process.exit(1);
  }
}

// Check if server is running first
http.get('http://localhost:3010/health', () => {
  runTests();
}).on('error', () => {
  console.log('❌ Server is not running!');
  console.log('Please start the server with: ./run-simple.sh');
  process.exit(1);
});