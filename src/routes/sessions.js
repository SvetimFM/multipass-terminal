const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { sanitizeName, validateProjectId } = require('../utils/validation');

module.exports = (sessions, projects) => {
  // Get all sessions
  router.get('/', (req, res) => {
    exec('tmux list-sessions -F "#{session_name}"', (error, stdout) => {
      if (error) {
        res.json({ sessions: [] });
        return;
      }
      
      const sessionNames = stdout.trim().split('\n').filter(Boolean);
      const sessionData = sessionNames.map(name => {
        const metadata = sessions.get(name) || {};
        return {
          name,
          project: metadata.project || 'Unknown',
          ...metadata
        };
      });
      
      res.json({ sessions: sessionData });
    });
  });

  // Create new session
  router.post('/', (req, res) => {
    try {
      const { name, projectId, isCubicle, cubiclePath } = req.body;
      
      const sanitizedName = sanitizeName(name);
      const validatedProjectId = validateProjectId(projectId);
      const project = projects.get(validatedProjectId);
      
      if (!project) {
        return res.status(400).json({ error: 'Project not found' });
      }
      
      // Use cubicle path if provided, otherwise project path
      const workingDir = cubiclePath || project.path;
      
      // Create tmux session
      const tmuxCmd = `tmux new-session -d -s "${sanitizedName}" -c "${workingDir}" bash`;
      
      exec(tmuxCmd, (error) => {
        if (error) {
          // Check if session already exists
          if (error.message.includes('duplicate session')) {
            return res.status(400).json({ error: 'Session name already exists' });
          }
          return res.status(500).json({ error: error.message });
        }
        
        // Store session metadata
        sessions.set(sanitizedName, {
          projectId: validatedProjectId,
          project: project.name,
          isCubicle,
          cubiclePath,
          createdAt: new Date().toISOString()
        });
        
        res.json({ name: sanitizedName, projectId: validatedProjectId });
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete session
  router.delete('/:name', (req, res) => {
    try {
      const sanitizedName = sanitizeName(req.params.name);
      
      exec(`tmux kill-session -t "${sanitizedName}"`, (error) => {
        if (error) {
          // Session might not exist
          if (error.message.includes('can\'t find session')) {
            sessions.delete(sanitizedName);
            return res.json({ status: 'not found but cleaned up' });
          }
          return res.status(500).json({ error: error.message });
        } else {
          sessions.delete(sanitizedName);
          res.json({ status: 'killed' });
        }
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};