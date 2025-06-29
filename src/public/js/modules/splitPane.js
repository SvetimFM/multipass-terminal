// Split Pane functionality for multiproject view
import { showToast } from './utils.js';

// Split pane state
let paneIdCounter = 0;
const panes = new Map();
const MIN_PANE_SIZE = 200; // Minimum width/height in pixels

// Split orientation types
export const SPLIT_TYPE = {
  VERTICAL: 'vertical',   // Split left/right
  HORIZONTAL: 'horizontal' // Split top/bottom
};

// Pane class to represent each pane in the split layout
class Pane {
  constructor(parent = null, container = null) {
    this.id = `pane-${++paneIdCounter}`;
    this.parent = parent;
    this.container = container || this.createContainer();
    this.content = null;
    this.splitType = null;
    this.children = [];
    this.size = 50; // Percentage size within parent
    
    panes.set(this.id, this);
  }
  
  createContainer() {
    const div = document.createElement('div');
    div.className = 'split-pane';
    div.id = this.id;
    div.setAttribute('data-pane-id', this.id);
    return div;
  }
  
  split(orientation, maxVerticalPanes = 4) {
    if (this.children.length > 0) {
      showToast('Pane is already split');
      return null;
    }
    
    // Check vertical split limit
    if (orientation === SPLIT_TYPE.VERTICAL && !this.canSplitVertical(maxVerticalPanes)) {
      showToast(`Maximum ${maxVerticalPanes} projects allowed in vertical layout`);
      return null;
    }
    
    // Clear current content
    this.content = null;
    this.splitType = orientation;
    this.container.innerHTML = '';
    
    // Add split container class
    this.container.classList.add(`split-${orientation}`);
    
    // Create two child panes
    const child1 = new Pane(this);
    const child2 = new Pane(this);
    
    // Set initial sizes
    child1.size = 50;
    child2.size = 50;
    
    this.children = [child1, child2];
    
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = `split-resize-handle split-resize-${orientation}`;
    resizeHandle.innerHTML = '<div class="split-resize-grip"></div>';
    
    // Add elements to container
    this.container.appendChild(child1.container);
    this.container.appendChild(resizeHandle);
    this.container.appendChild(child2.container);
    
    // Update layout
    this.updateLayout();
    
    // Setup resize functionality
    this.setupResize(resizeHandle, child1, child2, orientation);
    
    return [child1, child2];
  }
  
  setupResize(handle, pane1, pane2, orientation) {
    let isResizing = false;
    let startPos = 0;
    let startSize1 = 0;
    let startSize2 = 0;
    let containerSize = 0;
    
    const handleStart = (e) => {
      isResizing = true;
      const isVertical = orientation === SPLIT_TYPE.VERTICAL;
      startPos = e.type.includes('touch') 
        ? (isVertical ? e.touches[0].clientX : e.touches[0].clientY)
        : (isVertical ? e.clientX : e.clientY);
      
      const rect = this.container.getBoundingClientRect();
      containerSize = isVertical ? rect.width : rect.height;
      startSize1 = pane1.size;
      startSize2 = pane2.size;
      
      document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
      this.container.classList.add('resizing');
      
      e.preventDefault();
      
      // Add global listeners
      if (e.type.includes('touch')) {
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);
      } else {
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
      }
    };
    
    const handleMove = (e) => {
      if (!isResizing) return;
      
      const isVertical = orientation === SPLIT_TYPE.VERTICAL;
      const currentPos = e.type.includes('touch')
        ? (isVertical ? e.touches[0].clientX : e.touches[0].clientY)
        : (isVertical ? e.clientX : e.clientY);
      
      const delta = currentPos - startPos;
      const deltaPercent = (delta / containerSize) * 100;
      
      // Calculate new sizes
      let newSize1 = startSize1 + deltaPercent;
      let newSize2 = startSize2 - deltaPercent;
      
      // Apply minimum size constraints
      const minSizePercent = (MIN_PANE_SIZE / containerSize) * 100;
      
      if (newSize1 < minSizePercent) {
        newSize1 = minSizePercent;
        newSize2 = 100 - minSizePercent;
      } else if (newSize2 < minSizePercent) {
        newSize2 = minSizePercent;
        newSize1 = 100 - minSizePercent;
      }
      
      // Update sizes
      pane1.size = newSize1;
      pane2.size = newSize2;
      
      // Update layout
      this.updateLayout();
      
      if (e.type.includes('touch')) {
        e.preventDefault();
      }
    };
    
