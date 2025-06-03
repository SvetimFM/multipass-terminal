// Project management functions
import { state } from './state.js';
import { isMobile, copyToClipboard } from './utils.js';

export async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      throw new Error('Failed to load projects');
    }
    const data = await response.json();
    
    const projectsList = document.getElementById('projects-list');
    const projectSelect = document.getElementById('project-select');
    
    projectsList.innerHTML = '';
    projectSelect.innerHTML = '';
    
    data.projects.forEach(project => {
      renderProject(project, projectsList);
      
      // Project select
      projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`;
    });
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

function renderProject(project, container) {
  const hasAIOffice = project.aiOffice && project.aiOffice.enabled;
  const mobile = isMobile();
  
  const projectHtml = `
    <div class="bg-gray-800 p-3 rounded ${mobile ? 'space-y-3' : 'flex justify-between items-center'}">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <div class="font-semibold text-base md:text-sm">${project.name}</div>
          ${mobile ? `<button onclick="window.utils.copyToClipboard('${project.name}', 'Project name copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded" title="Copy project name">📋</button>` : ''}
        </div>
        <div class="flex items-center gap-2">
          <div class="text-xs text-gray-400 font-mono">${project.path}</div>
          ${mobile ? `<button onclick="window.utils.copyToClipboard('${project.path}', 'Path copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded" title="Copy path">📋</button>` : ''}
        </div>
        ${project.githubUrl ? `
          <div class="flex items-center gap-2">
            <div class="text-xs text-blue-400 mt-1">GitHub: ${project.githubUrl}</div>
            ${mobile ? `<button onclick="window.utils.copyToClipboard('${project.githubUrl}', 'GitHub URL copied!')" class="text-xs bg-gray-700 px-2 py-1 rounded" title="Copy GitHub URL">📋</button>` : ''}
          </div>` : ''}
        ${hasAIOffice ? `<div class="text-xs text-purple-400 mt-1">AI Office: ${project.aiOffice.cubicleCount} cubicles</div>` : ''}
      </div>
      <div class="${mobile ? 'project-actions' : 'flex gap-2 flex-wrap'}">
        ${hasAIOffice ? 
          `<button onclick="window.aiOffice.openAIOfficeGrid('${project.id}')" class="bg-purple-600 ${mobile ? 'secondary-button' : 'px-2 py-1'} rounded ${mobile ? '' : 'text-xs'}">🏢 View AI Office</button>
           <button onclick="window.aiOffice.removeAIOffice('${project.id}')" class="bg-red-600 ${mobile ? 'secondary-button' : 'px-2 py-1'} rounded ${mobile ? '' : 'text-xs'}">🗑️ Remove Office</button>` :
          `<button onclick="window.aiOffice.setupAIOffice('${project.id}')" class="bg-purple-600 ${mobile ? 'secondary-button' : 'px-2 py-1'} rounded ${mobile ? '' : 'text-xs'}">🏢 Setup AI Office</button>`
        }
        ${project.id !== 'default' ? 
          `<button onclick="window.projects.deleteProject('${project.id}')" class="bg-red-600 ${mobile ? 'secondary-button' : 'px-2 py-1'} rounded ${mobile ? '' : 'text-xs'}">🗑️ Delete Project</button>` : 
          ''
        }
      </div>
    </div>
  `;
  
  container.innerHTML += projectHtml;
}

export async function addProject() {
  // Get the selected path from the file browser
  const selectedPath = document.getElementById('selected-folder').textContent;
  const projectName = document.getElementById('project-name').value.trim();
  const githubUrl = document.getElementById('github-url').value.trim();
  
  if (!projectName) {
    alert('Please enter a project name');
    return;
  }
  
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: projectName, 
        path: selectedPath,
        githubUrl: githubUrl || undefined
      })
    });
    
    if (response.ok) {
      await loadProjects();
      document.getElementById('file-browser-modal').classList.add('hidden');
      document.getElementById('project-name').value = '';
      document.getElementById('github-url').value = '';
    } else {
      const error = await response.json();
      alert('Failed to add project: ' + error.error);
    }
  } catch (error) {
    console.error('Error adding project:', error);
    alert('Error adding project: ' + error.message);
  }
}

export async function deleteProject(projectId) {
  if (!confirm('Delete this project?')) return;
  
  try {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadProjects();
    } else {
      const error = await response.json();
      alert('Failed to delete project: ' + error.error);
    }
  } catch (error) {
    console.error('Error deleting project:', error);
    alert('Error deleting project: ' + error.message);
  }
}