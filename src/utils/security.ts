import { z } from 'zod';

// Dangerous commands that should be blocked
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'dd if=/dev/zero',
  'mkfs',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  ':(){:|:&};:',  // Fork bomb
  'wget -O - | sh',  // Remote execution
  'curl -s | bash',  // Remote execution
];

// Dangerous patterns
const DANGEROUS_PATTERNS = [
  />\s*\/dev\/s[a-z]+/,  // Writing to disk devices
  /&\s*rm\s+-rf/,        // Background rm -rf
  /;\s*rm\s+-rf/,        // Chained rm -rf
  /\|\s*sh/,             // Piping to shell
  /\|\s*bash/,           // Piping to bash
  /`[^`]*rm[^`]*`/,      // Command substitution with rm
  /\$\([^)]*rm[^)]*\)/,  // Command substitution with rm
];

// Command validation schema
const commandValidationSchema = z.object({
  command: z.string().min(1).max(1000),
  workingDirectory: z.string().regex(/^[a-zA-Z0-9/_\-. ]+$/).optional(),
  environment: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string()).optional(),
  timeout: z.number().min(1000).max(300000).optional()
});

export function validateCommand(payload: any): {
  valid: boolean;
  error?: string;
  sanitized?: any;
} {
  try {
    const validated = commandValidationSchema.parse(payload);
    
    // Check for blocked commands
    const commandLower = validated.command.toLowerCase();
    for (const blocked of BLOCKED_COMMANDS) {
      if (commandLower.includes(blocked.toLowerCase())) {
        return {
          valid: false,
          error: `Command contains blocked pattern: ${blocked}`
        };
      }
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(validated.command)) {
        return {
          valid: false,
          error: 'Command contains dangerous pattern'
        };
      }
    }

    // Additional security checks
    if (validated.command.includes('sudo') && !validated.command.startsWith('sudo -l')) {
      return {
        valid: false,
        error: 'Sudo commands are not allowed'
      };
    }

    // Check for command injection attempts
    if (/[;&|`$]/.test(validated.command) && !isAllowedChaining(validated.command)) {
      return {
        valid: false,
        error: 'Complex command chaining is not allowed'
      };
    }

    return {
      valid: true,
      sanitized: validated
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        error: error.errors.map(e => e.message).join(', ')
      };
    }
    return {
      valid: false,
      error: 'Invalid command format'
    };
  }
}

function isAllowedChaining(command: string): boolean {
  // Allow simple piping for common safe commands
  const safePatterns = [
    /^ls.*\|\s*grep\s+/,
    /^ps.*\|\s*grep\s+/,
    /^cat.*\|\s*grep\s+/,
    /^echo.*\|\s*tee\s+/,
    /^find.*\|\s*xargs\s+ls/,
  ];

  return safePatterns.some(pattern => pattern.test(command));
}

export function sanitizeOutput(output: string): string {
  // Remove ANSI escape codes
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  let sanitized = output.replace(ansiRegex, '');

  // Limit output size
  const maxLength = 50000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '\n... (output truncated)';
  }

  // Remove potential sensitive patterns
  sanitized = sanitized.replace(/password\s*[:=]\s*\S+/gi, 'password=***');
  sanitized = sanitized.replace(/api[_-]?key\s*[:=]\s*\S+/gi, 'api_key=***');
  sanitized = sanitized.replace(/token\s*[:=]\s*\S+/gi, 'token=***');
  sanitized = sanitized.replace(/secret\s*[:=]\s*\S+/gi, 'secret=***');

  return sanitized;
}

export function validatePath(path: string): boolean {
  // Prevent directory traversal
  if (path.includes('..')) return false;
  
  // Ensure path is within allowed directories
  const allowedPrefixes = [
    '/home/',
    '/tmp/',
    '/var/tmp/',
    process.env.ALLOWED_PATH_PREFIX
  ].filter((prefix): prefix is string => Boolean(prefix));

  return allowedPrefixes.some(prefix => path.startsWith(prefix));
}

export function getCommandExecutionLimits(subscriptionTier: string): {
  maxExecutionTime: number;
  maxConcurrentCommands: number;
  maxDailyCommands: number;
} {
  switch (subscriptionTier) {
    case 'pro':
      return {
        maxExecutionTime: 300000, // 5 minutes
        maxConcurrentCommands: 10,
        maxDailyCommands: 10000
      };
    case 'basic':
      return {
        maxExecutionTime: 120000, // 2 minutes
        maxConcurrentCommands: 5,
        maxDailyCommands: 1000
      };
    case 'free':
    default:
      return {
        maxExecutionTime: 60000, // 1 minute
        maxConcurrentCommands: 2,
        maxDailyCommands: 100
      };
  }
}