    const handleEnd = () => {
      if (!isResizing) return;
      
      isResizing = false;
      document.body.style.cursor = '';
      this.container.classList.remove('resizing');
      
      // Trigger resize events for terminal fitting
      window.dispatchEvent(new Event('resize'));
      
      // Notify terminals in resized panes to refit
      this.notifyTerminalsToResize();
      
      // Remove global listeners
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
    
    handle.addEventListener('mousedown', handleStart);
    handle.addEventListener('touchstart', handleStart, { passive: false });
  }
  
  updateLayout() {
    if (this.splitType === SPLIT_TYPE.VERTICAL) {
      this.children[0].container.style.width = `${this.children[0].size}%`;
      this.children[1].container.style.width = `${this.children[1].size}%`;
      this.children[0].container.style.height = '100%';
      this.children[1].container.style.height = '100%';
    } else if (this.splitType === SPLIT_TYPE.HORIZONTAL) {
      this.children[0].container.style.height = `${this.children[0].size}%`;
      this.children[1].container.style.height = `${this.children[1].size}%`;
      this.children[0].container.style.width = '100%';
      this.children[1].container.style.width = '100%';
    }
    
    // Recursively update children
    this.children.forEach(child => {
      if (child.children.length > 0) {
        child.updateLayout();
      }
    });
  }
  
  notifyTerminalsToResize() {
    // Get all leaf panes (panes with content, not splits)
    const leafPanes = [];
    
    function collectLeafPanes(pane) {
      if (pane.children.length === 0 && pane.content) {
        leafPanes.push(pane);
      } else {
        pane.children.forEach(collectLeafPanes);
      }
    }
    
    collectLeafPanes(this);
    
    // For each leaf pane, trigger terminal resize
    leafPanes.forEach(pane => {
      // Dispatch a custom event for this specific pane
      window.dispatchEvent(new CustomEvent('pane-resized', {
        detail: { paneId: pane.id }
      }));
    });
  }
  
  remove() {
    if (!this.parent || this.parent.children.length !== 2) {
      showToast('Cannot remove root pane or non-split pane');
      return;
    }
    
    const parent = this.parent;
    const sibling = parent.children.find(c => c !== this);
    
    // Store sibling's content type before deletion
    const siblingContent = sibling.content;
    const siblingHasChildren = sibling.children.length > 0;
    
    // Move sibling properties to parent
    parent.splitType = sibling.splitType;
    parent.content = sibling.content;
    parent.children = sibling.children;
    
    // Update children's parent reference
    parent.children.forEach(child => {
      child.parent = parent;
    });
    
    // Clean up panes before updating DOM
    panes.delete(this.id);
    panes.delete(sibling.id);
    
    // Update container based on content type
    if (siblingHasChildren) {
      // If sibling had children (was split), copy its structure
      parent.container.innerHTML = sibling.container.innerHTML;
      parent.container.className = sibling.container.className;
      
      // Update child containers to reference parent
      parent.children.forEach((child, index) => {
        const childElement = parent.container.children[index * 2]; // Account for resize handles
        if (childElement) {
          child.container = childElement;
          childElement.id = child.id;
          childElement.setAttribute('data-pane-id', child.id);
        }
      });
    } else if (siblingContent) {
      // If sibling had content, recreate it with parent's ID
      parent.container.innerHTML = '';
      parent.container.className = 'split-pane';
      
      // Notify that content needs to be recreated
      window.dispatchEvent(new CustomEvent('pane-content-moved', {
        detail: { paneId: parent.id, oldPaneId: sibling.id }
      }));
    }
    
    // Trigger resize for terminal fitting
    window.dispatchEvent(new Event('resize'));
  }
  
