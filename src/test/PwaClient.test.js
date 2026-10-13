import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createPwaManager } from '../services/pwa';

class Channel {
  constructor() {
    this.port1 = { close() {}, onmessage: null };
    this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
  }
}
const makeWorker = () => Object.assign(new EventTarget(), {
  postMessage: vi.fn((message, ports) => ports?.[0]?.postMessage(
    message.type === 'STORM_STATUS' ? { ready: true } : { ok: true }
  ))
});
function setup({ controlled = true, waiting = true } = {}) {
  const active = makeWorker();
  const next = makeWorker();
  const registration = Object.assign(new EventTarget(), { active, waiting: waiting ? next : null, update: vi.fn() });
  const serviceWorker = Object.assign(new EventTarget(), { controller: controlled ? active : null, register: vi.fn(async () => registration) });
  const host = Object.assign(new EventTarget(), { document: new EventTarget() });
  const hasOpenDialog = vi.fn(() => false);
  const reload = vi.fn();
  const manager = createPwaManager({ serviceWorker, host, hasOpenDialog, reload, entry: () => 'https://storm.test/assets/main.js' });
  return { active, next, registration, serviceWorker, host, hasOpenDialog, reload, manager };
}
beforeEach(() => vi.stubGlobal('MessageChannel', Channel));
afterEach(() => { vi.unstubAllGlobals(); });

it('reports verified readiness and detects an already waiting update', async () => {
  const w = setup(); await w.manager.start();
  expect(w.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  expect(w.manager.getSnapshot()).toMatchObject({ phase: 'ready', updateReady: true });
});
it('never reloads on the first controller claim', async () => {
  const w = setup({ controlled: false, waiting: false }); await w.manager.start();
  w.serviceWorker.controller = w.active;
  w.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(w.reload).not.toHaveBeenCalled();
});
it('does not confuse a first installation with a waiting update', async () => {
  const w = setup({ controlled: false, waiting: false });
  w.registration.active = null;
  w.registration.installing = w.next;
  await w.manager.start();
  w.registration.waiting = w.next;
  w.next.state = 'installed';
  w.next.dispatchEvent(new Event('statechange'));
  expect(w.manager.getSnapshot().updateReady).toBe(false);
});
it('refuses updates while a dialog is open', async () => {
  const w = setup(); await w.manager.start(); w.hasOpenDialog.mockReturnValue(true);
  expect(await w.manager.applyUpdate()).toBe(false);
  expect(w.next.postMessage).not.toHaveBeenCalled();
});
it('explains when another window refuses the coordinated update', async () => {
  const w = setup(); await w.manager.start();
  w.next.postMessage.mockImplementation((_, ports) => ports[0].postMessage({ ok: false }));
  expect(await w.manager.applyUpdate()).toBe(false);
  expect(w.manager.getSnapshot().message).toMatch(/других окнах/);
  expect(w.reload).not.toHaveBeenCalled();
});
it('preserves a form opened between update approval and controller change', async () => {
  const w = setup(); await w.manager.start();
  expect(await w.manager.applyUpdate()).toBe(true);
  w.hasOpenDialog.mockReturnValue(true);
  w.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(w.reload).not.toHaveBeenCalled();
  expect(w.manager.getSnapshot().reloadReady).toBe(true);
  w.hasOpenDialog.mockReturnValue(false);
  await w.manager.applyUpdate();
  expect(w.reload).toHaveBeenCalledOnce();
});
it('reloads a safe page once when an approved update takes control', async () => {
  const w = setup(); await w.manager.start();
  w.serviceWorker.dispatchEvent(new Event('controllerchange'));
  w.serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(w.reload).toHaveBeenCalledOnce();
});
it('reports installation failure without touching storage', async () => {
  const w = setup(); w.serviceWorker.register.mockRejectedValue(new Error('offline'));
  await w.manager.start(); expect(w.manager.getSnapshot().phase).toBe('error');
  expect(w.reload).not.toHaveBeenCalled();
});
it('registers again when the failed first installation has no active worker', async () => {
  const w = setup({ controlled: false, waiting: false });
  w.registration.active = null;
  await w.manager.start(); await w.manager.retry();
  expect(w.serviceWorker.register).toHaveBeenCalledTimes(2);
  expect(w.registration.update).not.toHaveBeenCalled();
});
