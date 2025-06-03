// Cubicle Management Functions
import { state } from './state.js';
import { showToast, showLoading, hideLoading } from './utils.js';
import { loadProjects } from './projects.js';
import { openAIOfficeGrid } from './aiOffice.js';

export function openCubicleManagement() {
  if (!state.currentAIOfficeProject) return;
  
  document.getElementById('cubicle-management-modal').classList.remove('hidden');
  populateCubicleManagementList();
}

export function closeCubicleManagement() {
  document.getElementById('cubicle-management-modal').classList.add('hidden');
}

export function populateCubicleManagementList() {
  if (!state.currentAIOfficeProject || !state.currentAIOfficeProject.aiOffice) return;
  
  const listContainer = document.getElementById('cubicle-management-list');
  listContainer.innerHTML = '';
  
  state.currentAIOfficeProject.aiOffice.cubicles.forEach((cubicle, idx) => {
    const cubicleDiv = document.createElement('div');
    cubicleDiv.className = 'bg-gray-800 p-3 rounded';
    cubicleDiv.innerHTML = `
      <div class="flex justify-between items-center mb-2">
        <div>
          <div class="font-semibold">${cubicle.name}</div>
          <div class="text-xs text-gray-400 font-mono">${cubicle.path}</div>
          <div class="text-xs text-gray-500 mt-1">Mode: <span class="text-purple-400">${cubicle.aiMode || 'default'}</span></div>
        </div>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button onclick="window.cubicleManagement.refreshCubicle('${state.currentAIOfficeProject.id}', ${idx})" 
                class="px-3 py-1 bg-blue-600 rounded text-sm" title="Refresh from GitHub">
          🔄 Refresh
        </button>
        <button onclick="window.cubicleManagement.pullFromMainCubicle('${state.currentAIOfficeProject.id}', ${idx})" 
                class="px-3 py-1 bg-green-600 rounded text-sm" title="Pull from main">
          ⬇️ Pull
        </button>
        <button onclick="window.cubicleManagement.resetCubicle('${state.currentAIOfficeProject.id}', ${idx})" 
                class="px-3 py-1 bg-yellow-600 rounded text-sm" title="Reset cubicle">
          ⚠️ Reset
        </button>
        <button onclick="window.cubicleManagement.deleteCubicleFromManagement('${state.currentAIOfficeProject.id}', ${idx})" 
                class="px-3 py-1 bg-red-600 rounded text-sm" title="Delete cubicle">
          🗑️ Delete
        </button>
      </div>
    `;
    listContainer.appendChild(cubicleDiv);
  });
}

// Bulk cubicle operations
export async function refreshAllCubicles() {
  if (!state.currentAIOfficeProject || !state.currentAIOfficeProject.githubUrl) {
    alert('No GitHub URL configured for this project');
    return;
  }
  
  if (!confirm('This will refresh all cubicles from GitHub, discarding any uncommitted changes. Continue?')) {
    return;
  }
  
  // Show loading overlay
  showLoading('Refreshing all cubicles from GitHub...');
  
  try {
    const response = await fetch(`/api/projects/${state.currentAIOfficeProject.id}/ai-office/refresh-all`, {
      method: 'POST'
    });
    
    if (response.ok) {
      const result = await response.json();
      
      // Reload projects
      await loadProjects();
      
      // Hide loading
      hideLoading();
      
      // Show success
      showToast(`Refreshed ${result.refreshed} cubicles successfully`);
      
      // Refresh the grid
      setTimeout(() => openAIOfficeGrid(state.currentAIOfficeProject.id), 300);
    } else {
      hideLoading();
      const error = await response.json();
      alert('Failed to refresh cubicles: ' + error.error);
    }
  } catch (error) {
    hideLoading();
    console.error('Error refreshing cubicles:', error);
    alert('Error refreshing cubicles: ' + error.message);
  }
}

export async function pullFromMainAll() {
  if (!confirm('This will pull latest changes from main branch in all cubicles. Continue?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${state.currentAIOfficeProject.id}/ai-office/pull-all`, {
      method: 'POST'
    });
    
    if (response.ok) {
      const result = await response.json();
      alert(`Successfully pulled updates in ${result.pulled} cubicles`);
    } else {
      const error = await response.json();
      alert('Failed to pull updates: ' + error.error);
    }
  } catch (error) {
    console.error('Error pulling updates:', error);
    alert('Error pulling updates: ' + error.message);
  }
}

