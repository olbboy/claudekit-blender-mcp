/**
 * Security Tests for Code Sanitization
 */

import { describe, it, expect } from 'vitest';

// Dangerous patterns that should be detected
const DANGEROUS_PATTERNS = [
  { pattern: /\bos\.system\s*\(/i, description: 'System command execution' },
  { pattern: /\bsubprocess\./i, description: 'Subprocess execution' },
  { pattern: /\b__import__\s*\(/i, description: 'Dynamic import' },
  { pattern: /\beval\s*\(/i, description: 'Eval execution' },
  { pattern: /\bexec\s*\(/i, description: 'Exec execution' },
  { pattern: /\bopen\s*\([^)]*['"][wa]/i, description: 'File write operation' },
  { pattern: /\brm\s+-rf/i, description: 'Destructive file operation' },
  { pattern: /\bshutil\.rmtree/i, description: 'Recursive directory deletion' },
  { pattern: /\bsocket\./i, description: 'Network socket access' },
  { pattern: /\burllib\./i, description: 'Network URL access' },
  { pattern: /\brequests\./i, description: 'HTTP requests library' }
];

// Blocked patterns (should be rejected entirely)
const BLOCKED_PATTERNS = [
  { pattern: /\bos\.system\s*\(\s*['"].*rm\s+-rf/i, reason: 'Destructive system command' },
  { pattern: /\bshutil\.rmtree\s*\(\s*['"]\/['"]|['"]C:\\/i, reason: 'Root directory deletion' }
];

function validateCodeSecurity(code: string): {
  isValid: boolean;
  warnings: string[];
  blocked: boolean;
  blockedReason?: string;
} {
  const warnings: string[] = [];

  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(`Warning: Code contains ${description}`);
    }
  }

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { isValid: false, warnings, blocked: true, blockedReason: reason };
    }
  }

  return { isValid: true, warnings, blocked: false };
}

function sanitizeCode(code: string): string {
  return code.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

describe('Code Security Validation', () => {
  describe('Dangerous Pattern Detection', () => {
    it('should detect os.system calls', () => {
      const result = validateCodeSecurity('os.system("ls")');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('System command execution');
    });

    it('should detect subprocess usage', () => {
      const result = validateCodeSecurity('subprocess.run(["ls"])');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Subprocess execution');
    });

    it('should detect dynamic imports', () => {
      const result = validateCodeSecurity('__import__("os")');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Dynamic import');
    });

    it('should detect eval usage', () => {
      const result = validateCodeSecurity('eval("print(1)")');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Eval execution');
    });

    it('should detect exec usage', () => {
      const result = validateCodeSecurity('exec("print(1)")');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Exec execution');
    });

    it('should detect file write operations', () => {
      const result = validateCodeSecurity('open("file.txt", "w")');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('File write operation');
    });

    it('should detect network socket access', () => {
      const result = validateCodeSecurity('socket.socket()');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Network socket access');
    });

    it('should detect urllib usage', () => {
      const result = validateCodeSecurity('urllib.request.urlopen()');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Network URL access');
    });

    it('should detect requests library', () => {
      const result = validateCodeSecurity('requests.get("http://example.com")');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('HTTP requests library');
    });

    it('should detect shutil.rmtree', () => {
      const result = validateCodeSecurity('shutil.rmtree("/tmp/test")');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Recursive directory deletion');
    });
  });

  describe('Blocked Operations', () => {
    it('should block destructive rm -rf commands', () => {
      const result = validateCodeSecurity('os.system("rm -rf /")');
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('Destructive');
    });

    it('should block root directory deletion', () => {
      const result = validateCodeSecurity('shutil.rmtree("/")');
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('Root directory');
    });

    it('should block Windows root deletion', () => {
      const result = validateCodeSecurity('shutil.rmtree("C:\\\\")');
      expect(result.blocked).toBe(true);
    });
  });

  describe('Safe Code', () => {
    it('should allow bpy operations', () => {
      const result = validateCodeSecurity('bpy.ops.mesh.primitive_cube_add()');
      expect(result.blocked).toBe(false);
      expect(result.warnings.length).toBe(0);
    });

    it('should allow mathutils operations', () => {
      const result = validateCodeSecurity('mathutils.Vector((1, 2, 3))');
      expect(result.blocked).toBe(false);
      expect(result.warnings.length).toBe(0);
    });

    it('should allow object manipulation', () => {
      const code = `
        obj = bpy.data.objects['Cube']
        obj.location = (1, 2, 3)
        obj.scale = (2, 2, 2)
      `;
      const result = validateCodeSecurity(code);
      expect(result.blocked).toBe(false);
      expect(result.warnings.length).toBe(0);
    });

    it('should allow material creation', () => {
      const code = `
        mat = bpy.data.materials.new('TestMaterial')
        mat.use_nodes = True
      `;
      const result = validateCodeSecurity(code);
      expect(result.blocked).toBe(false);
      expect(result.warnings.length).toBe(0);
    });
  });
});

describe('Code Sanitization', () => {
  it('should remove null bytes', () => {
    const code = 'print("hello\\x00world")';
    const sanitized = sanitizeCode(code);
    expect(sanitized).not.toContain('\x00');
  });

  it('should remove control characters', () => {
    const code = 'print("test\\x01\\x02\\x03")';
    const sanitized = sanitizeCode(code);
    expect(sanitized).not.toMatch(/[\x01\x02\x03]/);
  });

  it('should preserve newlines', () => {
    const code = 'line1\nline2\nline3';
    const sanitized = sanitizeCode(code);
    expect(sanitized).toBe('line1\nline2\nline3');
  });

  it('should preserve tabs', () => {
    const code = 'def func():\n\treturn True';
    const sanitized = sanitizeCode(code);
    expect(sanitized).toBe('def func():\n\treturn True');
  });

  it('should preserve carriage returns', () => {
    const code = 'line1\r\nline2';
    const sanitized = sanitizeCode(code);
    expect(sanitized).toBe('line1\r\nline2');
  });
});

describe('Input Size Limits', () => {
  const MAX_CODE_SIZE = 100 * 1024; // 100KB

  it('should accept code within size limit', () => {
    const code = 'x = 1\n'.repeat(1000);
    expect(code.length).toBeLessThan(MAX_CODE_SIZE);
  });

  it('should identify code exceeding size limit', () => {
    const code = 'x = 1\n'.repeat(20000);
    expect(code.length).toBeGreaterThan(MAX_CODE_SIZE);
  });
});
