import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { startIdleWorker } from '../../apps/worker/src/worker.js';
import { databaseUrl, port } from '@classroom/shared';
describe('executable boundaries', () => {
  it('reports only process liveness and returns 404 elsewhere', async () => {
    const app = createApp();
    try {
      const response = await app.inject('/health/live');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'alive', scope: 'process' });
      expect((await app.inject('/unknown')).statusCode).toBe(404);
    } finally { await app.close(); }
  });
  it('keeps dependency readiness distinct from process liveness', async () => {
    const app = createApp({
      frontendOrigin: 'http://127.0.0.1:5173',
      checkReadiness: async () => false,
    } as never);
    try {
      expect((await app.inject('/health/live')).statusCode).toBe(200);
      const ready = await app.inject('/health/ready');
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({ status: 'unavailable', scope: 'dependencies' });
    } finally { await app.close(); }
  });
  it('rejects invalid configuration without echoing values', () => {
    for (const value of ['', '0', '65536', '1.5', 'secret']) expect(() => port(value)).toThrow('Invalid PORT');
    expect(port(undefined)).toBe(3001);
    for (const value of [undefined, 'secret', 'https://user:secret@localhost/db', 'postgres://localhost/db?password=secret']) expect(() => databaseUrl(value)).toThrow('Invalid DATABASE_URL');
    expect(databaseUrl('postgresql://localhost/classroom')).toBe('postgresql://localhost/classroom');
    expect(
      databaseUrl(
        'postgresql://localhost/classroom?sslmode=require&channel_binding=require',
      ),
    ).toBe(
      'postgresql://localhost/classroom?sslmode=require&channel_binding=require',
    );
    expect(() => startIdleWorker('active')).toThrow('Invalid WORKER_MODE');
  });
  it('keeps an idle worker alive and releases its only timer', () => {
    vi.useFakeTimers();
    try { const stop = startIdleWorker(undefined); expect(vi.getTimerCount()).toBe(1); stop(); stop(); expect(vi.getTimerCount()).toBe(0); }
    finally { vi.useRealTimers(); }
  });
});
