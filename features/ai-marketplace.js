#!/usr/bin/env node

// AI Agent Marketplace - Discover and install AI agents
// Community-driven marketplace for specialized AI tools

const express = require('express');
const router = express.Router();

// Mock marketplace data (in production, this would be a database)
const marketplaceAgents = [
  {
    id: 'claude-code-pro',
    name: 'Claude Code Pro',
    author: 'Anthropic',
    description: 'Advanced coding assistant with full project understanding',
    category: 'Development',
    rating: 4.9,
    installs: 15420,
    capabilities: ['Full codebase analysis', 'Multi-file editing', 'Testing', 'Documentation'],
    price: 'free',
    verified: true
  },
  {
    id: 'react-specialist',
    name: 'React Specialist',
    author: 'Community',
    description: 'Expert in React, Next.js, and modern frontend development',
    category: 'Frontend',
    rating: 4.7,
    installs: 8932,
    capabilities: ['Component generation', 'Hook optimization', 'Performance tuning'],
    price: 'free'
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor AI',
    author: 'SecureCode Inc',
    description: 'Automated security vulnerability detection and fixes',
    category: 'Security',
    rating: 4.8,
    installs: 5421,
    capabilities: ['Vulnerability scanning', 'OWASP compliance', 'Penetration testing'],
    price: '$5/month',
    verified: true
  },
  {
    id: 'database-optimizer',
    name: 'Database Optimization Expert',
    author: 'DataPro',
    description: 'SQL query optimization and database performance tuning',
    category: 'Backend',
    rating: 4.6,
    installs: 3254,
    capabilities: ['Query analysis', 'Index recommendations', 'Schema optimization'],
    price: 'free'
  },
  {
    id: 'mobile-app-builder',
    name: 'Mobile App Builder',
    author: 'AppCraft',
    description: 'React Native and Flutter expert for cross-platform apps',
    category: 'Mobile',
    rating: 4.5,
    installs: 6789,
    capabilities: ['UI generation', 'Native module integration', 'App store deployment'],
    price: 'free'
  },
  {
    id: 'devops-automation',
    name: 'DevOps Automation Pro',
    author: 'CloudNinja',
    description: 'CI/CD pipeline creation and cloud deployment automation',
    category: 'DevOps',
    rating: 4.8,
    installs: 4567,
    capabilities: ['Pipeline generation', 'Docker optimization', 'Kubernetes configs'],
    price: '$10/month',
    verified: true
  },
  {
    id: 'ai-tutor',
    name: 'AI Programming Tutor',
    author: 'EduTech',
    description: 'Interactive programming teacher for all skill levels',
    category: 'Education',
    rating: 4.9,
    installs: 12034,
    capabilities: ['Personalized lessons', 'Code reviews', 'Practice problems'],
    price: 'free'
  },
  {
    id: 'game-dev-assistant',
    name: 'Game Development AI',
    author: 'GameForge',
    description: 'Unity and Unreal Engine development assistant',
    category: 'Gaming',
    rating: 4.4,
    installs: 2345,
    capabilities: ['Shader writing', 'Physics optimization', 'Asset generation'],
    price: 'free'
  }
];

// Installed agents per user (in-memory for demo)
const userAgents = new Map();

// Get all marketplace agents
router.get('/agents', (req, res) => {
  const { category, sort = 'popular' } = req.query;
  
  let agents = [...marketplaceAgents];
  
  // Filter by category
  if (category) {
    agents = agents.filter(a => a.category === category);
  }
  
  // Sort
  switch (sort) {
    case 'rating':
      agents.sort((a, b) => b.rating - a.rating);
      break;
    case 'newest':
      agents.reverse(); // Simulating newest first
      break;
    case 'popular':
    default:
      agents.sort((a, b) => b.installs - a.installs);
  }
  
  res.json({ agents });
});

// Get agent details
router.get('/agents/:agentId', (req, res) => {
  const agent = marketplaceAgents.find(a => a.id === req.params.agentId);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // Add additional details
  const details = {
    ...agent,
    readme: `# ${agent.name}\n\n${agent.description}\n\n## Features\n${agent.capabilities.map(c => `- ${c}`).join('\n')}`,
    examples: [
      `@${agent.id} help me with my project`,
      `@${agent.id} analyze this code`,
      `@${agent.id} suggest improvements`
    ],
    reviews: [
      { user: 'dev123', rating: 5, comment: 'Amazing tool!' },
      { user: 'coder456', rating: 4, comment: 'Very helpful' }
    ]
  };
  
  res.json({ agent: details });
});

// Install agent for user
router.post('/agents/:agentId/install', (req, res) => {
  const { sessionId } = req.body;
  const { agentId } = req.params;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }
  
  const agent = marketplaceAgents.find(a => a.id === agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // Track installation
  if (!userAgents.has(sessionId)) {
    userAgents.set(sessionId, new Set());
  }
  userAgents.get(sessionId).add(agentId);
  
  // Increment install count (in production, this would be in a database)
  agent.installs++;
  
  res.json({ 
    message: `Successfully installed ${agent.name}`,
    agent: {
      id: agent.id,
      name: agent.name,
      command: `@${agent.id}`
    }
  });
});

// Get user's installed agents
router.get('/my-agents', (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }
  
  const installedIds = userAgents.get(sessionId) || new Set();
  const installed = marketplaceAgents.filter(a => installedIds.has(a.id));
  
  res.json({ agents: installed });
});

// Search agents
router.get('/search', (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.json({ agents: [] });
  }
  
  const query = q.toLowerCase();
  const results = marketplaceAgents.filter(agent => 
    agent.name.toLowerCase().includes(query) ||
    agent.description.toLowerCase().includes(query) ||
    agent.capabilities.some(c => c.toLowerCase().includes(query))
  );
  
  res.json({ agents: results });
});

// Get categories
router.get('/categories', (req, res) => {
  const categories = [...new Set(marketplaceAgents.map(a => a.category))];
  res.json({ categories });
});

// Submit new agent (community contribution)
router.post('/submit', (req, res) => {
  const { name, description, githubUrl, category } = req.body;
  
  // In production, this would go through a review process
  const newAgent = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    author: 'Community',
    description,
    category,
    rating: 0,
    installs: 0,
    capabilities: [],
    price: 'free',
    status: 'pending-review'
  };
  
  res.json({ 
    message: 'Agent submitted for review',
    agent: newAgent
  });
});

module.exports = router;

// Standalone server if run directly
if (require.main === module) {
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace', router);
  
  const PORT = 3013;
  app.listen(PORT, () => {
    console.log(`🏪 AI Marketplace Server running on port ${PORT}`);
    console.log(`   ${marketplaceAgents.length} agents available`);
  });
}