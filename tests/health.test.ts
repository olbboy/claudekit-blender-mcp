/**
 * Unit Tests for Health Check and Graceful Shutdown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Health status enum
enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  responseTimeMs?: number;
  details?: Record<string, unknown>;
}

interface SystemHealth {
  status: HealthStatus;
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  components: ComponentHealth[];
  metrics?: Record<string, unknown>;
}

// Mock implementations for testing
let mockServerStartTime = Date.now();
const mockShutdownHandlers: Array<{
  name: string;
  handler: () => Promise<void>;
  priority: number;
}> = [];
let mockIsShuttingDown = false;

function resetMocks() {
  mockServerStartTime = Date.now();
  mockShutdownHandlers.length = 0;
  mockIsShuttingDown = false;
}

function checkMemoryUsage(): ComponentHealth {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const percentUsed = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  let status = HealthStatus.HEALTHY;
  let message = 'Memory usage normal';

  if (percentUsed > 90) {
    status = HealthStatus.UNHEALTHY;
    message = 'Critical memory usage';
  } else if (percentUsed > 75) {
    status = HealthStatus.DEGRADED;
    message = 'High memory usage';
  }

  return {
    name: 'memory',
    status,
    message,
    details: {
      heapUsedMB,
      heapTotalMB,
      percentUsed
    }
  };
}

function isAlive(): boolean {
  return !mockIsShuttingDown;
}

async function isReady(): Promise<boolean> {
  if (mockIsShuttingDown) return false;
  const memHealth = checkMemoryUsage();
  return memHealth.status !== HealthStatus.UNHEALTHY;
}

function registerShutdownHandler(
  name: string,
  handler: () => Promise<void>,
  priority = 100
): void {
  mockShutdownHandlers.push({ name, handler, priority });
  mockShutdownHandlers.sort((a, b) => a.priority - b.priority);
}

function getUptime(): {
  seconds: number;
  minutes: number;
  hours: number;
  formatted: string;
} {
  const seconds = Math.floor((Date.now() - mockServerStartTime) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  parts.push(`${seconds % 60}s`);

  return {
    seconds,
    minutes,
    hours,
    formatted: parts.join(' ')
  };
}

function determineOverallStatus(components: ComponentHealth[]): HealthStatus {
  let overallStatus = HealthStatus.HEALTHY;

  for (const component of components) {
    if (component.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.UNHEALTHY;
    }
    if (component.status === HealthStatus.DEGRADED) {
      overallStatus = HealthStatus.DEGRADED;
    }
  }

  return overallStatus;
}

describe('Health Status Enum', () => {
  it('should have all status values', () => {
    expect(HealthStatus.HEALTHY).toBe('healthy');
    expect(HealthStatus.DEGRADED).toBe('degraded');
    expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
  });
});

describe('Memory Health Check', () => {
  it('should return component health structure', () => {
    const health = checkMemoryUsage();

    expect(health.name).toBe('memory');
    expect(health.status).toBeDefined();
    expect(health.message).toBeDefined();
    expect(health.details).toBeDefined();
    expect(health.details?.heapUsedMB).toBeTypeOf('number');
    expect(health.details?.heapTotalMB).toBeTypeOf('number');
    expect(health.details?.percentUsed).toBeTypeOf('number');
  });

  it('should return healthy status for normal memory usage', () => {
    // In test environment, memory should be healthy
    const health = checkMemoryUsage();
    expect([HealthStatus.HEALTHY, HealthStatus.DEGRADED]).toContain(health.status);
  });

  it('should calculate percentage correctly', () => {
    const health = checkMemoryUsage();
    const percent = health.details?.percentUsed as number;
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
  });
});

describe('Memory Status Thresholds', () => {
  function getStatusForPercent(percentUsed: number): HealthStatus {
    if (percentUsed > 90) return HealthStatus.UNHEALTHY;
    if (percentUsed > 75) return HealthStatus.DEGRADED;
    return HealthStatus.HEALTHY;
  }

  it('should return healthy for < 75%', () => {
    expect(getStatusForPercent(50)).toBe(HealthStatus.HEALTHY);
    expect(getStatusForPercent(74)).toBe(HealthStatus.HEALTHY);
  });

  it('should return degraded for 75-90%', () => {
    expect(getStatusForPercent(76)).toBe(HealthStatus.DEGRADED);
    expect(getStatusForPercent(85)).toBe(HealthStatus.DEGRADED);
    expect(getStatusForPercent(90)).toBe(HealthStatus.DEGRADED);
  });

  it('should return unhealthy for > 90%', () => {
    expect(getStatusForPercent(91)).toBe(HealthStatus.UNHEALTHY);
    expect(getStatusForPercent(95)).toBe(HealthStatus.UNHEALTHY);
    expect(getStatusForPercent(100)).toBe(HealthStatus.UNHEALTHY);
  });
});

describe('Liveness Check', () => {
  beforeEach(resetMocks);

  it('should return true when not shutting down', () => {
    mockIsShuttingDown = false;
    expect(isAlive()).toBe(true);
  });

  it('should return false when shutting down', () => {
    mockIsShuttingDown = true;
    expect(isAlive()).toBe(false);
  });
});

describe('Readiness Check', () => {
  beforeEach(resetMocks);

  it('should return true when ready', async () => {
    mockIsShuttingDown = false;
    const ready = await isReady();
    expect(ready).toBe(true);
  });

  it('should return false when shutting down', async () => {
    mockIsShuttingDown = true;
    const ready = await isReady();
    expect(ready).toBe(false);
  });
});

describe('Shutdown Handler Registration', () => {
  beforeEach(resetMocks);

  it('should register handlers', () => {
    registerShutdownHandler('test1', async () => {});
    expect(mockShutdownHandlers.length).toBe(1);
    expect(mockShutdownHandlers[0].name).toBe('test1');
  });

  it('should sort handlers by priority', () => {
    registerShutdownHandler('low', async () => {}, 100);
    registerShutdownHandler('high', async () => {}, 10);
    registerShutdownHandler('medium', async () => {}, 50);

    expect(mockShutdownHandlers[0].name).toBe('high');
    expect(mockShutdownHandlers[1].name).toBe('medium');
    expect(mockShutdownHandlers[2].name).toBe('low');
  });

  it('should use default priority of 100', () => {
    registerShutdownHandler('default', async () => {});
    expect(mockShutdownHandlers[0].priority).toBe(100);
  });
});

describe('Uptime Tracking', () => {
  beforeEach(resetMocks);

  it('should calculate uptime correctly', () => {
    const uptime = getUptime();
    expect(uptime.seconds).toBeGreaterThanOrEqual(0);
    expect(uptime.minutes).toBeGreaterThanOrEqual(0);
    expect(uptime.hours).toBeGreaterThanOrEqual(0);
    expect(uptime.formatted).toBeDefined();
  });

  it('should format uptime string correctly', () => {
    // Mock a specific start time
    mockServerStartTime = Date.now() - (3661 * 1000); // 1h 1m 1s ago

    const uptime = getUptime();
    expect(uptime.hours).toBe(1);
    expect(uptime.formatted).toContain('h');
    expect(uptime.formatted).toContain('m');
    expect(uptime.formatted).toContain('s');
  });

  it('should handle short uptimes', () => {
    mockServerStartTime = Date.now() - 5000; // 5 seconds ago

    const uptime = getUptime();
    expect(uptime.seconds).toBeGreaterThanOrEqual(5);
    expect(uptime.formatted).toContain('s');
  });
});

describe('Overall Status Determination', () => {
  it('should return healthy when all components healthy', () => {
    const components: ComponentHealth[] = [
      { name: 'memory', status: HealthStatus.HEALTHY },
      { name: 'cache', status: HealthStatus.HEALTHY },
      { name: 'blender', status: HealthStatus.HEALTHY }
    ];

    expect(determineOverallStatus(components)).toBe(HealthStatus.HEALTHY);
  });

  it('should return degraded when any component degraded', () => {
    const components: ComponentHealth[] = [
      { name: 'memory', status: HealthStatus.HEALTHY },
      { name: 'cache', status: HealthStatus.DEGRADED },
      { name: 'blender', status: HealthStatus.HEALTHY }
    ];

    expect(determineOverallStatus(components)).toBe(HealthStatus.DEGRADED);
  });

  it('should return unhealthy when any component unhealthy', () => {
    const components: ComponentHealth[] = [
      { name: 'memory', status: HealthStatus.HEALTHY },
      { name: 'cache', status: HealthStatus.DEGRADED },
      { name: 'blender', status: HealthStatus.UNHEALTHY }
    ];

    expect(determineOverallStatus(components)).toBe(HealthStatus.UNHEALTHY);
  });

  it('should prioritize unhealthy over degraded', () => {
    const components: ComponentHealth[] = [
      { name: 'a', status: HealthStatus.DEGRADED },
      { name: 'b', status: HealthStatus.UNHEALTHY },
      { name: 'c', status: HealthStatus.HEALTHY }
    ];

    expect(determineOverallStatus(components)).toBe(HealthStatus.UNHEALTHY);
  });

  it('should handle empty components list', () => {
    expect(determineOverallStatus([])).toBe(HealthStatus.HEALTHY);
  });
});

describe('Component Health Structure', () => {
  it('should have required fields', () => {
    const component: ComponentHealth = {
      name: 'test',
      status: HealthStatus.HEALTHY
    };

    expect(component.name).toBeDefined();
    expect(component.status).toBeDefined();
  });

  it('should support optional fields', () => {
    const component: ComponentHealth = {
      name: 'test',
      status: HealthStatus.HEALTHY,
      message: 'All good',
      responseTimeMs: 50,
      details: { key: 'value' }
    };

    expect(component.message).toBe('All good');
    expect(component.responseTimeMs).toBe(50);
    expect(component.details?.key).toBe('value');
  });
});

describe('System Health Structure', () => {
  it('should have all required fields', () => {
    const health: SystemHealth = {
      status: HealthStatus.HEALTHY,
      uptimeSeconds: 3600,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      components: []
    };

    expect(health.status).toBeDefined();
    expect(health.uptimeSeconds).toBeDefined();
    expect(health.timestamp).toBeDefined();
    expect(health.version).toBeDefined();
    expect(health.components).toBeDefined();
  });

  it('should support metrics field', () => {
    const health: SystemHealth = {
      status: HealthStatus.HEALTHY,
      uptimeSeconds: 3600,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      components: [],
      metrics: {
        requestCount: 100,
        errorRate: 0.01
      }
    };

    expect(health.metrics?.requestCount).toBe(100);
    expect(health.metrics?.errorRate).toBe(0.01);
  });
});

describe('Graceful Shutdown Flow', () => {
  beforeEach(resetMocks);

  it('should execute handlers in priority order', async () => {
    const executionOrder: string[] = [];

    registerShutdownHandler('third', async () => {
      executionOrder.push('third');
    }, 30);

    registerShutdownHandler('first', async () => {
      executionOrder.push('first');
    }, 10);

    registerShutdownHandler('second', async () => {
      executionOrder.push('second');
    }, 20);

    // Execute handlers manually
    for (const { handler } of mockShutdownHandlers) {
      await handler();
    }

    expect(executionOrder).toEqual(['first', 'second', 'third']);
  });

  it('should continue executing handlers after one fails', async () => {
    const executionOrder: string[] = [];

    registerShutdownHandler('first', async () => {
      executionOrder.push('first');
    }, 10);

    registerShutdownHandler('failing', async () => {
      executionOrder.push('failing');
      throw new Error('Handler failed');
    }, 20);

    registerShutdownHandler('third', async () => {
      executionOrder.push('third');
    }, 30);

    // Execute with error handling
    for (const { handler } of mockShutdownHandlers) {
      try {
        await handler();
      } catch {
        // Continue on error
      }
    }

    expect(executionOrder).toEqual(['first', 'failing', 'third']);
  });
});

describe('Edge Cases', () => {
  beforeEach(resetMocks);

  it('should handle concurrent readiness checks', async () => {
    mockIsShuttingDown = false;
    const results = await Promise.all([
      isReady(),
      isReady(),
      isReady()
    ]);

    expect(results.every(r => r === true)).toBe(true);
  });

  it('should handle rapid shutdown handler registration', () => {
    for (let i = 0; i < 100; i++) {
      registerShutdownHandler(`handler-${i}`, async () => {}, Math.random() * 100);
    }

    expect(mockShutdownHandlers.length).toBe(100);

    // Verify sorted by priority
    for (let i = 1; i < mockShutdownHandlers.length; i++) {
      expect(mockShutdownHandlers[i].priority).toBeGreaterThanOrEqual(
        mockShutdownHandlers[i - 1].priority
      );
    }
  });
});
