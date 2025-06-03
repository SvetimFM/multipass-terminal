# Code Refactoring Plan

## Overview
This document outlines the refactoring changes to address DRY violations and remove overengineering from the codebase.

## Key Issues Identified

### 1. DRY Violations
- **Clipboard handling** duplicated 4+ times across modules
- **Terminal initialization** repeated with slight variations
- **Error handling** inconsistent across routes
- **WebSocket connection logic** duplicated in multiple files
- **Git operations** scattered throughout the codebase
- **AI README generation** implemented multiple times

### 2. Overengineering
- **CDK Infrastructure**: Massive AWS setup for a local dev tool
- **Complex state management**: Multiple Maps and synchronization issues
- **Overly abstract configuration**: Multiple config files for simple settings
- **Unnecessary cubicle complexity**: Git cloning and session tracking overhead

## Implemented Solutions

### New Utility Modules Created

1. **`src/utils/clipboard.js`**
   - Centralized clipboard operations
   - Handles both secure and non-secure contexts
   - Single implementation for all copy/paste needs

2. **`src/utils/terminalFactory.js`**
   - Factory pattern for terminal creation
   - Consistent terminal configuration
   - Automatic resize handling

3. **`src/utils/errorHandler.js`**
   - Express error middleware
   - Async route wrapper
   - Consistent error responses
   - Client-side error handling

4. **`src/utils/gitOperations.js`**
   - Centralized git operations
   - Clean API for clone, pull, status
   - Error handling built-in

5. **`src/utils/aiReadmeGenerator.js`**
   - Single source for AI README generation
   - Template-based approach
   - Minimal and full content options

6. **`src/middleware/validation.js`**
   - Reusable validation middleware
   - Cubicle index validation
   - Path traversal protection
   - Project existence checks

7. **`src/utils/webSocketManager.js`**
   - Centralized WebSocket connection management
   - Auto-reconnect functionality
   - Connection pooling

8. **`config/simplified.config.js`**
   - Single, flat configuration file
   - Direct values without abstraction
   - Environment variable support

### Updated Files

1. **`src/utils/constants.js`**
   - Added all hardcoded values
   - WebSocket event names
   - UI messages
   - Git defaults
   - Terminal settings

## Migration Guide

### 1. Clipboard Operations
Replace all clipboard implementations with:
```javascript
import { clipboardService } from '../utils/clipboard.js';
await clipboardService.copyToClipboard(text);
```

### 2. Terminal Creation
Replace terminal initialization with:
```javascript
import { TerminalFactory } from '../utils/terminalFactory.js';
const { terminal, fitAddon, attachToWebSocket } = TerminalFactory.createTerminalWithContainer(container);
```

### 3. Error Handling
Wrap async routes:
```javascript
const { asyncHandler, sendError } = require('../utils/errorHandler');
router.get('/path', asyncHandler(async (req, res) => {
    // async code
}));
```

### 4. Git Operations
Replace exec calls with:
```javascript
const GitOperations = require('../utils/gitOperations');
const git = new GitOperations(baseDir);
const result = await git.clone(repoUrl, targetDir);
```

### 5. WebSocket Connections
Replace individual WebSocket creation:
```javascript
import { WebSocketManager } from '../utils/webSocketManager.js';
const wsManager = new WebSocketManager(wsUrl);
wsManager.connect(terminalId, { onMessage, onClose });
```

## Recommended Next Steps

1. **Remove CDK Infrastructure**
   - Delete `infrastructure/cdk/` directory
   - Remove AWS dependencies from package.json
   - Update README to reflect local-only usage

2. **Simplify AI Office**
   - Remove git cloning logic
   - Simplify to directory creation + terminal launch
   - Remove session persistence complexity

3. **Update Frontend Modules**
   - Import and use new utility modules
   - Remove duplicate implementations
   - Consolidate state management

4. **Clean Up Configuration**
   - Remove `ai-modes.js` and `llm.config.js`
   - Use `simplified.config.js` throughout
   - Update environment variable names

5. **Testing**
   - Add unit tests for new utility modules
   - Test clipboard functionality across browsers
   - Verify WebSocket reconnection logic

## Benefits

1. **Maintainability**: Single source of truth for common operations
2. **Consistency**: Uniform error handling and responses
3. **Simplicity**: Removed unnecessary abstractions
4. **Performance**: Reduced code duplication and complexity
5. **Developer Experience**: Easier to understand and modify

## Breaking Changes

1. Configuration file structure changed
2. Error response format standardized
3. WebSocket connection handling centralized
4. Git operations API changed

## Conclusion

This refactoring significantly improves code quality by eliminating duplication and removing unnecessary complexity. The codebase is now more maintainable and easier to understand while preserving all functionality.