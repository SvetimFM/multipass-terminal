const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// AI Office Management
async function createAIOffice(project, cubicleCount = 3) {
  console.log('Creating AI Office for project:', project.id);
  
  const aiOfficePath = path.join(project.path, 'ai-office');
  console.log('AI Office path:', aiOfficePath);
  
  // Create ai-office directory
  await fs.mkdir(aiOfficePath, { recursive: true });
  
  // Check if project has a GitHub URL
  const githubUrl = project.githubUrl || null;
  
  // Create cubicles
  const cubicles = [];
  for (let i = 1; i <= cubicleCount; i++) {
    const cubiclePath = path.join(aiOfficePath, `cubicle-${i}`);
    await fs.mkdir(cubiclePath, { recursive: true });
    
    // Clone GitHub repository if available
    if (githubUrl) {
      try {
        console.log(`Cloning repository ${githubUrl} into cubicle-${i}...`);
        
        // Clone the repository into the cubicle root directory
        const { stdout, stderr } = await execPromise(`git clone "${githubUrl}" .`, {
          cwd: cubiclePath,
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large repos
        });
        
        if (stdout) console.log(`Clone output: ${stdout}`);
        if (stderr) console.log(`Clone stderr: ${stderr}`);
        
        // Create instructions for working within the repository copy
        await fs.writeFile(
          path.join(cubiclePath, '.AI_README'),
          `# Cubicle ${i} - AI Workspace

## Important Rules for AI

1. **You are in an isolated cubicle workspace** - Changes here won't affect the main project
2. **All project files are in the current directory** - No need to navigate elsewhere  
3. **Use git to track your changes** - The cubicle has its own git history
4. **Sync with parent** updates this cubicle with latest changes from main project
5. **Your changes are preserved** until explicitly synced or reset

## Project Details
- **Project:** ${project.name}
- **Path:** ${cubiclePath}
- **GitHub:** ${githubUrl}
- **Cloned from:** Repository was cloned directly into this cubicle

## Guidelines
- You are already in the project root - no need to change directories
- Make all changes directly in this directory
- Test thoroughly before suggesting merges to main project
- Use git commits to document your work
- This workspace is specifically for AI experimentation
- When ready, changes can be reviewed and potentially merged back
`
        );
      } catch (error) {
        console.error(`Failed to clone repository for cubicle-${i}:`, error);
        // Fall back to creating a simple README if cloning fails
        await fs.writeFile(
          path.join(cubiclePath, '.AI_README'),
          `# Cubicle ${i}\n\nAI workspace for ${project.name}\n\nNote: Failed to clone repository from ${githubUrl}`
        );
      }
    } else {
      // No GitHub URL, sync from parent project
      try {
        console.log(`Syncing parent project files to cubicle-${i}...`);
        await execPromise(`rsync -av --exclude="ai-office/" --exclude=".git/" "${project.path}/" "${cubiclePath}/"`, {
          maxBuffer: 1024 * 1024 * 10
        });
      } catch (error) {
        console.error(`Failed to sync parent project for cubicle-${i}:`, error);
      }
      
      // Create AI README with rules
      await fs.writeFile(
        path.join(cubiclePath, '.AI_README'),
        `# Cubicle ${i} - AI Workspace

## Important Rules for AI

1. **You are in an isolated cubicle workspace** - Changes here won't affect the main project
2. **All project files are in the current directory** - No need to navigate elsewhere
3. **Use git to track your changes** - The cubicle has its own git history
4. **Sync with parent** updates this cubicle with latest changes from main project
5. **Your changes are preserved** until explicitly synced or reset

## Project: ${project.name}
## Path: ${cubiclePath}

## Guidelines
- Make all changes directly in this directory
- Test thoroughly before suggesting merges to main project
- Use git commits to document your work
- This workspace is specifically for AI experimentation
`
      );
    }
    
    cubicles.push({
      name: `cubicle-${i}`,
      path: cubiclePath
    });
  }
  
  // Update project with AI Office info
  project.aiOffice = {
    enabled: true,
    cubicleCount,
    cubicles,
    createdAt: new Date().toISOString()
  };
  
  return project.aiOffice;
}

async function removeAIOffice(project, sessions) {
  if (!project || !project.aiOffice) return;
  
  const aiOfficePath = path.join(project.path, 'ai-office');
  
  // Kill all tmux sessions for this AI Office
  if (project.aiOffice.cubicles) {
    for (const cubicle of project.aiOffice.cubicles) {
      const sessionName = `ai-office-${project.id}-${cubicle.name}`;
      try {
        await new Promise((resolve) => {
          exec(`tmux kill-session -t "${sessionName}"`, (error) => {
            if (error) {
              console.log(`No tmux session found for ${sessionName}, continuing...`);
            }
            resolve();
          });
        });
        // Remove session metadata
        sessions.delete(sessionName);
      } catch (e) {
        console.error('Error killing tmux session:', e);
      }
    }
  }
  
  // Remove directory
  try {
    await fs.rm(aiOfficePath, { recursive: true, force: true });
  } catch (e) {
    console.error('Error removing AI Office:', e);
  }
  
  // Update project
  delete project.aiOffice;
}

