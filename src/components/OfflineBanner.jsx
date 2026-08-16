import React, { useState, useEffect } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

export default function OfflineBanner({ isOnline }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <>
      {!isOnline && (
        <div className="offline-banner">
          <WifiOff size={16} />
          <span>Вы находитесь в офлайн-режиме. Приложение работает автономно, новые наблюдения сохраняются в локальное хранилище.</span>
        </div>
      )}

      {showInstallBanner && (
        <div className="pwa-install-banner">
          <div className="pwa-banner-text">
            <strong>Установить Storm Archive</strong>
            <span>Установите веб-приложение на рабочий стол или телефон для автономного использования без интернета.</span>
          </div>
          <div className="pwa-banner-actions">
            <button className="btn-primary install-btn" onClick={handleInstallClick}>
              <Download size={16} /> Установить
            </button>
            <button className="close-btn" onClick={() => setShowInstallBanner(false)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
