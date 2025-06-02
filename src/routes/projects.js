const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
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

  // Sync AI Office cubicles with parent project
  router.post('/:id/ai-office/sync', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      let synced = 0;
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // Sync each cubicle
      for (const cubicle of project.aiOffice.cubicles) {
        try {
          // First, preserve the .AI_README if it exists
          const aiReadmePath = path.join(cubicle.path, '.AI_README');
          let aiReadmeContent = null;
          try {
            aiReadmeContent = await fs.readFile(aiReadmePath, 'utf8');
          } catch (e) {
            // File doesn't exist yet
          }
          
          // Copy files from parent project to cubicle, excluding ai-office directory
          await execPromise(`rsync -av --delete --exclude="ai-office/" --exclude=".git/" --exclude=".AI_README" "${project.path}/" "${cubicle.path}/"`, {
            maxBuffer: 1024 * 1024 * 10
          });
          
          // Restore or create .AI_README
          if (aiReadmeContent) {
            await fs.writeFile(aiReadmePath, aiReadmeContent);
          } else {
            // Create new .AI_README with rules
            const cubicleNum = cubicle.name.split('-')[1];
            await fs.writeFile(aiReadmePath, `# Cubicle ${cubicleNum} - AI Workspace

## Important Rules for AI

1. **You are in an isolated cubicle workspace** - Changes here won't affect the main project
2. **All project files are in the current directory** - No need to navigate elsewhere
3. **Use git to track your changes** - The cubicle has its own git history
4. **Sync with parent** updates this cubicle with latest changes from main project
5. **Your changes are preserved** until explicitly synced or reset

## Project: ${project.name}
## Path: ${cubicle.path}
${project.githubUrl ? `## GitHub: ${project.githubUrl}` : ''}

## Guidelines
- Make all changes directly in this directory
- Test thoroughly before suggesting merges to main project
- Use git commits to document your work
- This workspace is specifically for AI experimentation
`);
          }
          
          synced++;
        } catch (error) {
          console.error(`Error syncing cubicle ${cubicle.name}:`, error);
        }
      }
      
      res.json({ synced, total: project.aiOffice.cubicles.length });
    } catch (error) {
      console.error('Error syncing AI Office:', error);
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