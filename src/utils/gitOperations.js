const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execPromise = promisify(exec);

class GitOperations {
    constructor(baseDir) {
        this.baseDir = baseDir;
    }

    async clone(repoUrl, targetDir, options = {}) {
        const { branch = 'main', depth = 1 } = options;
        const targetPath = path.join(this.baseDir, targetDir);
        
        try {
            await fs.mkdir(targetPath, { recursive: true });
            
            const cloneCmd = `git clone --depth ${depth} -b ${branch} "${repoUrl}" "${targetPath}"`;
            const { stdout, stderr } = await execPromise(cloneCmd);
            
            return { success: true, stdout, stderr, path: targetPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async pull(projectDir) {
        const projectPath = path.join(this.baseDir, projectDir);
        
        try {
            const { stdout, stderr } = await execPromise('git pull', { cwd: projectPath });
            return { success: true, stdout, stderr };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async status(projectDir) {
        const projectPath = path.join(this.baseDir, projectDir);
        
        try {
            const { stdout } = await execPromise('git status --porcelain', { cwd: projectPath });
            return { success: true, status: stdout };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getCurrentBranch(projectDir) {
        const projectPath = path.join(this.baseDir, projectDir);
        
        try {
            const { stdout } = await execPromise('git branch --show-current', { cwd: projectPath });
            return { success: true, branch: stdout.trim() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getRemoteUrl(projectDir) {
        const projectPath = path.join(this.baseDir, projectDir);
        
        try {
            const { stdout } = await execPromise('git remote get-url origin', { cwd: projectPath });
            return { success: true, url: stdout.trim() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async isGitRepo(projectDir) {
        const projectPath = path.join(this.baseDir, projectDir);
        
        try {
            await fs.access(path.join(projectPath, '.git'));
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = GitOperations;