const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

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
    const { name, projectId, isCubicle, cubiclePath } = req.body;
    const project = projects.get(projectId);
    
    if (!project) {
      res.status(400).json({ error: 'Project not found' });
      return;
    }
    
    // Use cubicle path if provided, otherwise project path
    const workingDir = cubiclePath || project.path;
    
    // Create tmux session
    const tmuxCmd = `tmux new-session -d -s "${name}" -c "${workingDir}" bash`;
    
    exec(tmuxCmd, (error) => {
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      
      // Store session metadata
      sessions.set(name, {
        projectId,
        project: project.name,
        isCubicle,
        cubiclePath,
        createdAt: new Date().toISOString()
      });
      
      res.json({ name, projectId });
    });
  });

  // Delete session
  router.delete('/:name', (req, res) => {
    exec(`tmux kill-session -t "${req.params.name}"`, (error) => {
      if (error) {
        res.status(500).json({ error: error.message });
      } else {
        sessions.delete(req.params.name);
        res.json({ status: 'killed' });
      }
    });
  });

  return router;
};