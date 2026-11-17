const getSplash = () => document.getElementById('splashScreen');

function reportBootError(error) {
  const splash = getSplash();
  if (!splash) {
    console.error('[ORBITAL LAB] Startup failed:', error);
    return;
  }

  console.error('[ORBITAL LAB] Startup failed:', error);
  let status = document.getElementById('splashStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'splashStatus';
    status.className = 'splash-status';
    splash.appendChild(status);
  }
  status.textContent = 'STARTUP ERROR';

  let detail = document.getElementById('splashError');
  if (!detail) {
    detail = document.createElement('pre');
    detail.id = 'splashError';
    detail.className = 'splash-error';
    splash.appendChild(detail);
  }
  const message = error?.stack || error?.message || String(error || 'Unknown startup error');
  detail.textContent = String(message).slice(0, 1800);

  let reload = document.getElementById('splashReload');
  if (!reload) {
    reload = document.createElement('button');
    reload.id = 'splashReload';
    reload.className = 'splash-reload';
    reload.type = 'button';
    reload.textContent = 'RELOAD APP';
    reload.addEventListener('click', () => window.location.reload());
    splash.appendChild(reload);
  }
  splash.classList.add('boot-failed');
  document.getElementById('sceneLoading')?.classList.add('hidden');
}

window.__ORBITAL_APP_READY__ = false;
window.__ORBITAL_REPORT_BOOT_ERROR__ = reportBootError;
window.__ORBITAL_MARK_READY__ = () => {
  window.__ORBITAL_APP_READY__ = true;
  if (window.__ORBITAL_BOOT_TIMEOUT__) clearTimeout(window.__ORBITAL_BOOT_TIMEOUT__);
};

window.addEventListener('error', (event) => {
  if (!window.__ORBITAL_APP_READY__) reportBootError(event.error || event.message || 'Uncaught browser error');
});
window.addEventListener('unhandledrejection', (event) => {
  if (!window.__ORBITAL_APP_READY__) reportBootError(event.reason || 'Unhandled promise rejection');
});

// A failed script request or an initialization path that never completes
// must not leave the splash screen blocking the whole application forever.
window.__ORBITAL_BOOT_TIMEOUT__ = window.setTimeout(() => {
  if (!window.__ORBITAL_APP_READY__) {
    reportBootError(new Error('The application did not finish initializing within 20 seconds. The startup diagnostic is shown here; copy it and send it to the developer.'));
  }
}, 20000);
