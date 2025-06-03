// Session management functions
import { state } from './state.js';
import { showToast } from './utils.js';
import { attachTerminal } from './terminal.js';

export async function loadSessions() {
  try {
    const response = await fetch('/api/sessions');
    if (!response.ok) {
      throw new Error('Failed to load sessions');
    }
    const data = await response.json();
    
    const sessionsList = document.getElementById('sessions-list');
    sessionsList.innerHTML = '';
    
    data.sessions.forEach(session => {
      const sessionDiv = document.createElement('div');
      sessionDiv.className = 'bg-gray-800 p-3 rounded flex justify-between items-center';
      sessionDiv.innerHTML = `
        <div>
          <div class="font-semibold">${session.name}</div>
          <div class="text-xs text-gray-400 font-mono">${session.path}</div>
        </div>
        <div class="flex gap-2">
          <button onclick="window.terminal.attachTerminal('${session.name}')" class="bg-blue-600 px-3 py-1 rounded text-sm">Connect</button>
          <button onclick="window.sessions.killSession('${session.name}')" class="bg-red-600 px-3 py-1 rounded text-sm">Kill</button>
        </div>
      `;
      sessionsList.appendChild(sessionDiv);
    });
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}

export async function createSession() {
  const name = document.getElementById('session-name').value.trim();
  const projectId = document.getElementById('project-select').value;
  
  if (!name) {
    alert('Please enter a session name');
    return;
  }
  
  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, projectId })
    });
    
    if (response.ok) {
      document.getElementById('session-name').value = '';
      await loadSessions();
      // Auto-attach to the new session
      attachTerminal(name);
    } else {
      const error = await response.json();
      alert('Failed to create session: ' + error.error);
    }
  } catch (error) {
    console.error('Error creating session:', error);
    alert('Error creating session: ' + error.message);
  }
}

export async function killSession(name) {
  if (!confirm('Kill session ' + name + '?')) return;
  
  try {
    const response = await fetch('/api/sessions/' + name, { method: 'DELETE' });
    
    if (response.ok) {
      await loadSessions();
      showToast('Session killed');
    } else {
      const error = await response.json();
      alert('Failed to kill session: ' + error.error);
    }
  } catch (error) {
    console.error('Error killing session:', error);
    alert('Error killing session: ' + error.message);
  }
}

export function showSessions() {
  document.getElementById('projects-view').classList.add('hidden');
  document.getElementById('sessions-view').classList.remove('hidden');
  loadSessions();
}

export function showProjects() {
  document.getElementById('sessions-view').classList.add('hidden');
  document.getElementById('projects-view').classList.remove('hidden');
}