// Profile-specific actions that can be executed automatically
module.exports = {
  actions: {
    default: {
      name: "Quick Analysis",
      description: "Analyze codebase structure and suggest improvements",
      command: "echo 'Analyzing codebase...' && find . -type f -name '*.js' -o -name '*.json' | grep -v node_modules | head -20 && echo '\nSuggestions: Consider reviewing the most recently modified files for potential improvements.'"
    },
    frontend: {
      name: "UI Component Audit",
      description: "Scan for UI components and check accessibility",
      command: "echo '🎨 Frontend Component Audit' && echo '\nSearching for React/Vue components...' && find src/public -name '*.js' -o -name '*.css' | grep -E '(component|module|style)' | head -15 && echo '\n✓ Found components. Consider checking for:\n- Responsive design patterns\n- Accessibility attributes\n- Component reusability'"
    },
    backend: {
      name: "API Security Check",
      description: "Review API endpoints and security patterns",
      command: "echo '🔒 Backend Security Audit' && echo '\nScanning for routes and API endpoints...' && find . -path ./node_modules -prune -o -name '*.js' -print | xargs grep -l 'router\\|app\\.' | head -10 && echo '\n✓ Found endpoints. Review for:\n- Authentication middleware\n- Input validation\n- Error handling'"
    },
    fullstack: {
      name: "Full Stack Health Check",
      description: "Check frontend-backend integration points",
      command: "echo '🔄 Full Stack Integration Check' && echo '\nFrontend API calls:' && find src/public -name '*.js' | xargs grep -h 'fetch\\|axios' | head -5 && echo '\nBackend routes:' && find src/routes -name '*.js' | xargs grep -h 'router\\.' | head -5 && echo '\n✓ Review API contracts between frontend and backend'"
    },
    tester: {
      name: "Test Coverage Report",
      description: "Check test files and coverage",
      command: "echo '🧪 Test Coverage Analysis' && echo '\nSearching for test files...' && find . -path ./node_modules -prune -o -name '*test*.js' -o -name '*spec*.js' | head -10 && echo '\nRecommendations:\n- Add unit tests for critical functions\n- Include integration tests for API endpoints\n- Set up automated testing in CI/CD'"
    },
    architect: {
      name: "Architecture Review",
      description: "Analyze project structure and patterns",
      command: "echo '🏗️ Architecture Analysis' && echo '\nProject structure:' && find . -maxdepth 3 -type d | grep -v node_modules | sort && echo '\n✓ Consider:\n- Separation of concerns\n- Module boundaries\n- Dependency management'"
    },
    refactor: {
      name: "Code Smell Detection",
      description: "Find potential refactoring opportunities",
      command: "echo '🔧 Refactoring Opportunities' && echo '\nLarge files (potential refactoring targets):' && find . -path ./node_modules -prune -o -name '*.js' -exec wc -l {} + | sort -rn | head -10 && echo '\n✓ Look for:\n- Long functions\n- Duplicate code\n- Complex conditionals'"
    },
    reviewer: {
      name: "Code Quality Check",
      description: "Review code quality and standards",
      command: "echo '📋 Code Quality Review' && echo '\nChecking for common issues...' && echo '\nTODO/FIXME comments:' && grep -r 'TODO\\|FIXME' --include='*.js' . | head -5 && echo '\nConsole.log statements:' && grep -r 'console\\.log' --include='*.js' src/ | head -5 && echo '\n✓ Review and address these items'"
    }
  }
};