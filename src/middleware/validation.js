const { sendError } = require('../utils/errorHandler');

// Validate cubicle index
function validateCubicleIndex(req, res, next) {
    const cubicleIndex = parseInt(req.params.cubicleIndex || req.body.cubicleIndex);
    
    if (isNaN(cubicleIndex) || cubicleIndex < 0) {
        return sendError(res, 400, 'Invalid cubicle index');
    }
    
    req.cubicleIndex = cubicleIndex;
    next();
}

// Validate project exists
function validateProjectExists(projectsData) {
    return (req, res, next) => {
        const { projectId } = req.params;
        
        if (!projectsData[projectId]) {
            return sendError(res, 404, 'Project not found');
        }
        
        req.project = projectsData[projectId];
        next();
    };
}

// Validate path traversal
function validateNoPathTraversal(req, res, next) {
    const paths = [
        req.params.path,
        req.body.path,
        req.body.projectPath,
        req.query.path
    ].filter(Boolean);
    
    for (const p of paths) {
        if (p.includes('../') || p.includes('..\\')) {
            return sendError(res, 400, 'Invalid path: directory traversal not allowed');
        }
    }
    
    next();
}

// Validate request body
function validateRequestBody(requiredFields) {
    return (req, res, next) => {
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            return sendError(res, 400, `Missing required fields: ${missingFields.join(', ')}`);
        }
        
        next();
    };
}

module.exports = {
    validateCubicleIndex,
    validateProjectExists,
    validateNoPathTraversal,
    validateRequestBody
};