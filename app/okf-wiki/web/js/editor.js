/**
 * OKF Wiki — Editor Module
 * Handles concept viewing/editing, WYSIWYG/source toggle, frontmatter sync, autosave.
 */

const Editor = {
  _currentRaw: null,
  _currentFrontmatter: null,
  _currentBody: null,

  async init() {
    // Source toggle button
    document.getElementById('btn-source-toggle').addEventListener('click', () => this.toggleMode());

    // Source editor (raw markdown) input marks dirty
    document.getElementById('raw-editor').addEventListener('input', () => {
      AppState.markDirty();
    });

    // Save button - disabled by default, enabled when dirty
    const btnSave = document.getElementById('btn-save');
    btnSave.disabled = true;
    btnSave.addEventListener('click', () => this.saveCurrent());

    // Hook into AppState to update save button on dirty changes
    const originalMarkDirty = AppState.markDirty.bind(AppState);
    AppState.markDirty = () => {
      originalMarkDirty();
      this.setSaveButtonState(true);
    };

    // Properties panel toggle
    document.getElementById('btn-properties').addEventListener('click', () => {
      AppState.togglePanel('properties');
      this.updatePanelVisibility();
      if (AppState.showProperties && AppState.currentConcept) {
        this.loadProperties();
      }
    });

    // Backlinks toggle
    document.getElementById('btn-backlinks').addEventListener('click', () => {
      AppState.togglePanel('backlinks');
      this.updatePanelVisibility();
      if (AppState.showBacklinks && AppState.currentConcept) {
        this.loadBacklinks();
      }
    });

    // Graph toggle
    document.getElementById('btn-graph').addEventListener('click', () => {
      AppState.togglePanel('graph');
      this.updatePanelVisibility();
      if (AppState.showGraph) {
        Graph.init();
      }
    });

    // Raw YAML sync
    document.getElementById('prop-raw-yaml').addEventListener('input', () => this.syncFromRawYaml());

    // Type selector
    document.getElementById('prop-type').addEventListener('change', () => this.onPropertyChange());

    // Title/description
    document.getElementById('prop-title').addEventListener('input', () => {
      this.onPropertyChange();
      AppState.markDirty();
    });
    document.getElementById('prop-description').addEventListener('input', () => {
      this.onPropertyChange();
      AppState.markDirty();
    });

    // Status
    document.getElementById('prop-status').addEventListener('change', () => this.onPropertyChange());

    // Stale after
    document.getElementById('prop-stale-after').addEventListener('change', () => this.onPropertyChange());

    // Resource URL
    document.getElementById('prop-resource').addEventListener('input', () => this.onPropertyChange());

    // Tag input
    document.getElementById('tag-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        this.addTag();
      }
    });

    // Configure marked
    this.configureMarked();
  },

  configureMarked() {
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: true,
      mangle: false,
    });

    // Custom renderer for callouts
    const renderer = new marked.Renderer();
    renderer.paragraph = (text) => {
      // Check for callout syntax: [!NOTE], [!TIP], etc.
      const calloutMatch = text.match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*\n?(.*)/s);
      if (calloutMatch) {
        const type = calloutMatch[1].toLowerCase();
        const content = calloutMatch[2].trim();
        return `<div class="callout callout-${type}">${marked.parse(content)}</div>`;
      }
      return `<p>${text}</p>`;
    };
    marked.use({ renderer });
  },

  async openConcept(path) {
    // Mark as currently open concept
    AppState.currentConcept = path;
    AppState.showGraph = false;

    // Hide welcome, show editor
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('editor-container').classList.remove('hidden');
    document.getElementById('graph-container').classList.add('hidden');

    // Update breadcrumb
    document.getElementById('breadcrumb').textContent = AppState.getBreadcrumb(path);

    try {
      const data = await API.getConcept(AppState.currentBundle, path);
      if (data.error) throw new Error(data.error);

      this._currentRaw = data.raw;
      this._currentFrontmatter = data.frontmatter;
      this._currentBody = data.body;

      // Cache
      AppState.cacheConcept(AppState.currentBundle, path, data);

      // Render in current mode
      this.renderPreview();
      this.updateSourceEditor();

      // Update bundle name in topbar
      document.getElementById('bundle-name').textContent = AppState.currentBundle;

      // Load properties if panel is visible
      if (AppState.showProperties) {
        this.loadProperties();
      }

      // Load backlinks if panel is visible
      if (AppState.showBacklinks) {
        this.loadBacklinks();
      }

      // Reset dirty state
      AppState._dirty = false;
      this.setSaveButtonState(false);

    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  hideEditor() {
    AppState.currentConcept = null;
    document.getElementById('editor-container').classList.add('hidden');
    document.getElementById('graph-container').classList.add('hidden');
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.getElementById('breadcrumb').textContent = '';
    document.getElementById('bundle-name').textContent = AppState.currentBundle || 'No bundle selected';
    this._currentRaw = null;
    this._currentFrontmatter = null;
    this._currentBody = null;
    this.setSaveButtonState(false);
  },

  toggleMode() {
    if (AppState.editorMode === 'preview') {
      AppState.editorMode = 'source';
      document.getElementById('live-preview').classList.add('hidden');
      document.getElementById('source-editor').classList.remove('hidden');
      document.getElementById('btn-source-toggle').innerHTML = '<i class="bi bi-eye"></i>';
      document.getElementById('btn-source-toggle').title = 'Show Preview';
      this.updateSourceEditor();
    } else {
      AppState.editorMode = 'preview';
      document.getElementById('live-preview').classList.remove('hidden');
      document.getElementById('source-editor').classList.add('hidden');
      document.getElementById('btn-source-toggle').innerHTML = '<i class="bi bi-code-slash"></i>';
      document.getElementById('btn-source-toggle').title = 'Show Source';
      this.renderPreview();
    }
  },

  // Update save button based on dirty state
  setSaveButtonState(dirty) {
    const btnSave = document.getElementById('btn-save');
    if (!btnSave) return;
    btnSave.disabled = !dirty;
    if (dirty) {
      btnSave.classList.add('active');
    } else {
      btnSave.classList.remove('active');
    }
  },

  renderPreview() {
    const container = document.getElementById('live-preview');
    let html = marked.parse(this._currentBody || '');

    // Add trust tier badge at top if we have frontmatter
    if (this._currentFrontmatter) {
      const tier = this.getTrustTier(this._currentFrontmatter);
      const tierLabel = tier.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
      html = `<div style="margin-bottom:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span class="trust-badge ${tier}"><i class="bi bi-shield-check"></i> ${tierLabel}</span>
        ${this._currentFrontmatter.status ? `<span class="trust-badge" style="background:var(--bg-tertiary);color:var(--text-secondary);">Status: ${this._currentFrontmatter.status}</span>` : ''}
        ${this._currentFrontmatter.stale_after ? `<span class="trust-badge" style="background:var(--bg-tertiary);color:var(--warning);">Stale: ${this._currentFrontmatter.stale_after}</span>` : ''}
      </div>` + html;
    }

    container.innerHTML = html;

    // Render KaTeX
    this.renderMath(container);

    // Render Mermaid
    this.renderMermaid(container);
  },

  updateSourceEditor() {
    const textarea = document.getElementById('raw-editor');
    textarea.value = this._currentRaw || '';
  },

  getTrustTier(fm) {
    if (fm.verified) return 'human-reviewed';
    if (fm.generated) return 'machine-confirmed';
    return 'unverified';
  },

  async saveCurrent() {
    if (!AppState.currentConcept || !this._currentFrontmatter) return false;

    let raw;
    if (AppState.editorMode === 'source') {
      raw = document.getElementById('raw-editor').value;
      // Parse from raw
      const fm = this.parseFrontmatter(raw);
      this._currentFrontmatter = fm;
      this._currentRaw = raw;
    } else {
      // Rebuild from frontmatter + body
      raw = this.buildRaw();
      this._currentRaw = raw;
    }

    try {
      await API.saveConcept(
        AppState.currentBundle,
        AppState.currentConcept,
        this._currentFrontmatter,
        this._currentBody,
        raw
      );
      AppState._dirty = false;
      this.setSaveButtonState(false);
      Toast.show('Saved', 'success');

      // Refresh explorer to pick up any changes
      await Explorer.refresh();

      return true;
    } catch (err) {
      Toast.show(err.message, 'error');
      return false;
    }
  },

  parseFrontmatter(text) {
    const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) return {};
    try {
      return yamlParse(match[1]) || {};
    } catch {
      return {};
    }
  },

  buildRaw() {
    const header = '---\n' + yamlDump(this._currentFrontmatter) + '---\n';
    return header + (this._currentBody || '');
  },

  refreshPreview() {
    if (AppState.editorMode === 'preview') {
      this.renderPreview();
    }
  },

  // --- Properties Panel ---

  loadProperties() {
    if (!this._currentFrontmatter) return;

    document.getElementById('prop-type').value = this._currentFrontmatter.type || '';
    document.getElementById('prop-title').value = this._currentFrontmatter.title || '';
    document.getElementById('prop-description').value = this._currentFrontmatter.description || '';
    document.getElementById('prop-status').value = this._currentFrontmatter.status || '';
    document.getElementById('prop-stale-after').value = this._currentFrontmatter.stale_after || '';
    document.getElementById('prop-resource').value = this._currentFrontmatter.resource || '';

    // Tags
    const tags = this._currentFrontmatter.tags || [];
    this.renderTags(tags);

    // Raw YAML
    document.getElementById('prop-raw-yaml').value = yamlDump(this._currentFrontmatter);
  },

  renderTags(tags) {
    const container = document.getElementById('tag-list');
    container.innerHTML = '';
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${tag}<span class="tag-remove" data-tag="${tag}">×</span>`;
      container.appendChild(chip);
    });

    container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeTag(btn.dataset.tag);
      });
    });
  },

  addTag() {
    const input = document.getElementById('tag-input');
    const tag = input.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!tag) return;

    if (!this._currentFrontmatter.tags) this._currentFrontmatter.tags = [];
    if (this._currentFrontmatter.tags.includes(tag)) {
      input.value = '';
      return;
    }

    this._currentFrontmatter.tags.push(tag);
    input.value = '';
    this.renderTags(this._currentFrontmatter.tags);
    this.syncToRawYaml();
    AppState.markDirty();
  },

  removeTag(tag) {
    if (!this._currentFrontmatter.tags) return;
    this._currentFrontmatter.tags = this._currentFrontmatter.tags.filter(t => t !== tag);
    this.renderTags(this._currentFrontmatter.tags);
    this.syncToRawYaml();
    AppState.markDirty();
  },

  onPropertyChange() {
    this._currentFrontmatter.type = document.getElementById('prop-type').value;
    this._currentFrontmatter.title = document.getElementById('prop-title').value;
    this._currentFrontmatter.description = document.getElementById('prop-description').value;
    this._currentFrontmatter.status = document.getElementById('prop-status').value;
    this._currentFrontmatter.stale_after = document.getElementById('prop-stale-after').value;
    this._currentFrontmatter.resource = document.getElementById('prop-resource').value;

    this.syncToRawYaml();
    AppState.markDirty();
  },

  syncFromRawYaml() {
    const raw = document.getElementById('prop-raw-yaml').value;
    try {
      this._currentFrontmatter = yamlParse(raw) || {};
      this.loadProperties();
      AppState.markDirty();
    } catch (err) {
      Toast.show('Invalid YAML in frontmatter', 'warning');
    }
  },

  syncToRawYaml() {
    document.getElementById('prop-raw-yaml').value = yamlDump(this._currentFrontmatter);
  },

  updatePanelVisibility() {
    document.getElementById('sidebar-properties').classList.toggle('hidden', !AppState.showProperties);
    document.getElementById('sidebar-backlinks').classList.toggle('hidden', !AppState.showBacklinks);
    document.getElementById('editor-area').querySelector('#graph-container').classList.toggle('hidden', !AppState.showGraph);
  },

  // --- Backlinks ---

  async loadBacklinks() {
    if (!AppState.currentConcept) return;
    const container = document.getElementById('backlinks-list');
    container.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);"><i class="bi bi-arrow-repeat" style="animation:spin 1s linear infinite;"></i> Loading...</div>';

    try {
      const backlinks = await API.findBacklinks(AppState.currentBundle, AppState.currentConcept);
      if (backlinks.length === 0) {
        container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">No backlinks found</div>';
        return;
      }

      container.innerHTML = '';
      backlinks.forEach(bl => {
        const item = document.createElement('div');
        item.className = 'backlink-item';
        item.innerHTML = `
          <div class="bl-source"><i class="bi bi-file-earmark-text"></i> ${bl.source}</div>
          <div class="bl-snippet">${bl.snippet}</div>
        `;
        item.addEventListener('click', () => {
          window.State._contextPath = bl.source;
          Explorer.refresh().then(() => {
            Editor.openConcept(bl.source);
          });
        });
        container.appendChild(item);
      });
    } catch (err) {
      container.innerHTML = `<div style="padding:12px;color:var(--danger);">Error loading backlinks</div>`;
    }
  },

  // --- Math & Diagrams ---

  renderMath(container) {
    // Block math: $$...$$
    container.innerHTML = container.innerHTML.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return `<pre><code>${math}</code></pre>`;
      }
    });

    // Inline math: $...$
    container.innerHTML = container.innerHTML.replace(/\$([^\$]+?)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return `<code>${math}</code>`;
      }
    });
  },

  renderMermaid(container) {
    container.querySelectorAll('.language-mermaid, [class*="language-mermaid"]').forEach(el => {
      const code = el.textContent;
      mermaid.run({ nodes: [el] }).catch(() => {
        el.outerHTML = `<pre><code>${code}</code></pre>`;
      });
    });
  },
};

// Minimal YAML helpers (since we can't import PyYAML in browser)
function yamlParse(str) {
  const result = {};
  const lines = str.split('\n');
  let currentKey = null;
  let isArray = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item
    if (trimmed.startsWith('- ')) {
      if (currentKey && isArray) {
        if (!result[currentKey]) result[currentKey] = [];
        const val = trimmed.substring(2).trim();
        result[currentKey].push(parseScalar(val));
      }
      continue;
    }

    // Key-value
    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim();

      if (val === '' || val === '|' || val === '>') {
        // Start of a block or array
        currentKey = key;
        isArray = true;
        // Check if next line is an array item
        if (i + 1 < lines.length && lines[i + 1].trim().startsWith('- ')) {
          result[key] = [];
        } else {
          result[key] = {};
          isArray = false;
        }
      } else {
        currentKey = null;
        isArray = false;
        result[key] = parseScalar(val);
      }
      continue;
    }
  }

  return result;
}

function parseScalar(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  if (/^-?\d+$/.test(val)) return parseInt(val);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  // Remove quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

function yamlDump(obj) {
  if (!obj || typeof obj !== 'object') return '';
  let output = '';
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      output += `${key}:\n`;
      value.forEach(v => {
        output += `- ${formatValue(v)}\n`;
      });
    } else if (typeof value === 'object') {
      output += `${key}:\n`;
      for (const [k2, v2] of Object.entries(value)) {
        output += `  ${k2}: ${formatValue(v2)}\n`;
      }
    } else {
      output += `${key}: ${formatValue(value)}\n`;
    }
  }
  return output;
}

function formatValue(val) {
  if (typeof val === 'string') {
    if (val.includes(':') || val.includes('#') || val.includes("'") || val.includes('"') || val.includes('\n')) {
      return `"${val}"`;
    }
    return val;
  }
  return String(val);
}
