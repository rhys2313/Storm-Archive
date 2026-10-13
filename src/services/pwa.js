export function createPwaManager({
  serviceWorker = globalThis.navigator?.serviceWorker,
  host = globalThis.window,
  hasOpenDialog = () => Boolean(document.querySelector('[role="dialog"]')),
  entry = () => document.querySelector('script[type="module"][src]')?.src,
  reload = () => host.location.reload()
} = {}) {
  let state = { phase: 'idle', updateReady: false, updating: false, message: '' };
  const listeners = new Set();
  const publish = changes => { state = { ...state, ...changes }; listeners.forEach(listener => listener()); };
  let registration;
  let started = false;
  let hadController = Boolean(serviceWorker?.controller);
  let reloading = false;
  let checkTime = 0;

  const request = (worker, type, timeout = 10000) => new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('PWA response timeout')); }, timeout);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    try { worker.postMessage({ type }, [channel.port2]); }
    catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
  });

  const refreshStatus = async () => {
    const worker = serviceWorker.controller || registration?.active;
    if (!worker) return;
    try {
      const result = await request(worker, 'STORM_STATUS');
      if (worker !== (serviceWorker.controller || registration?.active)) return;
      publish({ phase: result.ready ? 'ready' : 'error' });
      worker.postMessage({ type: 'STORM_CLIENT_READY' });
    } catch {
      if (worker === (serviceWorker.controller || registration?.active)) publish({ phase: 'error' });
    }
  };

  const changedController = () => {
    if (hadController && !reloading) {
      if (hasOpenDialog()) {
        // Recheck after activation too: a form could open after the handshake.
        publish({ updateReady: true, updating: false, reloadReady: true });
      } else { reloading = true; reload(); }
    } else { hadController = true; refreshStatus(); }
  };

  const onMessage = event => {
    if (event.data?.type !== 'STORM_CLIENT_STATE') return;
    event.ports[0]?.postMessage({ canUpdate: !hasOpenDialog(), entry: entry() });
  };

  const watchInstalling = () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        if (registration.waiting && registration.active && registration.active !== worker) publish({ updateReady: true, message: '' });
      } else if (worker.state === 'activated') refreshStatus();
      else if (worker.state === 'redundant' && !registration.active) publish({ phase: 'error' });
    });
  };

  const checkUpdate = async (force = false) => {
    if (!registration || (!force && Date.now() - checkTime < 60000)) return;
    checkTime = Date.now();
    try { await registration.update(); }
    catch { /* Network unavailability does not invalidate a working offline release. */ }
  };
  const resume = () => { if (host.document.visibilityState !== 'hidden') checkUpdate(); };

  const start = async () => {
    if (started || !serviceWorker) return;
    started = true;
    publish({ phase: 'preparing' });
    serviceWorker.addEventListener('message', onMessage);
    serviceWorker.addEventListener('controllerchange', changedController);
    host.addEventListener('online', resume);
    host.addEventListener('focus', resume);
    host.addEventListener('pageshow', resume);
    host.document.addEventListener('visibilitychange', resume);
    try {
      registration = await serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      registration.addEventListener('updatefound', watchInstalling);
      watchInstalling();
      if (registration.waiting && registration.active) publish({ updateReady: true });
      if (registration.active) await refreshStatus();
    } catch { publish({ phase: 'error' }); }
  };

  const applyUpdate = async () => {
    if (hasOpenDialog() || state.updating) return false;
    if (state.reloadReady) { reloading = true; reload(); return true; }
    if (!registration?.waiting) return false;
    publish({ updating: true, message: '' });
    try {
      const result = await request(registration.waiting, 'STORM_ACTIVATE');
      if (!result.ok) {
        publish({ updating: false, message: 'Завершите действия в других окнах Storm Archive или закройте их, затем повторите обновление.' });
        return false;
      }
      return true;
    } catch {
      publish({ updating: false, message: 'Не удалось применить обновление. Текущая версия продолжает работать.' });
      return false;
    }
  };

  const retry = async () => {
    // Browsers may remove a registration after its very first install fails.
    // Updating that detached registration cannot start a new installation.
    if (!registration?.active) { started = false; return start(); }
    publish({ phase: 'preparing' });
    if (registration.active) {
      try { await request(registration.active, 'STORM_REPAIR', 60000); } catch { /* Report verified status below. */ }
      await refreshStatus();
    }
    await checkUpdate(true);
    if (!registration.active && !registration.installing) publish({ phase: 'error' });
  };

  return {
    start, applyUpdate, retry,
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

export const pwa = createPwaManager();
