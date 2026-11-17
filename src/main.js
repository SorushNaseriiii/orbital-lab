import './boot-diagnostics.js';

// Load the application dynamically so module/import errors can be shown on
// the splash screen instead of leaving the user on an endless loading screen.
import('./app.js').catch((error) => {
  window.__ORBITAL_REPORT_BOOT_ERROR__?.(error);
});
