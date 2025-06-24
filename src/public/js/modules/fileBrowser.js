// File browser functions
import { state, setState } from './state.js';
import { showToast } from './utils.js';

export async function browseFolder(folder = '') {
  try {
    const response = await fetch(`/api/browse?path=${encodeURIComponent(folder)}`);
    if (!response.ok) {
      throw new Error('Failed to browse folder');
    }
    const entries = await response.json();
    
    // Set current path
    setState('currentPath', folder || entries[0]?.path?.split('/').slice(0, -1).join('/') || '/');
    document.getElementById('current-path').textContent = state.currentPath;
    
    const folderList = document.getElementById('file-list');
    folderList.innerHTML = '';
    
    // The API already includes .. directory if needed, so just iterate through all entries
    entries.forEach(entry => {
      if (entry.isDirectory) {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'p-2 hover:bg-gray-700 cursor-pointer flex items-center';
        if (entry.name === '..') {
          folderDiv.innerHTML = '<span class="mr-2">📁</span><span class="text-blue-400">..</span>';
        } else {
          folderDiv.innerHTML = `<span class="mr-2">📁</span><span>${entry.name}</span>`;
        }
        folderDiv.onclick = () => browseFolder(entry.path);
        folderList.appendChild(folderDiv);
      }
    });
  } catch (error) {
    console.error('Error browsing folder:', error);
    showToast('Failed to browse folder');
  }
}

export async function openFileBrowser() {
  document.getElementById('file-browser-modal').classList.remove('hidden');
  // Get home directory from server if not already set
  if (!state.currentPath) {
    try {
      const response = await fetch('/api/home');
      const data = await response.json();
      browseFolder(data.home);
    } catch (error) {
      browseFolder('~');
    }
  } else {
    browseFolder(state.currentPath);
  }
}

export function closeFileBrowser() {
  document.getElementById('file-browser-modal').classList.add('hidden');
}

export async function selectCurrentFolder() {
  const name = prompt('Project name:', state.currentPath.split('/').pop());
  if (!name) return;
  
  const githubUrl = prompt('GitHub repository URL (optional - press Enter to skip):');
  
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path: state.currentPath, githubUrl: githubUrl || null })
    });
    
    if (response.ok) {
      closeFileBrowser();
      // Import projects module dynamically to avoid circular dependency
      const { loadProjects } = await import('./projects.js');
      await loadProjects();
    }
  } catch (error) {
    console.error('Error creating project:', error);
    showToast('Error creating project');
  }
}