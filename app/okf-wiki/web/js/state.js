/**
 * OKF Wiki — Application State
 * Centralized state management for the wiki application.
 */

const AppState = {
  // Current bundle (vault)
  currentBundle: null,

  // Currently open concept path (relative to bundle root)
  currentConcept: null,

  // Concept data cache
  conceptCache: {},

  // Editor mode: 'preview' | 'source'
  editorMode: 'preview',

  // Sidebar visibility
  showExplorer: true,
  showProperties: false,
  showBacklinks: false,
  showGraph: false,

  // Theme
  theme: localStorage.getItem('okf-theme') || 'light',

  // Explorer tree expansion state
  expandedDirs: new Set(),

  // Autosave timer
  _autosaveTimer: null,
  _dirty: false,

  // Graph state
  graphNodes: [],
  graphEdges: [],

  // Tag suggestions from search
  tagSuggestions: [],

  // Initialize
  init() {
    document.documentElement.setAttribute('data-theme', this.theme);
  },

  // Theme toggle
  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('okf-theme', this.theme);
  },

  // Dirty flag + autosave
  markDirty() {
    this._dirty = true;
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => {
      if (this._dirty && window.Editor) {
        window.Editor.saveCurrent().then(() => {
          this._dirty = false;
        });
      }
    }, 3000);
  },

  // Check if current concept has unsaved changes
  isDirty() { return this._dirty; },

  // Cache a concept
  cacheConcept(bundle, path, data) {
    const key = `${bundle}:${path}`;
    this.conceptCache[key] = data;
  },

  // Get cached concept
  getCachedConcept(bundle, path) {
    return this.conceptCache[`${bundle}:${path}`];
  },

  // Clear cache for a bundle
  clearBundleCache(bundle) {
    Object.keys(this.conceptCache).forEach(key => {
      if (key.startsWith(`${bundle}:`)) delete this.conceptCache[key];
    });
  },

  // Expand/collapse directory in explorer
  toggleDir(dirPath) {
    if (this.expandedDirs.has(dirPath)) {
      this.expandedDirs.delete(dirPath);
    } else {
      this.expandedDirs.add(dirPath);
    }
  },

  isDirExpanded(dirPath) {
    return this.expandedDirs.has(dirPath);
  },

  // Navigation helpers
  setBundle(bundleId) {
    this.currentBundle = bundleId;
    this.currentConcept = null;
    this.clearBundleCache(bundleId);
    this.showGraph = false;
  },

  openConcept(path) {
    this.currentConcept = path;
    this.showGraph = false;
  },

  closeConcept() {
    this.currentConcept = null;
  },

  // Toggle sidebar panels
  togglePanel(panelName) {
    const panels = {
      properties: 'showProperties',
      backlinks: 'showBacklinks',
      graph: 'showGraph',
    };
    const prop = panels[panelName];
    if (prop) {
      this[prop] = !this[prop];
      // Close others when opening one
      if (this[prop]) {
        if (panelName !== 'properties') this.showProperties = false;
        if (panelName !== 'backlinks') this.showBacklinks = false;
        if (panelName !== 'graph') this.showGraph = false;
      }
    }
  },

  // Breadcrumb from path
  getBreadcrumb(path) {
    if (!path) return '';
    const parts = path.split('/');
    return parts.slice(0, -1).join(' / ') || '/';
  },

  // Type icon mapping
  getTypeIcon(type) {
    const icons = {
      'Concept': 'bi-circle-fill',
      'Reference': 'bi-book',
      'How-to': 'bi-tools',
      'Decision': 'bi-check-circle',
      'Metric': 'bi-graph-up',
      'Playbook': 'bi-journal-bookmark',
      'Glossary': 'bi-list-ol',
      'Daily Note': 'bi-calendar-event',
      'Template': 'bi-file-earmark-plus',
      'Directory': 'bi-folder2-open',
      'Log': 'bi-clock-history',
    };
    return icons[type] || 'bi-file-earmark-text';
  },

  // Trust tier color
  getTrustColor(tier) {
    const colors = {
      'unverified': '#8b95a5',
      'machine-confirmed': '#4c6ef5',
      'human-reviewed': '#2f9e44',
    };
    return colors[tier] || '#8b95a5';
  },
};
