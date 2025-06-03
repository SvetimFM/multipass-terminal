// Utility functions shared across modules

// Constants
export const MOBILE_BREAKPOINT = 768;

// Show toast notification
export function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Import clipboard service and wrap with toast notifications
import { clipboardService } from '../clipboard.js';

export async function copyToClipboard(text, successMessage = 'Copied!') {
  const success = await clipboardService.copyToClipboard(text);
  if (success) {
    showToast(successMessage);
  } else {
    showToast('Copy failed');
  }
  return success;
}

// Check if mobile
export function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

// Show loading overlay
export function showLoading(text = 'Loading...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

// Hide loading overlay
export function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}