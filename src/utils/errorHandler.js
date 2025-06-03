// Centralized error handling utilities

// Express middleware for consistent error responses
function errorMiddleware(err, req, res, next) {
    console.error(err.stack);
    
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    
    res.status(status).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

// Async route wrapper to catch errors
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Standard error response helper
function sendError(res, status, message) {
    return res.status(status).json({ error: message });
}

// Client-side error handler
function handleClientError(error, showToast = true) {
    console.error(error);
    
    const message = error.message || 'An error occurred';
    
    if (showToast && typeof showToast === 'function') {
        showToast(message, 'error');
    } else if (showToast) {
        alert(message);
    }
    
    return message;
}

module.exports = {
    errorMiddleware,
    asyncHandler,
    sendError,
    handleClientError
};