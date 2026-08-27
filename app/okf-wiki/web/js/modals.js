/**
 * OKF Wiki — Modals Module
 * Modal dialogs for bundles, new files, validation, etc.
 */

const Modals = {
  init() {
    // Close buttons on all modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal').classList.add('hidden');
      });
    });

    // Backdrop clicks
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => {
        backdrop.closest('.modal').classList.add('hidden');
      });
    });

    // New file creation
    document.getElementById('btn-cancel-new').addEventListener('click', () => {
      this.hideNewFile();
    });

    document.getElementById('btn-create-new').addEventListener('click', async () => {
      await this.createNewConcept();
    });

    // Welcome screen buttons
    const btnOpenCollections = document.getElementById('btn-open-collections');
    if (btnOpenCollections) {
      btnOpenCollections.addEventListener('click', () => {
        this.showBundles();
      });
    }

    // Theme toggle
    document.getElementById('btn-theme').addEventListener('click', () => {
      AppState.toggleTheme();
      const icon = document.getElementById('btn-theme').querySelector('i');
      icon.className = AppState.theme === 'light' ? 'bi bi-moon-stars' : 'bi bi-sun';
    });

    // Validate button
    document.getElementById('btn-validate').addEventListener('click', () => {
      if (AppState.currentConcept) {
        this.showValidation(AppState.currentConcept);
      } else if (AppState.currentBundle) {
        this.showValidation(null, true);
      } else {
        Toast.show('Select a bundle first', 'warning');
      }
    });

    // New file button in topbar
    document.getElementById('btn-new-file').addEventListener('click', () => {
      this.showNewFile();
    });
  },

  // --- Bundle Picker ---

  async showBundles() {
    const modal = document.getElementById('modal-bundles');
    modal.classList.remove('hidden');

    const list = document.getElementById('bundles-list');
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);"><i class="bi bi-arrow-repeat" style="animation:spin 1s linear infinite;"></i></div>';

    try {
      const bundles = await API.listBundles();

      if (bundles.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No collections found.<br>Create a subdirectory under /home/omnideck/wiki/</div>';
        return;
      }

      list.innerHTML = '';
      bundles.forEach(b => {
        const card = document.createElement('div');
        card.className = 'bundle-card';
        if (b.id === AppState.currentBundle) card.style.borderColor = 'var(--accent)';

        card.innerHTML = `
          <span class="bc-icon"><i class="bi bi-folder2-open"></i></span>
          <div class="bc-info">
            <div class="bc-name">${b.id}</div>
            <div class="bc-meta">${b.concept_count} concepts · ${b.has_index ? 'index.md ✓' : 'no index'}</div>
          </div>
        `;

        card.addEventListener('click', () => {
          AppState.setBundle(b.id);
          this.hideBundles();
          Explorer.refresh().then(() => {
            document.getElementById('bundle-name').textContent = b.id;
          });
        });

        list.appendChild(card);
      });

    } catch (err) {
      list.innerHTML = `<div style="padding:16px;color:var(--danger);">Error loading collections</div>`;
    }
  },

  hideBundles() {
    document.getElementById('modal-bundles').classList.add('hidden');
  },

  // --- New File ---

  showNewFile() {
    const modal = document.getElementById('modal-new-file');
    modal.classList.remove('hidden');

    const nameInput = document.getElementById('new-file-name');
    nameInput.value = '';
    nameInput.focus();

    // Populate folder selector
    const folderSelect = document.getElementById('new-file-folder');
    folderSelect.innerHTML = '<option value="">(root)</option>';

    if (AppState.currentBundle) {
      this.loadFolders(folderSelect, '');
    }

    // Load templates
    this.loadTemplates();
  },

  hideNewFile() {
    document.getElementById('modal-new-file').classList.add('hidden');
  },

  async loadFolders(select, path) {
    if (!AppState.currentBundle) return;
    try {
      const result = await API.listDirectory(AppState.currentBundle, path);
      for (const dir of result.directories) {
        const fullDir = path ? `${path}/${dir}` : dir;
        const option = document.createElement('option');
        option.value = fullDir;
        option.textContent = fullDir || '(root)';
        select.appendChild(option);
      }
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  },

  async loadTemplates() {
    if (!AppState.currentBundle) return;
    try {
      const templates = await API.listTemplates(AppState.currentBundle, window.State._newFileInDir || '');
      const group = document.getElementById('template-selector-group');
      const select = document.getElementById('new-file-template');
      select.innerHTML = '<option value="">(none)</option>';

      if (templates.length > 0) {
        group.style.display = 'block';
        templates.forEach(t => {
          const option = document.createElement('option');
          option.value = JSON.stringify(t.frontmatter);
          option.textContent = t.path;
          select.appendChild(option);
        });
      } else {
        group.style.display = 'none';
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  },

  async createNewConcept() {
    const name = document.getElementById('new-file-name').value.trim();
    const folder = document.getElementById('new-file-folder').value;
    const type = document.getElementById('new-file-type').value;
    const templateStr = document.getElementById('new-file-template').value;

    if (!name) {
      Toast.show('Please enter a filename', 'warning');
      return;
    }

    // Ensure .md extension
    const fileName = name.endsWith('.md') ? name : name + '.md';
    const path = folder ? `${folder}/${fileName}` : fileName;

    const frontmatter = { type };
    let template = undefined;

    if (templateStr) {
      try {
        template = JSON.parse(templateStr);
      } catch { /* ignore */ }
    }

    try {
      await API.createConcept(AppState.currentBundle, path, frontmatter, '', template);
      this.hideNewFile();
      Toast.show(`Created "${fileName}"`, 'success');

      await Explorer.refresh();
      Editor.openConcept(path);

    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  // --- Validation ---

  async showValidation(conceptPath, validateAll = false) {
    const modal = document.getElementById('modal-validation');
    modal.classList.remove('hidden');

    const summary = document.getElementById('validation-summary');
    const details = document.getElementById('validation-details');
    summary.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">Validating...</div>';
    details.innerHTML = '';

    try {
      let result;
      if (validateAll && AppState.currentBundle) {
        result = await API.validateBundle(AppState.currentBundle);
      } else if (conceptPath && AppState.currentBundle) {
        result = await API.validateConcept(AppState.currentBundle, conceptPath);
      } else {
        throw new Error('No bundle or concept selected');
      }

      // Summary
      if (result.errors !== undefined) {
        // Bundle-level validation
        summary.innerHTML = `
          <div class="validation-summary">
            <div class="vs-item vs-errors"><div class="vs-count">${result.errors}</div><div class="vs-label">Errors</div></div>
            <div class="vs-item vs-warnings"><div class="vs-count">${result.warnings}</div><div class="vs-label">Warnings</div></div>
            <div class="vs-item vs-info"><div class="vs-count">${result.total}</div><div class="vs-label">Total Concepts</div></div>
          </div>
        `;
      } else {
        const status = result.valid ? '✓ Valid' : '✗ Has Issues';
        const color = result.valid ? 'var(--success)' : 'var(--danger)';
        summary.innerHTML = `
          <div style="font-size:18px;font-weight:600;color:${color};margin-bottom:4px;">${status}</div>
          <div style="font-size:13px;color:var(--text-secondary);">${conceptPath || 'Entire bundle'}</div>
        `;
      }

      // Details
      if (result.details && result.details.length > 0) {
        details.innerHTML = '';
        result.details.forEach(d => {
          const item = document.createElement('div');
          item.className = `vd-item vd-${d.level}`;
          item.innerHTML = `
            <span class="vd-path">${d.path || ''}</span>
            <span>${d.issue}</span>
          `;
          details.appendChild(item);
        });
      } else if (result.issues && result.issues.length > 0) {
        details.innerHTML = '';
        result.issues.forEach(issue => {
          const item = document.createElement('div');
          item.className = `vd-item vd-${issue.level}`;
          item.innerHTML = `
            <span class="vd-path">${issue.field || ''}</span>
            <span>${issue.message}</span>
          `;
          details.appendChild(item);
        });
      } else {
        details.innerHTML = '<div style="padding:12px;text-align:center;color:var(--success);"><i class="bi bi-check-circle"></i> No issues found!</div>';
      }

    } catch (err) {
      summary.innerHTML = '';
      details.innerHTML = `<div style="padding:12px;color:var(--danger);">Error: ${err.message}</div>`;
    }
  },
};
