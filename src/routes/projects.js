const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { createAIOffice, removeAIOffice, addCubicle, removeCubicle } = require('../services/aiOffice');
const { sanitizeName, sanitizePath, validateProjectId, validateCubicleCount } = require('../utils/validation');

module.exports = (projects, sessions, saveProjects) => {
  // Get all projects
  router.get('/', async (req, res) => {
    res.json({ projects: Array.from(projects.values()) });
  });

  // Create new project
  router.post('/', async (req, res) => {
    try {
      const { name, path: projectPath, githubUrl } = req.body;
      
      const sanitizedName = sanitizeName(name);
      const sanitizedPath = sanitizePath(projectPath);
      const id = 'proj-' + Date.now();
      
      const project = { id, name: sanitizedName, path: sanitizedPath };
      if (githubUrl) {
        project.githubUrl = githubUrl;
      }
      
      projects.set(id, project);
      await saveProjects();
      
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete project
  router.delete('/:id', async (req, res) => {
    try {
      const projectId = validateProjectId(req.params.id);
      const project = projects.get(projectId);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.aiOffice) {
        await removeAIOffice(project, sessions);
      }
      
      projects.delete(projectId);
      await saveProjects();
      res.json({ deleted: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // AI Office management
  router.post('/:id/ai-office', async (req, res) => {
    try {
      const projectId = validateProjectId(req.params.id);
      const { cubicleCount = 3 } = req.body;
      const validatedCount = validateCubicleCount(cubicleCount);
      
      const project = projects.get(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.aiOffice) {
        return res.status(400).json({ error: 'AI Office already exists for this project' });
      }
      
      const aiOffice = await createAIOffice(project, validatedCount);
      await saveProjects();
      
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

  // Refresh all cubicles from GitHub
  router.post('/:id/ai-office/refresh-all', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      if (!project.githubUrl) {
        return res.status(400).json({ error: 'No GitHub URL configured for this project' });
      }
      
      let refreshed = 0;
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      for (const cubicle of project.aiOffice.cubicles) {
        try {
          // Backup .AI_README
          const aiReadmePath = path.join(cubicle.path, '.AI_README');
          let aiReadmeContent = null;
          try {
            aiReadmeContent = await fs.readFile(aiReadmePath, 'utf8');
          } catch (e) {}
          
          // Fresh clone from GitHub
          await execPromise(`cd "${cubicle.path}" && rm -rf .git && git clone "${project.githubUrl}" . --depth 1`, {
            maxBuffer: 1024 * 1024 * 10
          });
          
          // Restore .AI_README
          if (aiReadmeContent) {
            await fs.writeFile(aiReadmePath, aiReadmeContent);
          }
          
          refreshed++;
        } catch (error) {
          console.error(`Error refreshing cubicle ${cubicle.name}:`, error);
        }
      }
      
      res.json({ refreshed, total: project.aiOffice.cubicles.length });
    } catch (error) {
      console.error('Error refreshing AI Office:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Pull from main in all cubicles
  router.post('/:id/ai-office/pull-all', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      let pulled = 0;
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      for (const cubicle of project.aiOffice.cubicles) {
        try {
          await execPromise(`cd "${cubicle.path}" && git pull origin main`, {
            maxBuffer: 1024 * 1024 * 10
          });
          pulled++;
        } catch (error) {
          console.error(`Error pulling in cubicle ${cubicle.name}:`, error);
        }
      }
      
      res.json({ pulled, total: project.aiOffice.cubicles.length });
    } catch (error) {
      console.error('Error pulling updates:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reset all cubicles
  router.post('/:id/ai-office/reset-all', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      let reset = 0;
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      for (const cubicle of project.aiOffice.cubicles) {
        try {
          // Reset to clean state by copying from parent
          await execPromise(`rsync -av --delete --exclude="ai-office/" --exclude=".git/" "${project.path}/" "${cubicle.path}/"`, {
            maxBuffer: 1024 * 1024 * 10
          });
          
          // Initialize git if needed
          await execPromise(`cd "${cubicle.path}" && git init`, {
            maxBuffer: 1024 * 1024 * 10
          });
          
          reset++;
        } catch (error) {
          console.error(`Error resetting cubicle ${cubicle.name}:`, error);
        }
      }
      
      res.json({ reset, total: project.aiOffice.cubicles.length });
    } catch (error) {
      console.error('Error resetting cubicles:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh individual cubicle from GitHub
  router.post('/:id/ai-office/cubicle/:cubicleIdx/refresh', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      if (!project.githubUrl) {
        return res.status(400).json({ error: 'No GitHub URL configured' });
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return res.status(400).json({ error: 'Invalid cubicle index' });
      }
      
      const cubicle = project.aiOffice.cubicles[cubicleIdx];
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // Backup .AI_README
      const aiReadmePath = path.join(cubicle.path, '.AI_README');
      let aiReadmeContent = null;
      try {
        aiReadmeContent = await fs.readFile(aiReadmePath, 'utf8');
      } catch (e) {}
      
      // Fresh clone
      await execPromise(`cd "${cubicle.path}" && rm -rf * .* 2>/dev/null || true && git clone "${project.githubUrl}" . --depth 1`, {
        maxBuffer: 1024 * 1024 * 10
      });
      
      // Restore .AI_README
      if (aiReadmeContent) {
        await fs.writeFile(aiReadmePath, aiReadmeContent);
      }
      
      res.json({ refreshed: true });
    } catch (error) {
      console.error('Error refreshing cubicle:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Pull from main in individual cubicle
  router.post('/:id/ai-office/cubicle/:cubicleIdx/pull', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return res.status(400).json({ error: 'Invalid cubicle index' });
      }
      
      const cubicle = project.aiOffice.cubicles[cubicleIdx];
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      await execPromise(`cd "${cubicle.path}" && git pull origin main`, {
        maxBuffer: 1024 * 1024 * 10
      });
      
      res.json({ pulled: true });
    } catch (error) {
      console.error('Error pulling updates:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reset individual cubicle
  router.post('/:id/ai-office/cubicle/:cubicleIdx/reset', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return res.status(404).json({ error: 'AI Office not found' });
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return res.status(400).json({ error: 'Invalid cubicle index' });
      }
      
      const cubicle = project.aiOffice.cubicles[cubicleIdx];
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // Backup .AI_README
      const aiReadmePath = path.join(cubicle.path, '.AI_README');
      let aiReadmeContent = null;
      try {
        aiReadmeContent = await fs.readFile(aiReadmePath, 'utf8');
      } catch (e) {}
      
      // Reset by copying from parent
      await execPromise(`rsync -av --delete --exclude="ai-office/" --exclude=".git/" --exclude=".AI_README" "${project.path}/" "${cubicle.path}/"`, {
        maxBuffer: 1024 * 1024 * 10
      });
      
      // Initialize git
      await execPromise(`cd "${cubicle.path}" && git init`, {
        maxBuffer: 1024 * 1024 * 10
      });
      
      // Restore .AI_README
      if (aiReadmeContent) {
        await fs.writeFile(aiReadmePath, aiReadmeContent);
      }
      
      res.json({ reset: true });
    } catch (error) {
      console.error('Error resetting cubicle:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};