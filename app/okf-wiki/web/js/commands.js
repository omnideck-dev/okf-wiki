/**
 * OKF Wiki — Command Palette Module
 * Ctrl+P command palette with fuzzy matching.
 */

const Commands = {
  _modal: null,
  _input: null,
  _results: null,
  _selectedIndex: -1,
  _commands: [],

  init() {
    this._modal = document.getElementById('modal-command-palette');
    this._input = document.getElementById('command-input');
    this._results = document.getElementById('command-results');

    this._input.addEventListener('input', () => this.filter());
    this._input.addEventListener('focus', () => {
      if (this._input.value.length >= 2) this.onInput();
    });
    this._input.addEventListener('keydown', (e) => this.onKeyDown(e));
    this._input.addEventListener('blur', () => setTimeout(() => this.hide(), 200));

    // Register commands
    this.registerCommands();
  },

  registerCommands() {
    const bundle = AppState.currentBundle;

    this._commands = [
      // Navigation
      { id: 'new-file', label: 'New Concept', icon: 'bi-file-earmark-plus', key: 'Ctrl+N', action: () => Modals.showNewFile() },
      { id: 'bundles', label: 'Switch Bundle', icon: 'bi-collection', key: '', action: () => Modals.showBundles() },

      // Views
      { id: 'toggle-explorer', label: 'Toggle Explorer', icon: 'bi-layout-sidebar', key: 'Ctrl+B', action: () => {
        AppState.showExplorer = !AppState.showExplorer;
        document.getElementById('sidebar-explorer').classList.toggle('hidden', !AppState.showExplorer);
      }},
      { id: 'toggle-properties', label: 'Toggle Properties Panel', icon: 'bi-sliders', key: '', action: () => {
        AppState.togglePanel('properties');
        Editor.updatePanelVisibility();
        if (AppState.showProperties && AppState.currentConcept) Editor.loadProperties();
      }},
      { id: 'toggle-backlinks', label: 'Toggle Backlinks', icon: 'bi-link-45deg', key: '', action: () => {
        AppState.togglePanel('backlinks');
        Editor.updatePanelVisibility();
        if (AppState.showBacklinks && AppState.currentConcept) Editor.loadBacklinks();
      }},
      { id: 'toggle-graph', label: 'Toggle Graph View', icon: 'bi-diagram-3', key: '', action: () => {
        AppState.togglePanel('graph');
        Editor.updatePanelVisibility();
        if (AppState.showGraph) Graph.init();
      }},
      { id: 'toggle-source', label: 'Toggle Source/Live Mode', icon: 'bi-code-slash', key: '⌘⌥E', action: () => Editor.toggleMode() },

      // Actions
      { id: 'validate-current', label: 'Validate Current Concept', icon: 'bi-shield-check', key: '', action: () => {
        if (AppState.currentConcept) Modals.showValidation(AppState.currentConcept);
      }},
      { id: 'validate-bundle', label: 'Validate Entire Bundle', icon: 'bi-shield-fill-check', key: '', action: () => {
        if (AppState.currentBundle) Modals.showValidation(null, true);
      }},
      { id: 'save', label: 'Save Current Concept', icon: 'bi-check2', key: 'Ctrl+S', action: () => Editor.saveCurrent() },

      // Theme
      { id: 'toggle-theme', label: `Switch to ${AppState.theme === 'light' ? 'Dark' : 'Light'} Mode`, icon: 'bi-moon-stars', key: '', action: () => {
        AppState.toggleTheme();
        Toast.show(`Switched to ${AppState.theme} mode`, 'success');
      }},

      // Import/Export
      { id: 'export-bundle', label: 'Export Bundle as JSON', icon: 'bi-download', key: '', action: () => this.exportBundle() },
      { id: 'import-demo', label: 'Import Demo Bundle', icon: 'bi-cloud-download', key: '', action: () => this.importDemo() },
    ];
  },

  show() {
    this.registerCommands(); // Refresh commands list
    this._input.value = '';
    this._results.innerHTML = '';
    this._selectedIndex = -1;
    this._modal.classList.remove('hidden');
    setTimeout(() => this._input.focus(), 50);
  },

  hide() {
    this._modal.classList.add('hidden');
  },

  filter() {
    const query = this._input.value.trim().toLowerCase();
    const filtered = query
      ? this._commands.filter(c => c.label.toLowerCase().includes(query) || c.id.includes(query))
      : this._commands;

    this._results.innerHTML = '';
    this._selectedIndex = -1;

    if (filtered.length === 0) {
      this._results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);">No commands found</div>';
      return;
    }

    filtered.forEach((cmd, i) => {
      const item = document.createElement('div');
      item.className = 'command-item';
      item.dataset.index = i;
      item.innerHTML = `
        <span class="ci-icon"><i class="bi ${cmd.icon}"></i></span>
        <span class="ci-label">${cmd.label}</span>
        ${cmd.key ? `<span class="ci-key">${cmd.key}</span>` : ''}
      `;
      item.addEventListener('click', () => {
        cmd.action();
        this.hide();
      });
      this._results.appendChild(item);
    });
  },

  onKeyDown(e) {
    const items = this._results.querySelectorAll('.command-item');
    if (!items.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._selectedIndex = Math.min(this._selectedIndex + 1, items.length - 1);
        this.highlightSelected(items);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        this.highlightSelected(items);
        break;
      case 'Enter':
        e.preventDefault();
        if (this._selectedIndex >= 0 && items[this._selectedIndex]) {
          items[this._selectedIndex].click();
        } else if (items.length > 0) {
          items[0].click();
        }
        break;
      case 'Escape':
        this.hide();
        break;
    }
  },

  highlightSelected(items) {
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === this._selectedIndex);
      if (i === this._selectedIndex) item.scrollIntoView({ block: 'nearest' });
    });
  },

  async exportBundle() {
    if (!AppState.currentBundle) return;
    try {
      const data = await API.exportBundle(AppState.currentBundle);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${AppState.currentBundle}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.show('Bundle exported', 'success');
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  async importDemo() {
    // Create a demo bundle with sample concepts
    try {
      const demoName = 'demo-knowledge-base';
      const result = await API.createBundle(demoName);
      if (result.error) throw new Error(result.error);

      // Create sample concepts using simple strings (no template literals to avoid backtick conflicts)
      const samples = [
        {
          path: 'index.md',
          frontmatter: { type: 'Directory', title: demoName, description: 'Demo knowledge base' },
          body: '# Demo Knowledge Base\n\nThis is a demo OKF bundle.\n',
        },
        {
          path: 'concepts/welcome.md',
          frontmatter: { type: 'Concept', title: 'Welcome', description: 'Getting started with OKF Wiki', tags: ['getting-started', 'tutorial'] },
          body: this.getWelcomeBody(),
        },
        {
          path: 'concepts/how-to-edit.md',
          frontmatter: { type: 'How-to', title: 'How to Edit Concepts', description: 'Step-by-step editing guide', tags: ['tutorial', 'editing'] },
          body: this.getHowToBody(),
        },
        {
          path: 'reference/okf-spec.md',
          frontmatter: { type: 'Reference', title: 'OKF Specification', description: 'Open Knowledge Format spec reference', tags: ['spec', 'reference', 'okf'] },
          body: this.getSpecBody(),
        },
        {
          path: 'playbooks/team-rules.md',
          frontmatter: { type: 'Playbook', title: 'Team Contribution Rules', description: 'Guidelines for contributing to the knowledge base', tags: ['team', 'rules', 'playbook'] },
          body: this.getTeamRulesBody(),
        },
      ];

      for (const sample of samples) {
        await API.saveConcept(demoName, sample.path, sample.frontmatter, sample.body);
      }

      // Switch to demo bundle
      AppState.setBundle(demoName);
      await Explorer.refresh();
      Toast.show('Demo bundle "' + demoName + '" created!', 'success');

    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  getWelcomeBody() {
    var lines = [];
    lines.push('# Welcome to OKF Wiki!');
    lines.push('');
    lines.push("This is your **Open Knowledge Format** wiki. Here is what you can do:");
    lines.push('');
    lines.push('## Features');
    lines.push('');
    lines.push('- Create bundles (knowledge vaults)');
    lines.push('- Edit concepts with WYSIWYG or source mode');
    lines.push('- Visual frontmatter properties panel');
    lines.push('- Backlinks and graph view');
    lines.push('- OKF validation');
    lines.push('');
    lines.push('## Quick Start');
    lines.push('');
    lines.push('1. Create a new bundle from the bundle picker');
    lines.push('2. Right-click in the explorer to create concepts');
    lines.push('3. Use the properties panel to set metadata');
    lines.push('4. Toggle between live preview and source mode');
    lines.push('');
    lines.push('## OKF Format');
    lines.push('');
    lines.push('Every concept file has YAML frontmatter:');
    lines.push('');
    lines.push('```yaml');
    lines.push('type: Concept');
    lines.push('title: My Concept');
    lines.push('description: What it is about');
    lines.push('tags: [tag1, tag2]');
    lines.push('```');
    lines.push('');
    lines.push('## Links');
    lines.push('');
    lines.push('Check out the [Welcome](./welcome.md) concept for more info.');
    lines.push('');
    lines.push('> [!TIP] Use keyboard shortcuts like Ctrl+N for new files and Ctrl+S to save.');
    return lines.join('\n');
  },

  getHowToBody() {
    var lines = [];
    lines.push('# How to Edit Concepts');
    lines.push('');
    lines.push('## Opening a Concept');
    lines.push('');
    lines.push('Click on any `*.md` file in the explorer sidebar to open it.');
    lines.push('');
    lines.push('## Editing Modes');
    lines.push('');
    lines.push('### Live Preview (WYSIWYG)');
    lines.push('By default, you see a rendered markdown preview. The content is stored as raw markdown.');
    lines.push('');
    lines.push('### Source Mode');
    lines.push('Click the code icon (`<>`) in the top bar to toggle to source mode where you can edit raw markdown directly.');
    lines.push('');
    lines.push('## Saving');
    lines.push('');
    lines.push('Changes are autosaved after 3 seconds of inactivity. You can also manually save with `Ctrl+S`.');
    lines.push('');
    lines.push('## Properties');
    lines.push('');
    lines.push('Use the properties panel (right sidebar) to edit:');
    lines.push('');
    lines.push('- **Type**: Concept, Reference, How-to, Decision, etc.');
    lines.push('- **Title**: Display name');
    lines.push('- **Description**: Brief summary');
    lines.push('- **Tags**: For classification');
    lines.push('- **Status**: draft, stable, deprecated');
    lines.push('- **Stale After**: Expiration date');
    lines.push('');
    lines.push('## Callouts');
    lines.push('');
    lines.push('You can use callout blocks:');
    lines.push('');
    lines.push('```markdown');
    lines.push('> [!NOTE]');
    lines.push('> This is a note');
    lines.push('');
    lines.push('> [!TIP]');
    lines.push('> Here is a helpful tip');
    lines.push('');
    lines.push('> [!WARNING]');
    lines.push('> Watch out for this');
    lines.push('');
    lines.push('> [!CAUTION]');
    lines.push('> Be careful here');
    lines.push('');
    lines.push('> [!IMPORTANT]');
    lines.push('> This is important');
    lines.push('```');
    return lines.join('\n');
  },

  getSpecBody() {
    var lines = [];
    lines.push('# OKF Specification v0.2');
    lines.push('');
    lines.push('The Open Knowledge Format (OKF) represents knowledge as a directory of markdown files with YAML frontmatter.');
    lines.push('');
    lines.push('## Core Requirements');
    lines.push('');
    lines.push('- Every file must have a `type` field in frontmatter');
    lines.push('- Standard markdown links: `[title](/path/to/file.md)`');
    lines.push('- Reserved filenames: `index.md` (directory listing), `log.md` (change history)');
    lines.push('');
    lines.push('## Optional Fields');
    lines.push('');
    lines.push('- `title`: Human-readable title');
    lines.push('- `description`: Brief description');
    lines.push('- `tags`: Array of tags for classification');
    lines.push('- `status`: draft | stable | deprecated');
    lines.push('- `stale_after`: ISO 8601 date');
    lines.push('- `generated`: Machine provenance');
    lines.push('- `verified`: Human verification records');
    lines.push('- `resource`: External resource URL');
    lines.push('');
    lines.push('## Directory Structure');
    lines.push('');
    lines.push('Each subdirectory within a bundle is a separate vault with its own `index.md`.');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*Full spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md*');
    return lines.join('\n');
  },

  getTeamRulesBody() {
    var lines = [];
    lines.push('# Team Contribution Rules');
    lines.push('');
    lines.push('## Guidelines');
    lines.push('');
    lines.push('1. Always set a `type` for every concept');
    lines.push('2. Use descriptive titles');
    lines.push('3. Add relevant tags');
    lines.push('4. Link to related concepts');
    lines.push('5. Keep descriptions concise');
    lines.push('');
    lines.push('## Review Process');
    lines.push('');
    lines.push('- Draft → Stable → Deprecated');
    lines.push('- Use `verified` field for reviewed content');
    lines.push('- Set `stale_after` for time-sensitive information');
    lines.push('');
    lines.push('## Tagging Conventions');
    lines.push('');
    lines.push('- Use lowercase tags');
    lines.push('- Prefer existing tags over creating new ones');
    lines.push('- Tags for cross-cutting concerns, not hierarchy');
    lines.push('');
    lines.push('See also: [OKF Spec](../reference/okf-spec.md)');
    return lines.join('\n');
  },
};
