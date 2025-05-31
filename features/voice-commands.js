#!/usr/bin/env node

// Voice Commands Feature - Control AI with your voice!
// Uses Web Speech API on client + server processing

const express = require('express');
const router = express.Router();

// Voice command patterns
const voiceCommands = {
  // Quick actions
  'create app': 'create a new web application with modern stack',
  'fix bug': 'analyze and fix the most recent error in the logs',
  'deploy': 'deploy the current application to production',
  'test': 'run all tests and fix any failures',
  
  // AI agent selection
  'use claude': { action: 'switch-provider', provider: 'claude-code' },
  'use copilot': { action: 'switch-provider', provider: 'github-copilot' },
  'use gpt': { action: 'switch-provider', provider: 'openai' },
  
  // Complex commands
  'build me a': {
    'website': 'create a responsive website with landing page',
    'mobile app': 'create a cross-platform mobile application',
    'api': 'create a RESTful API with authentication',
    'game': 'create a simple web-based game'
  },
  
  // Workflow commands
  'start morning routine': [
    'git pull origin main',
    'npm install',
    'npm test',
    'check for security vulnerabilities',
    'review pull requests'
  ],
  
  'emergency fix': [
    'show recent errors',
    'analyze root cause',
    'create hotfix branch',
    'implement fix',
    'run tests',
    'create pull request'
  ]
};

// Natural language processing for voice
function processVoiceCommand(transcript) {
  const lower = transcript.toLowerCase().trim();
  
  // Direct match
  if (voiceCommands[lower]) {
    return voiceCommands[lower];
  }
  
  // Partial match
  for (const [pattern, command] of Object.entries(voiceCommands)) {
    if (lower.includes(pattern)) {
      // Handle nested commands
      if (typeof command === 'object' && !Array.isArray(command)) {
        // Find sub-command
        for (const [subPattern, subCommand] of Object.entries(command)) {
          if (lower.includes(subPattern)) {
            return subCommand;
          }
        }
      }
      return command;
    }
  }
  
  // Fallback to direct AI command
  return transcript;
}

// Voice command endpoint
router.post('/voice', async (req, res) => {
  const { transcript, sessionId } = req.body;
  
  if (!transcript || !sessionId) {
    return res.status(400).json({ error: 'Missing transcript or sessionId' });
  }
  
  console.log(`🎤 Voice command: "${transcript}"`);
  
  const command = processVoiceCommand(transcript);
  
  // Handle special actions
  if (typeof command === 'object' && command.action) {
    return res.json({
      type: 'action',
      action: command.action,
      params: command
    });
  }
  
  // Handle workflow (multiple commands)
  if (Array.isArray(command)) {
    return res.json({
      type: 'workflow',
      commands: command,
      description: `Executing ${command.length} commands`
    });
  }
  
  // Single command
  return res.json({
    type: 'command',
    command: command,
    original: transcript
  });
});

// Get voice command suggestions
router.get('/voice/suggestions', (req, res) => {
  const suggestions = Object.keys(voiceCommands)
    .filter(cmd => typeof voiceCommands[cmd] === 'string')
    .slice(0, 10);
    
  res.json({ suggestions });
});

// Voice feedback endpoint (text-to-speech responses)
router.post('/voice/speak', async (req, res) => {
  const { text, voice = 'assistant' } = req.body;
  
  // In production, this would integrate with TTS services
  // For now, return SSML for client-side speech
  const ssml = `
    <speak>
      <prosody rate="1.1" pitch="+5%">
        ${text}
      </prosody>
    </speak>
  `;
  
  res.json({ ssml, text });
});

module.exports = router;

// Standalone server if run directly
if (require.main === module) {
  const app = express();
  app.use(express.json());
  app.use('/api/features', router);
  
  const PORT = 3012;
  app.listen(PORT, () => {
    console.log(`🎤 Voice Commands Server running on port ${PORT}`);
  });
}