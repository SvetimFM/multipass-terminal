// Input validation utilities

const sanitizeName = (name) => {
  if (!name || typeof name !== 'string') {
    throw new Error('Name is required and must be a string');
  }
  // Remove special characters that could cause issues in tmux/shell
  return name.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 50);
};

const sanitizePath = (path) => {
  if (!path || typeof path !== 'string') {
    throw new Error('Path is required and must be a string');
  }
  // Basic path validation - prevent directory traversal
  if (path.includes('..')) {
    throw new Error('Invalid path: directory traversal not allowed');
  }
  return path;
};

const validateProjectId = (projectId) => {
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Project ID is required');
  }
  // Allow 'default' as a special case, or the standard format
  if (projectId !== 'default' && !projectId.match(/^proj-\d+$/)) {
    throw new Error('Invalid project ID format');
  }
  return projectId;
};

const validateCubicleCount = (count) => {
  const num = parseInt(count);
  if (isNaN(num) || num < 1 || num > 10) {
    throw new Error('Cubicle count must be between 1 and 10');
  }
  return num;
};

module.exports = {
  sanitizeName,
  sanitizePath,
  validateProjectId,
  validateCubicleCount
};