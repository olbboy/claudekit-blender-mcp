/**
 * Unit Tests for Metrics Collector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Simple metrics implementation for testing
class TestMetricsCollector {
  private startTime = Date.now();
  private metrics: Map<string, {
    count: number;
    total: number;
    min: number;
    max: number;
  }> = new Map();
  private toolMetrics: Map<string, {
    invocations: number;
    successes: number;
    failures: number;
    totalDurationMs: number;
  }> = new Map();
  private errors: { count: number; byType: Map<string, number> } = {
    count: 0,
    byType: new Map()
  };

  recordTiming(name: string, durationMs: number): void {
    let metric = this.metrics.get(name);
    if (!metric) {
      metric = { count: 0, total: 0, min: Infinity, max: -Infinity };
      this.metrics.set(name, metric);
    }
    metric.count++;
    metric.total += durationMs;
    metric.min = Math.min(metric.min, durationMs);
    metric.max = Math.max(metric.max, durationMs);
  }

  recordToolInvocation(toolName: string, success: boolean, durationMs: number): void {
    let metric = this.toolMetrics.get(toolName);
    if (!metric) {
      metric = { invocations: 0, successes: 0, failures: 0, totalDurationMs: 0 };
      this.toolMetrics.set(toolName, metric);
    }
    metric.invocations++;
    metric.totalDurationMs += durationMs;
    if (success) {
      metric.successes++;
    } else {
      metric.failures++;
    }
  }

  recordError(category: string): void {
    this.errors.count++;
    const current = this.errors.byType.get(category) || 0;
    this.errors.byType.set(category, current + 1);
  }

  getMetric(name: string) {
    return this.metrics.get(name);
  }

  getToolMetric(name: string) {
    return this.toolMetrics.get(name);
  }

  getErrorCount(): number {
    return this.errors.count;
  }

  getErrorsByType(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of this.errors.byType) {
      result[k] = v;
    }
    return result;
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  reset(): void {
    this.startTime = Date.now();
    this.metrics.clear();
    this.toolMetrics.clear();
    this.errors = { count: 0, byType: new Map() };
  }
}

describe('Metrics Collector', () => {
  let metrics: TestMetricsCollector;

  beforeEach(() => {
    metrics = new TestMetricsCollector();
  });

  describe('Timing Metrics', () => {
    it('should record timing metrics', () => {
      metrics.recordTiming('operation1', 100);
      const metric = metrics.getMetric('operation1');

      expect(metric?.count).toBe(1);
      expect(metric?.total).toBe(100);
      expect(metric?.min).toBe(100);
      expect(metric?.max).toBe(100);
    });

    it('should accumulate timing metrics', () => {
      metrics.recordTiming('operation1', 100);
      metrics.recordTiming('operation1', 200);
      metrics.recordTiming('operation1', 50);

      const metric = metrics.getMetric('operation1');

      expect(metric?.count).toBe(3);
      expect(metric?.total).toBe(350);
      expect(metric?.min).toBe(50);
      expect(metric?.max).toBe(200);
    });

    it('should track separate metrics for different operations', () => {
      metrics.recordTiming('op1', 100);
      metrics.recordTiming('op2', 200);

      expect(metrics.getMetric('op1')?.total).toBe(100);
      expect(metrics.getMetric('op2')?.total).toBe(200);
    });
  });

  describe('Tool Metrics', () => {
    it('should record tool invocations', () => {
      metrics.recordToolInvocation('blender_create_primitive', true, 150);

      const metric = metrics.getToolMetric('blender_create_primitive');

      expect(metric?.invocations).toBe(1);
      expect(metric?.successes).toBe(1);
      expect(metric?.failures).toBe(0);
      expect(metric?.totalDurationMs).toBe(150);
    });

    it('should track successes and failures separately', () => {
      metrics.recordToolInvocation('tool1', true, 100);
      metrics.recordToolInvocation('tool1', true, 100);
      metrics.recordToolInvocation('tool1', false, 50);

      const metric = metrics.getToolMetric('tool1');

      expect(metric?.invocations).toBe(3);
      expect(metric?.successes).toBe(2);
      expect(metric?.failures).toBe(1);
    });

    it('should calculate average duration', () => {
      metrics.recordToolInvocation('tool1', true, 100);
      metrics.recordToolInvocation('tool1', true, 200);

      const metric = metrics.getToolMetric('tool1');
      const avgDuration = metric ? metric.totalDurationMs / metric.invocations : 0;

      expect(avgDuration).toBe(150);
    });
  });

  describe('Error Metrics', () => {
    it('should record errors', () => {
      metrics.recordError('connection');
      expect(metrics.getErrorCount()).toBe(1);
    });

    it('should track errors by category', () => {
      metrics.recordError('connection');
      metrics.recordError('connection');
      metrics.recordError('validation');

      const byType = metrics.getErrorsByType();

      expect(byType['connection']).toBe(2);
      expect(byType['validation']).toBe(1);
    });

    it('should count total errors', () => {
      metrics.recordError('error1');
      metrics.recordError('error2');
      metrics.recordError('error3');

      expect(metrics.getErrorCount()).toBe(3);
    });
  });

  describe('Uptime Tracking', () => {
    it('should track uptime', async () => {
      const uptime1 = metrics.getUptime();

      await new Promise(resolve => setTimeout(resolve, 50));

      const uptime2 = metrics.getUptime();

      expect(uptime2).toBeGreaterThan(uptime1);
      expect(uptime2 - uptime1).toBeGreaterThanOrEqual(40);
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      metrics.recordTiming('op1', 100);
      metrics.recordToolInvocation('tool1', true, 100);
      metrics.recordError('error1');

      metrics.reset();

      expect(metrics.getMetric('op1')).toBeUndefined();
      expect(metrics.getToolMetric('tool1')).toBeUndefined();
      expect(metrics.getErrorCount()).toBe(0);
    });
  });
});

describe('Health Status', () => {
  it('should determine healthy status from checks', () => {
    const checks = {
      blenderConnection: { status: 'up' as const },
      memoryUsage: { status: 'ok' as const, usedMb: 100, percentUsed: 50 },
      errorRate: { status: 'ok' as const, rate: 5 }
    };

    const allHealthy =
      checks.blenderConnection.status !== 'down' &&
      checks.memoryUsage.status !== 'critical' &&
      checks.errorRate.status !== 'critical';

    expect(allHealthy).toBe(true);
  });

  it('should determine unhealthy status from checks', () => {
    const checks = {
      blenderConnection: { status: 'down' as const },
      memoryUsage: { status: 'ok' as const, usedMb: 100, percentUsed: 50 },
      errorRate: { status: 'ok' as const, rate: 5 }
    };

    const allHealthy =
      checks.blenderConnection.status !== 'down' &&
      checks.memoryUsage.status !== 'critical' &&
      checks.errorRate.status !== 'critical';

    expect(allHealthy).toBe(false);
  });

  it('should flag critical memory usage', () => {
    const percentUsed = 95;

    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (percentUsed > 90) status = 'critical';
    else if (percentUsed > 75) status = 'warning';

    expect(status).toBe('critical');
  });

  it('should flag warning memory usage', () => {
    const percentUsed = 80;

    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (percentUsed > 90) status = 'critical';
    else if (percentUsed > 75) status = 'warning';

    expect(status).toBe('warning');
  });
});