async function addCubicle(project, cubicleNum) {
  const cubiclePath = path.join(project.path, 'ai-office', `cubicle-${cubicleNum}`);
  
  // Create cubicle directory
  await fs.mkdir(cubiclePath, { recursive: true });
  
  // Clone GitHub repository if available
  const githubUrl = project.githubUrl || null;
  if (githubUrl) {
    try {
      console.log(`Cloning repository ${githubUrl} into cubicle-${cubicleNum}...`);
      
      // Clone the repository into the cubicle root directory
      const { stdout, stderr } = await execPromise(`git clone "${githubUrl}" .`, {
        cwd: cubiclePath,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large repos
      });
      
      if (stdout) console.log(`Clone output: ${stdout}`);
      if (stderr) console.log(`Clone stderr: ${stderr}`);
      
      // Create instructions for working within the repository copy
      await fs.writeFile(
        path.join(cubiclePath, '.AI_README'),
        `# Cubicle ${cubicleNum} - AI Workspace

## Important Rules for AI

1. **You are in an isolated cubicle workspace** - Changes here won't affect the main project
2. **All project files are in the current directory** - No need to navigate elsewhere  
3. **Use git to track your changes** - The cubicle has its own git history
4. **Sync with parent** updates this cubicle with latest changes from main project
5. **Your changes are preserved** until explicitly synced or reset

## Project Details
- **Project:** ${project.name}
- **Path:** ${cubiclePath}
- **GitHub:** ${githubUrl}
- **Cloned from:** Repository was cloned directly into this cubicle

## Guidelines
- You are already in the project root - no need to change directories
- Make all changes directly in this directory
- Test thoroughly before suggesting merges to main project
- Use git commits to document your work
- This workspace is specifically for AI experimentation
- When ready, changes can be reviewed and potentially merged back
`
      );
    } catch (error) {
      console.error(`Failed to clone repository for cubicle-${cubicleNum}:`, error);
      // Fall back to creating a simple README if cloning fails
      await fs.writeFile(
        path.join(cubiclePath, '.AI_README'),
        `# Cubicle ${cubicleNum}\n\nAI workspace for ${project.name}\n\nNote: Failed to clone repository from ${githubUrl}`
      );
    }
  } else {
    // No GitHub URL, sync from parent project
    try {
      console.log(`Syncing parent project files to cubicle-${cubicleNum}...`);
      await execPromise(`rsync -av --exclude="ai-office/" --exclude=".git/" "${project.path}/" "${cubiclePath}/"`, {
        maxBuffer: 1024 * 1024 * 10
      });
    } catch (error) {
      console.error(`Failed to sync parent project for cubicle-${cubicleNum}:`, error);
    }
    
    // Create AI README with rules
    await fs.writeFile(
      path.join(cubiclePath, '.AI_README'),
      `# Cubicle ${cubicleNum} - AI Workspace

## Important Rules for AI

1. **You are in an isolated cubicle workspace** - Changes here won't affect the main project
2. **All project files are in the current directory** - No need to navigate elsewhere
3. **Use git to track your changes** - The cubicle has its own git history
4. **Sync with parent** updates this cubicle with latest changes from main project
5. **Your changes are preserved** until explicitly synced or reset

## Project: ${project.name}
## Path: ${cubiclePath}

## Guidelines
- Make all changes directly in this directory
- Test thoroughly before suggesting merges to main project
- Use git commits to document your work
- This workspace is specifically for AI experimentation
`
    );
  }
  
  return {
    name: `cubicle-${cubicleNum}`,
    path: cubiclePath
  };
}

async function removeCubicle(project, cubicleIdx, sessions) {
  const cubicle = project.aiOffice.cubicles[cubicleIdx];
  
  // Kill tmux session associated with this cubicle
  const sessionName = `ai-office-${project.id}-${cubicle.name}`;
  try {
    await new Promise((resolve, reject) => {
      exec(`tmux kill-session -t "${sessionName}"`, (error) => {
        if (error) {
          console.log(`No tmux session found for ${sessionName}, continuing...`);
        }
        resolve();
      });
    });
    
    // Remove session metadata
    sessions.delete(sessionName);
  } catch (e) {
    console.error('Error killing tmux session:', e);
  }
  
  // Remove directory
  try {
    await fs.rm(cubicle.path, { recursive: true, force: true });
  } catch (e) {
    console.error('Error removing cubicle directory:', e);
  }
  
  // Update project
  project.aiOffice.cubicles.splice(cubicleIdx, 1);
  project.aiOffice.cubicleCount = project.aiOffice.cubicles.length;
}

module.exports = {
  createAIOffice,
  removeAIOffice,
  addCubicle,
  removeCubicle
};