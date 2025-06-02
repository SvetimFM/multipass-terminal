const express = require('express');
const router = express.Router();
const { createAIOffice, removeAIOffice, addCubicle, removeCubicle } = require('../services/aiOffice');

module.exports = (projects, sessions, saveProjects) => {
  // Get all projects
  router.get('/', async (req, res) => {
    res.json({ projects: Array.from(projects.values()) });
  });

  // Create new project
  router.post('/', async (req, res) => {
    const { name, path: projectPath, githubUrl } = req.body;
    const id = 'proj-' + Date.now();
    
    const project = { id, name, path: projectPath };
    if (githubUrl) {
      project.githubUrl = githubUrl;
    }
    
    projects.set(id, project);
    await saveProjects();
    
    res.json(project);
  });

  // Delete project
  router.delete('/:id', async (req, res) => {
    const project = projects.get(req.params.id);
    if (project && project.aiOffice) {
      await removeAIOffice(project, sessions);
    }
    
    projects.delete(req.params.id);
    await saveProjects();
    res.json({ deleted: true });
  });

  // AI Office management
  router.post('/:id/ai-office', async (req, res) => {
    try {
      console.log('Creating AI Office for project:', req.params.id);
      const { cubicleCount = 3 } = req.body;
      console.log('Cubicle count:', cubicleCount);
      
      const project = projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const aiOffice = await createAIOffice(project, cubicleCount);
      await saveProjects();
      
      console.log('AI Office created successfully:', aiOffice);
      res.json(aiOffice);
    } catch (error) {
      console.error('Error creating AI Office:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id/ai-office', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      await removeAIOffice(project, sessions);
      await saveProjects();
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add cubicle to existing AI Office
  router.post('/:id/ai-office/cubicle', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      const cubicleNum = project.aiOffice.cubicleCount + 1;
      const newCubicle = await addCubicle(project, cubicleNum);
      
      // Update project
      project.aiOffice.cubicles.push(newCubicle);
      project.aiOffice.cubicleCount = cubicleNum;
      
      await saveProjects();
      res.json({ cubicle: newCubicle });
    } catch (error) {
      console.error('Error adding cubicle:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove cubicle from AI Office
  router.delete('/:id/ai-office/cubicle/:cubicleIdx', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return res.status(400).json({ error: 'Invalid cubicle index' });
      }
      
      // Don't allow removing the last cubicle
      if (project.aiOffice.cubicles.length === 1) {
        return res.status(400).json({ error: 'Cannot remove the last cubicle. Remove the entire AI Office instead.' });
      }
      
      await removeCubicle(project, cubicleIdx, sessions);
      await saveProjects();
      res.json({ deleted: true });
    } catch (error) {
      console.error('Error removing cubicle:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};