export async function resetAllCubicles() {
  if (!confirm('This will reset ALL cubicles to a clean state, removing all changes and recreating from scratch. Continue?')) {
    return;
  }
  
  if (!confirm('Are you absolutely sure? All work in all cubicles will be lost!')) {
    return;
  }
  
  // Show loading overlay
  showLoading('Resetting all cubicles... This may take a moment.');
  
  try {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
    
    const response = await fetch(`/api/projects/${state.currentAIOfficeProject.id}/ai-office/reset-all`, {
      method: 'POST',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const result = await response.json();
      
      // Reload projects to get fresh state
      await loadProjects();
      
      // Hide loading before UI updates
      hideLoading();
      
      // Close management modal
      closeCubicleManagement();
      
      // Show success message
      showToast(`Reset ${result.reset} cubicles successfully`);
      
      // Reopen AI Office grid after a short delay
      setTimeout(() => openAIOfficeGrid(state.currentAIOfficeProject.id), 300);
    } else {
      hideLoading();
      const error = await response.json();
      alert('Failed to reset cubicles: ' + error.error);
    }
  } catch (error) {
    hideLoading();
    console.error('Error resetting cubicles:', error);
    if (error.name === 'AbortError') {
      alert('Reset operation timed out. Please try again or reset cubicles individually.');
    } else {
      alert('Error resetting cubicles: ' + error.message);
    }
  }
}

// Individual cubicle operations
export async function refreshCubicle(projectId, cubicleIdx) {
  if (!state.currentAIOfficeProject.githubUrl) {
    alert('No GitHub URL configured for this project');
    return;
  }
  
  if (!confirm('This will refresh this cubicle from GitHub, discarding any uncommitted changes. Continue?')) {
    return;
  }
  
  // Show loading overlay
  showLoading('Refreshing cubicle from GitHub...');
  
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office/cubicle/${cubicleIdx}/refresh`, {
      method: 'POST'
    });
    
    if (response.ok) {
      // Reload projects
      await loadProjects();
      
      // Hide loading
      hideLoading();
      
      // Show success
      showToast('Cubicle refreshed successfully');
      
      // Update management list
      populateCubicleManagementList();
      
      // If AI Office grid is open, refresh it
      if (state.currentAIOfficeProject && !document.getElementById('ai-office-grid').classList.contains('hidden')) {
        setTimeout(() => openAIOfficeGrid(projectId), 300);
      }
    } else {
      hideLoading();
      const error = await response.json();
      alert('Failed to refresh cubicle: ' + error.error);
    }
  } catch (error) {
    hideLoading();
    console.error('Error refreshing cubicle:', error);
    alert('Error refreshing cubicle: ' + error.message);
  }
}

export async function pullFromMainCubicle(projectId, cubicleIdx) {
  if (!confirm('Pull latest changes from main branch?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office/cubicle/${cubicleIdx}/pull`, {
      method: 'POST'
    });
    
    if (response.ok) {
      alert('Successfully pulled latest changes');
    } else {
      const error = await response.json();
      alert('Failed to pull changes: ' + error.error);
    }
  } catch (error) {
    console.error('Error pulling changes:', error);
    alert('Error pulling changes: ' + error.message);
  }
}

export async function resetCubicle(projectId, cubicleIdx) {
  if (!confirm('This will reset this cubicle to a clean state, removing all changes and recreating from scratch. Continue?')) {
    return;
  }
  
  // Show loading overlay
  showLoading('Resetting cubicle... This may take a moment.');
  
  try {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
    
    const response = await fetch(`/api/projects/${projectId}/ai-office/cubicle/${cubicleIdx}/reset`, {
      method: 'POST',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      // Reload projects to get fresh state
      await loadProjects();
      
      // Hide loading
      hideLoading();
      
      // Update the management list
      populateCubicleManagementList();
      
      // Show success message
      showToast('Cubicle reset successfully');
      
      // If AI Office grid is open, refresh it
      if (state.currentAIOfficeProject && !document.getElementById('ai-office-grid').classList.contains('hidden')) {
        setTimeout(() => openAIOfficeGrid(projectId), 300);
      }
    } else {
      hideLoading();
      const error = await response.json();
      alert('Failed to reset cubicle: ' + error.error);
    }
  } catch (error) {
    hideLoading();
    console.error('Error resetting cubicle:', error);
    if (error.name === 'AbortError') {
      alert('Reset operation timed out. Please try again.');
    } else {
      alert('Error resetting cubicle: ' + error.message);
    }
  }
}

export async function deleteCubicleFromManagement(projectId, cubicleIdx) {
  if (!confirm('Delete this cubicle?')) return;
  
  try {
    const response = await fetch(`/api/projects/${projectId}/ai-office/cubicle/${cubicleIdx}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadProjects();
      openAIOfficeGrid(projectId);
      closeCubicleManagement();
    } else {
      const error = await response.json();
      alert('Failed to delete cubicle: ' + error.error);
    }
  } catch (error) {
    console.error('Error deleting cubicle:', error);
    alert('Error deleting cubicle: ' + error.message);
  }
}

export async function addMultipleCubicles() {
  const count = parseInt(document.getElementById('new-cubicle-count').value);
  if (isNaN(count) || count < 1 || count > 5) {
    alert('Please enter a number between 1 and 5');
    return;
  }
  
  try {
    let added = 0;
    for (let i = 0; i < count; i++) {
      const response = await fetch(`/api/projects/${state.currentAIOfficeProject.id}/ai-office/cubicle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        added++;
      }
    }
    
    if (added > 0) {
      alert(`Successfully added ${added} cubicle(s)`);
      await loadProjects();
      openAIOfficeGrid(state.currentAIOfficeProject.id);
      closeCubicleManagement();
    }
  } catch (error) {
    console.error('Error adding cubicles:', error);
    alert('Error adding cubicles: ' + error.message);
  }
}

// Mode selection functions removed - now using dropdowns in AI Office view