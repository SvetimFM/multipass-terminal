const puppeteer = require('puppeteer');
const request = require('supertest');
const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const API_URL = 'http://localhost:3010';
const CLIENT_URL = 'http://localhost:8080/simple.html';
const SERVER_PATH = path.join(__dirname, '..', 'simple-ai-executor.js');

describe('Client-Server Integration Tests', () => {
  let serverProcess;
  let clientServerProcess;
  let browser;
  let page;

  // Start servers before tests
  beforeAll(async () => {
    console.log('Starting servers for integration tests...');
    
    // Start API server
    serverProcess = spawn('node', [SERVER_PATH]);
    
    // Wait for server to be ready
    await new Promise((resolve) => {
      serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Ship Anywhere Server Ready')) {
          resolve();
        }
      });
    });

    // Start client HTTP server
    clientServerProcess = spawn('python3', ['-m', 'http.server', '8080'], {
      cwd: path.join(__dirname, '..', 'client')
    });

    // Wait a bit for client server
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  });

  // Cleanup after tests
  afterAll(async () => {
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
    if (clientServerProcess) clientServerProcess.kill();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    
    // Log console messages for debugging
    page.on('console', msg => console.log('Browser:', msg.text()));
    page.on('error', err => console.error('Browser Error:', err));
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  test('Client loads successfully', async () => {
    await page.goto(CLIENT_URL);
    
    // Check title
    const title = await page.title();
    expect(title).toBe('Ship Anywhere - Simple Demo');
    
    // Check main elements exist
    const header = await page.$eval('h1', el => el.textContent);
    expect(header).toContain('Ship Anywhere');
    
    // Check controls are present
    const commandInput = await page.$('#commandInput');
    expect(commandInput).toBeTruthy();
    
    const sendButton = await page.$('#sendButton');
    expect(sendButton).toBeTruthy();
  });

  test('Client connects to server', async () => {
    await page.goto(CLIENT_URL);
    
    // Wait for WebSocket connection
    await page.waitForFunction(
      () => document.querySelector('.status-dot.connected') !== null,
      { timeout: 5000 }
    );
    
    // Check status text
    const statusText = await page.$eval('#statusText', el => el.textContent);
    expect(statusText).toBe('Connected');
  });

  test('Execute command from client', async () => {
    await page.goto(CLIENT_URL);
    
    // Wait for connection
    await page.waitForFunction(
      () => document.querySelector('.status-dot.connected') !== null,
      { timeout: 5000 }
    );
    
    // Type command
    await page.type('#commandInput', 'echo Hello from test');
    
    // Click send button
    await page.click('#sendButton');
    
    // Wait for output
    await page.waitForFunction(
      () => {
        const lines = document.querySelectorAll('.console-line');
        return Array.from(lines).some(line => 
          line.textContent.includes('Hello from test')
        );
      },
      { timeout: 5000 }
    );
    
    // Verify output appeared
    const consoleContent = await page.$eval('#console', el => el.textContent);
    expect(consoleContent).toContain('Hello from test');
  });

  test('Quick command buttons work', async () => {
    await page.goto(CLIENT_URL);
    
    // Wait for connection
    await page.waitForFunction(
      () => document.querySelector('.status-dot.connected') !== null,
      { timeout: 5000 }
    );
    
    // Click first quick command
    await page.click('.quick-cmd');
    
    // Check command input was filled
    const inputValue = await page.$eval('#commandInput', el => el.value);
    expect(inputValue).toBeTruthy();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('Provider selection works', async () => {
    await page.goto(CLIENT_URL);
    
    // Wait for connection
    await page.waitForFunction(
      () => document.querySelector('.status-dot.connected') !== null,
      { timeout: 5000 }
    );
    
    // Select different provider
    await page.select('#providerSelect', 'bash');
    
    // Execute command
    await page.type('#commandInput', 'echo Bash provider test');
    await page.click('#sendButton');
    
    // Wait for output
    await page.waitForFunction(
      () => {
        const lines = document.querySelectorAll('.console-line');
        return Array.from(lines).some(line => 
          line.textContent.includes('Bash provider test')
        );
      },
      { timeout: 5000 }
    );
  });

  test('Multiple commands in sequence', async () => {
    await page.goto(CLIENT_URL);
    
    // Wait for connection
    await page.waitForFunction(
      () => document.querySelector('.status-dot.connected') !== null,
      { timeout: 5000 }
    );
    
    // Execute multiple commands
    const commands = ['echo First', 'echo Second', 'echo Third'];
    
    for (const cmd of commands) {
      await page.type('#commandInput', cmd);
      await page.click('#sendButton');
      
      // Wait for output
      await page.waitForFunction(
        (expectedText) => {
          const lines = document.querySelectorAll('.console-line');
          return Array.from(lines).some(line => 
            line.textContent.includes(expectedText)
          );
        },
        { timeout: 5000 },
        cmd.replace('echo ', '')
      );
      
      // Small delay between commands
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Verify all outputs are present
    const consoleContent = await page.$eval('#console', el => el.textContent);
    expect(consoleContent).toContain('First');
    expect(consoleContent).toContain('Second');
    expect(consoleContent).toContain('Third');
  });
});

// Run tests if called directly
if (require.main === module) {
  const jest = require('jest');
  jest.run(['--testPathPattern=client-server.test.js']);
}