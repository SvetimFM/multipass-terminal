const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// File Browser
router.get('/', async (req, res) => {
  const { path: browsePath = process.env.HOME } = req.query;
  
  try {
    const entries = await fs.readdir(browsePath, { withFileTypes: true });
    const results = entries
      .filter(e => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map(e => ({
        name: e.name,
        path: path.join(browsePath, e.name),
        isDirectory: e.isDirectory()
      }));
    
    // Add parent directory if not at root
    if (browsePath !== '/') {
      results.unshift({
        name: '..',
        path: path.dirname(browsePath),
        isDirectory: true
      });
    }
    
    res.json(results);
}));

module.exports = router;