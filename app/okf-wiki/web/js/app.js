/**
 * OKF Wiki — Main Application Entry Point
 * Initializes all modules, sets up keyboard shortcuts, and handles lifecycle.
 */

// Global references for cross-module access
window.State = AppState;
window.Explorer = Explorer;
window.Editor = Editor;
window.Graph = Graph;
window.Search = Search;
window.Commands = Commands;
window.Modals = Modals;
window.API = API;

// Toast notification system
const Toast = {
  show(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: 'bi-check-circle',
      error: 'bi-exclamation-circle',
      warning: 'bi-exclamation-triangle',
    };

    toast.innerHTML = `<i class="bi ${icons[type] || icons.success}"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  },
};
window.Toast = Toast;

// Spin animation for loading indicators
const styleSheet = document.createElement('style');
styleSheet.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

// --- Initialization ---

async function init() {
  console.log('OKF Wiki initializing...');

  // Initialize state
  AppState.init();

  // Update theme button icon
  const themeIcon = document.querySelector('#btn-theme i');
  if (themeIcon) {
    themeIcon.className = AppState.theme === 'light' ? 'bi bi-moon-stars' : 'bi bi-sun';
  }

  // Initialize all modules
  await Explorer.init();
  await Editor.init();
  Search.init();
  Commands.init();
  Modals.init();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  console.log('OKF Wiki ready.');
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+O — Quick Open / Search
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }

    // Ctrl+N — New File
    if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey) {
      e.preventDefault();
      Modals.showNewFile();
    }

    // Ctrl+S — Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (AppState.currentConcept) {
        Editor.saveCurrent();
      }
    }

    // Ctrl+B — Toggle Explorer
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      AppState.showExplorer = !AppState.showExplorer;
      document.getElementById('sidebar-explorer').classList.toggle('hidden', !AppState.showExplorer);
    }

    // Ctrl+P — Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      Commands.show();
    }

    // Escape — Close modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
      Search.clear();
    }

    // ⌘⌥E — Toggle Source/Live mode (Mac) or Ctrl+Alt+E (Windows/Linux)
    if ((e.metaKey && e.altKey) || (e.ctrlKey && e.altKey)) {
      if (e.key === 'e') {
        e.preventDefault();
        if (AppState.currentConcept) {
          Editor.toggleMode();
        }
      }
    }
  });
}

// Handle bundle switching at app level
const originalSetBundle = AppState.setBundle.bind(AppState);
AppState.setBundle = function(bundleId) {
  originalSetBundle(bundleId);
  document.getElementById('bundle-name').textContent = bundleId || 'No bundle selected';
  Explorer.refresh();
  Editor.hideEditor();
};

// Start the app
document.addEventListener('DOMContentLoaded', init);
