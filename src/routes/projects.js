const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { createAIOffice, removeAIOffice, addCubicle, removeCubicle } = require('../services/aiOffice');
const { sanitizeName, sanitizePath, validateProjectId, validateCubicleCount } = require('../utils/validation');
const { asyncHandler, sendError } = require('../utils/errorHandler');

module.exports = (projects, sessions, saveProjects) => {
  // Get all projects
  router.get('/', asyncHandler(async (req, res) => {
    res.json({ projects: Array.from(projects.values()) });
  }));

  // Create new project
  router.post('/', asyncHandler(async (req, res) => {
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
  }));

  // Delete project
  router.delete('/:id', asyncHandler(async (req, res) => {
    try {
      const projectId = validateProjectId(req.params.id);
      const project = projects.get(projectId);
      
      if (!project) {
        return sendError(res, 404, 'Project not found');
      }
      
      if (project.aiOffice) {
        await removeAIOffice(project, sessions);
      }
      
      projects.delete(projectId);
      await saveProjects();
      res.json({ deleted: true });
    } catch (error) {
      sendError(res, 400, error.message);
    }
  }));

  // AI Office management
  router.post('/:id/ai-office', async (req, res) => {
    try {
      const projectId = validateProjectId(req.params.id);
      const { cubicleCount = 3 } = req.body;
      const validatedCount = validateCubicleCount(cubicleCount);
      
      const project = projects.get(projectId);
      if (!project) {
        return sendError(res, 404, 'Project not found');
      }
      
      if (project.aiOffice) {
        return res.status(400).json({ error: 'AI Office already exists for this project' });
      }
      
      const aiOffice = await createAIOffice(project, validatedCount);
      await saveProjects();
      
      res.json(aiOffice);
    } catch (error) {
      console.error('Error creating AI Office:', error);
      sendError(res, 500, error.message);
    }
  });

  router.delete('/:id/ai-office', asyncHandler(async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project) {
        return sendError(res, 404, 'Project not found');
      }
      
      await removeAIOffice(project, sessions);
      await saveProjects();
      res.json({ deleted: true });
    } catch (error) {
      sendError(res, 500, error.message);
    }
  }));

  // Add cubicle to existing AI Office
  router.post('/:id/ai-office/cubicle', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
      }
      
      // Use highestCubicleNum if available, otherwise find it from existing cubicles
      let nextCubicleNum;
      if (project.aiOffice.highestCubicleNum !== undefined) {
        nextCubicleNum = project.aiOffice.highestCubicleNum + 1;
      } else {
        // Fallback for existing AI offices without highestCubicleNum
        let maxCubicleNum = 0;
        project.aiOffice.cubicles.forEach(cubicle => {
          const match = cubicle.name.match(/cubicle-(\d+)/);
          if (match) {
            const num = parseInt(match[1]);
            if (num > maxCubicleNum) {
              maxCubicleNum = num;
            }
          }
        });
        nextCubicleNum = maxCubicleNum + 1;
        // Initialize highestCubicleNum for backwards compatibility
        project.aiOffice.highestCubicleNum = maxCubicleNum;
      }
      
      const newCubicle = await addCubicle(project, nextCubicleNum);
      
      // Update project
      project.aiOffice.cubicles.push(newCubicle);
      project.aiOffice.cubicleCount = project.aiOffice.cubicles.length;
      project.aiOffice.highestCubicleNum = nextCubicleNum;
      
      await saveProjects();
      res.json({ cubicle: newCubicle });
    } catch (error) {
      console.error('Error adding cubicle:', error);
      sendError(res, 500, error.message);
    }
  });

  // Sync AI Office cubicles with parent project
  router.post('/:id/ai-office/sync', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
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
      sendError(res, 500, error.message);
    }
  });

  // Remove cubicle from AI Office
  router.delete('/:id/ai-office/cubicle/:cubicleIdx', asyncHandler(async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return sendError(res, 400, 'Invalid cubicle index');
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
      sendError(res, 500, error.message);
    }
  }));

  // Refresh all cubicles from GitHub
  router.post('/:id/ai-office/refresh-all', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
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
      sendError(res, 500, error.message);
    }
  });

  // Pull from main in all cubicles
  router.post('/:id/ai-office/pull-all', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
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
      sendError(res, 500, error.message);
    }
  });

  // Reset all cubicles
  router.post('/:id/ai-office/reset-all', async (req, res) => {
    // Set a longer timeout for this operation
    req.setTimeout(300000); // 5 minutes
    
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
      }
      
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // Store current cubicle count only (reset modes to default)
      const cubicleCount = project.aiOffice.cubicleCount;
      
      // Kill all tmux sessions for this AI Office
      for (const cubicle of project.aiOffice.cubicles) {
        const sessionName = `ai-office-${project.id}-${cubicle.name}`;
        try {
          await execPromise(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
          sessions.delete(sessionName);
        } catch (e) {
          // Ignore errors
        }
      }
      
      // Remove entire ai-office directory
      const aiOfficePath = path.join(project.path, 'ai-office');
      try {
        await fs.rm(aiOfficePath, { recursive: true, force: true });
      } catch (e) {
        console.error('Error removing ai-office directory:', e);
      }
      
      // Recreate AI Office from scratch with default mode
      const newAiOffice = await createAIOffice(project, cubicleCount);
      
      await saveProjects();
      res.json({ reset: newAiOffice.cubicles.length, total: newAiOffice.cubicles.length });
    } catch (error) {
      console.error('Error resetting cubicles:', error);
      sendError(res, 500, error.message);
    }
  });

  // Refresh individual cubicle from GitHub
  router.post('/:id/ai-office/cubicle/:cubicleIdx/refresh', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
      }
      
      if (!project.githubUrl) {
        return res.status(400).json({ error: 'No GitHub URL configured' });
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return sendError(res, 400, 'Invalid cubicle index');
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
      sendError(res, 500, error.message);
    }
  });

  // Pull from main in individual cubicle
  router.post('/:id/ai-office/cubicle/:cubicleIdx/pull', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return sendError(res, 400, 'Invalid cubicle index');
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
      sendError(res, 500, error.message);
    }
  });

  // Set AI mode for cubicles
  router.post('/:id/ai-office/set-mode', async (req, res) => {
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
      }
      
      const { mode, target, cubicleIdx } = req.body;
      const aiModes = require('../../config/ai-modes');
      
      if (!aiModes.modes[mode]) {
        return res.status(400).json({ error: 'Invalid AI mode' });
      }
      
      if (target === 'all') {
        // Apply mode to all cubicles
        for (const cubicle of project.aiOffice.cubicles) {
          cubicle.aiMode = mode;
          await updateCubicleAIReadme(project, cubicle, aiModes.modes[mode]);
        }
      } else if (target === 'cubicle' && cubicleIdx !== undefined) {
        // Apply mode to specific cubicle
        if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
          return sendError(res, 400, 'Invalid cubicle index');
        }
        
        const cubicle = project.aiOffice.cubicles[cubicleIdx];
        cubicle.aiMode = mode;
        await updateCubicleAIReadme(project, cubicle, aiModes.modes[mode]);
      } else {
        return res.status(400).json({ error: 'Invalid target' });
      }
      
      await saveProjects();
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting AI mode:', error);
      sendError(res, 500, error.message);
    }
  });
  
  // Helper function to update AI readme with mode
  async function updateCubicleAIReadme(project, cubicle, modeConfig) {
    const aiReadmePath = path.join(cubicle.path, '.AI_README');
    
    // If default mode is selected, remove the .AI_README file
    if (cubicle.aiMode === 'default') {
      try {
        await fs.unlink(aiReadmePath);
      } catch (err) {
        // File might not exist, ignore error
        if (err.code !== 'ENOENT') {
          console.error('Error removing .AI_README:', err);
        }
      }
      return;
    }
    
    // For non-default modes, create/update .AI_README
    const cubicleNum = cubicle.name.split('-')[1];
    
    let content = `# Cubicle ${cubicleNum} - AI Workspace

## Important Rules for AI

1. **You are in an isolated cubicle workspace** - Changes here won't affect the main project
2. **All project files are in the current directory** - No need to navigate elsewhere
3. **Use git to track your changes** - The cubicle has its own git history
4. **Your changes are preserved** until explicitly synced or reset

## Project Details
- **Project:** ${project.name}
- **Path:** ${cubicle.path}
${project.githubUrl ? `- **GitHub:** ${project.githubUrl}` : ''}
- **AI Mode:** ${modeConfig.name}

## Guidelines
- You are already in the project root - no need to change directories
- Make all changes directly in this directory
- Test thoroughly before suggesting merges to main project
- Use git commits to document your work
- This workspace is specifically for AI experimentation
- When ready, changes can be reviewed and potentially merged back
`;

    // Add mode-specific instructions
    if (modeConfig.instructions) {
      content += `\n${modeConfig.instructions}\n`;
    }
    
    await fs.writeFile(aiReadmePath, content);
  }

  // Reset individual cubicle
  router.post('/:id/ai-office/cubicle/:cubicleIdx/reset', async (req, res) => {
    // Set a longer timeout for this operation
    req.setTimeout(120000); // 2 minutes
    
    try {
      const project = projects.get(req.params.id);
      if (!project || !project.aiOffice) {
        return sendError(res, 404, 'AI Office not found');
      }
      
      const cubicleIdx = parseInt(req.params.cubicleIdx);
      if (cubicleIdx < 0 || cubicleIdx >= project.aiOffice.cubicles.length) {
        return sendError(res, 400, 'Invalid cubicle index');
      }
      
      const cubicle = project.aiOffice.cubicles[cubicleIdx];
      const cubicleNum = parseInt(cubicle.name.split('-')[1]);
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // Reset to default mode
      const currentMode = 'default';
      
      // Kill tmux session for this cubicle
      const sessionName = `ai-office-${project.id}-${cubicle.name}`;
      try {
        await execPromise(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
        sessions.delete(sessionName);
      } catch (e) {
        // Ignore errors
      }
      
      // Remove cubicle directory completely
      try {
        await fs.rm(cubicle.path, { recursive: true, force: true });
      } catch (e) {
        console.error('Error removing cubicle directory:', e);
      }
      
      // Recreate the cubicle from scratch
      const newCubicle = await addCubicle(project, cubicleNum);
      
      // Update the cubicle in the array
      project.aiOffice.cubicles[cubicleIdx] = newCubicle;
      
      // AI mode is now default (no need to restore)
      
      await saveProjects();
      res.json({ reset: true });
    } catch (error) {
      console.error('Error resetting cubicle:', error);
      sendError(res, 500, error.message);
    }
  });

  return router;
};