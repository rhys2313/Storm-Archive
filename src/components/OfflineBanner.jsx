import React, { useEffect, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

const DISMISS_KEY = 'storm_archive_install_dismissed';

export default function OfflineBanner({ isOnline }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const handleInstalled = () => setDeferredPrompt(null);

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch { /* storage may be unavailable; dismissal is then session-only */ }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch (err) {
      console.warn('Install prompt failed:', err);
    }
    // A prompt can only be used once, so the banner is retired either way
    // instead of leaving a button that silently does nothing.
    setDeferredPrompt(null);
  };

  const showInstallBanner = Boolean(deferredPrompt) && !isDismissed;

  return (
    <>
      {!isOnline && (
        <div className="offline-banner" role="status">
          <WifiOff size={16} aria-hidden="true" />
          <span>Офлайн-режим. Приложение работает автономно, записи сохраняются локально.</span>
        </div>
      )}

      {showInstallBanner && (
        <div className="pwa-install-banner">
          <div className="pwa-banner-text">
            <strong>Установить Storm Archive</strong>
            <span>Установите приложение на рабочий стол или телефон, чтобы работать без браузера и без интернета.</span>
          </div>
          <div className="pwa-banner-actions">
            <button type="button" className="btn-primary" onClick={handleInstallClick}>
              <Download size={16} aria-hidden="true" /> Установить
            </button>
            <button type="button" className="close-btn" onClick={dismiss} aria-label="Скрыть предложение установки">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