  setContent(content) {
    if (this.children.length > 0) {
      showToast('Cannot set content on split pane');
      return;
    }
    
    this.content = content;
    this.container.innerHTML = '';
    
    if (typeof content === 'string') {
      this.container.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      this.container.appendChild(content);
    }
  }
  
  findPaneById(id) {
    if (this.id === id) return this;
    
    for (const child of this.children) {
      const found = child.findPaneById(id);
      if (found) return found;
    }
    
    return null;
  }
  
  // Count leaf panes in vertical splits
  countVerticalLeafPanes() {
    // If this is a leaf pane (no children)
    if (this.children.length === 0) {
      return 1;
    }
    
    // If this is a horizontal split, return the sum of children's counts
    if (this.splitType === SPLIT_TYPE.HORIZONTAL) {
      return this.children.reduce((sum, child) => sum + child.countVerticalLeafPanes(), 0);
    }
    
    // If this is a vertical split, return the max count among children
    // (since vertical splits create side-by-side panes, we count the total leaves)
    if (this.splitType === SPLIT_TYPE.VERTICAL) {
      return this.children.reduce((sum, child) => sum + child.countVerticalLeafPanes(), 0);
    }
    
    return 0;
  }
  
  // Check if adding a vertical split would exceed the limit
  canSplitVertical(maxVerticalPanes = 4) {
    const currentCount = this.getRoot().countVerticalLeafPanes();
    // A vertical split creates 2 panes from 1, so we add 1 to current count
    return currentCount < maxVerticalPanes;
  }
  
  // Get the root pane
  getRoot() {
    let current = this;
    while (current.parent) {
      current = current.parent;
    }
    return current;
  }
}

// Create root pane for a container
export function createRootPane(container) {
  container.innerHTML = '';
  const rootPane = new Pane(null, container);
  rootPane.container.classList.add('split-root');
  return rootPane;
}

// Split a pane by ID
export function splitPane(paneId, orientation) {
  const pane = panes.get(paneId);
  if (!pane) {
    showToast('Pane not found');
    return null;
  }
  
  return pane.split(orientation);
}

// Remove a pane by ID
export function removePane(paneId) {
  const pane = panes.get(paneId);
  if (!pane) {
    showToast('Pane not found');
    return;
  }
  
  pane.remove();
}

// Set content for a pane
export function setPaneContent(paneId, content) {
  const pane = panes.get(paneId);
  if (!pane) {
    showToast('Pane not found');
    return;
  }
  
  pane.setContent(content);
}

// Get all leaf panes (panes without children)
export function getLeafPanes(rootPane) {
  const leaves = [];
  
  function traverse(pane) {
    if (pane.children.length === 0) {
      leaves.push(pane);
    } else {
      pane.children.forEach(traverse);
    }
  }
  
  traverse(rootPane);
  return leaves;
}

// Check if a pane can be split vertically
export function canSplitPaneVertical(paneId, maxVerticalPanes = 4) {
  const pane = panes.get(paneId);
  if (!pane) return false;
  return pane.canSplitVertical(maxVerticalPanes);
}

// Get current vertical pane count
export function getVerticalPaneCount(rootPane) {
  if (!rootPane) return 0;
  return rootPane.countVerticalLeafPanes();
}

// Clear all panes
export function clearPanes() {
  panes.clear();
  paneIdCounter = 0;
}

// Export for window object
export const splitPaneManager = {
  createRootPane,
  splitPane,
  removePane,
  setPaneContent,
  getLeafPanes,
  canSplitPaneVertical,
  getVerticalPaneCount,
  clearPanes,
  SPLIT_TYPE
};