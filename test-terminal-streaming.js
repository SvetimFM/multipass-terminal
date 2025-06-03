#!/usr/bin/env node

// Test script to verify terminal streaming improvements
// This script generates various output patterns to test buffering and escape sequences

const chalk = require('chalk');

console.log('Testing Terminal Streaming Improvements\n');

// Test 1: Rapid color changes (tests escape sequence buffering)
console.log('Test 1: Rapid color changes');
for (let i = 0; i < 20; i++) {
  process.stdout.write(chalk.red('R'));
  process.stdout.write(chalk.green('G'));
  process.stdout.write(chalk.blue('B'));
}
console.log('\n');

// Test 2: Progress bar with escape sequences
console.log('Test 2: Progress bar animation');
const progressBar = () => {
  for (let i = 0; i <= 100; i++) {
    process.stdout.write(`\r[${chalk.green('='.repeat(Math.floor(i/2)))}${' '.repeat(50 - Math.floor(i/2))}] ${i}%`);
    // Small delay to simulate real progress
    const start = Date.now();
    while (Date.now() - start < 10) {} // Busy wait
  }
  console.log('\n');
};
progressBar();

// Test 3: Animated spinner with cursor movement
console.log('Test 3: Animated spinner');
const spinner = ['|', '/', '-', '\\'];
for (let i = 0; i < 40; i++) {
  process.stdout.write(`\r${chalk.yellow(spinner[i % 4])} Loading...`);
  const start = Date.now();
  while (Date.now() - start < 50) {} // Busy wait
}
console.log('\r✓ Complete!    \n');

// Test 4: Multi-line updates (tests line buffering)
console.log('Test 4: Multi-line updates');
for (let i = 1; i <= 5; i++) {
  console.log(`Line ${i}: ${chalk.cyan('█'.repeat(i * 10))}`);
  const start = Date.now();
  while (Date.now() - start < 100) {} // Busy wait
}
console.log('');

// Test 5: Unicode and emoji support
console.log('Test 5: Unicode and emoji');
console.log('Symbols: ✓ ✗ ⚡ ⚙️ 🚀 📦 🔧 💻');
console.log('Box drawing: ┌─────┐');
console.log('            │ Box │');
console.log('            └─────┘');
console.log('');

// Test 6: Rapid small outputs (tests buffering)
console.log('Test 6: Rapid small outputs');
for (let i = 0; i < 50; i++) {
  process.stdout.write(i % 10 + '');
}
console.log('\n');

// Test 7: Long lines (tests line wrapping)
console.log('Test 7: Long lines');
console.log(chalk.magenta('='.repeat(150)));
console.log('');

console.log(chalk.green('✓ All tests completed!'));