# Contributing to Multipass AI Terminal

First off, thank you for considering contributing to Multipass! It's people like you that make Multipass such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Your environment (OS, Node version, browser)
- Screenshots if applicable

### Suggesting Enhancements

Enhancement suggestions are welcome! Please include:

- A clear and descriptive title
- A detailed description of the proposed feature
- Why this enhancement would be useful
- Possible implementation approach

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure the code follows the existing style
4. Make sure your code lints
5. Issue that pull request!

## Development Process

1. Clone the repository
   ```bash
   git clone https://github.com/SvetimFM/multipass-ai-terminal.git
   cd multipass-ai-terminal
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file from the example
   ```bash
   cp env.example .env
   ```

4. Run in development mode
   ```bash
   npm run dev
   ```

## Style Guidelines

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

### JavaScript Style Guide

- Use ES6+ features where appropriate
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

### Documentation

- Update the README.md if you change functionality
- Comment your code where necessary
- Update the CLAUDE.md file if you add new features that AI assistants should know about

## Questions?

Feel free to open an issue with your question or reach out through GitHub discussions.

Thank you for contributing! 🎉