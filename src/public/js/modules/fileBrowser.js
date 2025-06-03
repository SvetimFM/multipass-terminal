// File browser functions
import { state, setState } from './state.js';
import { showToast } from './utils.js';

export async function browseFolder(folder = '') {
  try {
    const response = await fetch(`/api/browse?path=${encodeURIComponent(folder)}`);
    if (!response.ok) {
      throw new Error('Failed to browse folder');
    }
    const data = await response.json();
    
    setState('currentPath', data.path);
    document.getElementById('selected-folder').textContent = data.path;
    
    const folderList = document.getElementById('folder-list');
    folderList.innerHTML = '';
    
    // Add parent directory option if not at root
    if (data.path !== '/') {
      const parentDiv = document.createElement('div');
      parentDiv.className = 'p-2 hover:bg-gray-700 cursor-pointer flex items-center';
      parentDiv.innerHTML = '<span class="mr-2">📁</span><span class="text-blue-400">..</span>';
      parentDiv.onclick = () => {
        const parentPath = data.path.split('/').slice(0, -1).join('/') || '/';
        browseFolder(parentPath);
      };
      folderList.appendChild(parentDiv);
    }
    
    // Add folders
    data.folders.forEach(folder => {
      const folderDiv = document.createElement('div');
      folderDiv.className = 'p-2 hover:bg-gray-700 cursor-pointer flex items-center';
      folderDiv.innerHTML = `<span class="mr-2">📁</span><span>${folder.name}</span>`;
      folderDiv.onclick = () => browseFolder(folder.path);
      folderList.appendChild(folderDiv);
    });
  } catch (error) {
    console.error('Error browsing folder:', error);
    showToast('Failed to browse folder');
  }
}

export function openFileBrowser() {
  document.getElementById('file-browser-modal').classList.remove('hidden');
  browseFolder(state.currentPath || '');
}

export function closeFileBrowser() {
  document.getElementById('file-browser-modal').classList.add('hidden');
}