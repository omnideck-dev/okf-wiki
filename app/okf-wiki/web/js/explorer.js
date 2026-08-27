/**
 * OKF Wiki — Explorer Module
 * File tree navigation with expand/collapse, type icons, trust indicators.
 */

const Explorer = {
  async init() {
    document.getElementById('btn-bundles').addEventListener('click', () => Modals.showBundles());
    
    // Auto-discover and select first bundle
    await this.autoSelectBundle();
  },

  async autoSelectBundle() {
    try {
      const bundles = await API.listBundles();
      if (bundles.length === 0) {
        // No bundles yet — show welcome screen
        return;
      }
      
      // If only one bundle, auto-select it
      if (bundles.length === 1) {
        AppState.setBundle(bundles[0].id);
        document.getElementById('bundle-name').textContent = bundles[0].id;
        await this.refresh();
        return;
      }
      
      // Multiple bundles — show bundle picker
      Modals.showBundles();
    } catch (err) {
      console.error('Failed to auto-select bundle:', err);
    }
  },

  async renderTree() {
    if (!AppState.currentBundle) {
      document.getElementById('explorer-tree').innerHTML = `
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
          <i class="bi bi-collection" style="font-size:24px;display:block;margin-bottom:8px;"></i>
          Select a bundle to begin
        </div>`;
      return;
    }
    await this.loadDirectory('', true);
  },

  async loadDirectory(dirPath, isRoot = false) {
    const result = await API.listDirectory(AppState.currentBundle, dirPath);
    if (result.error) {
      Toast.show(result.error, 'error');
      return;
    }

    const container = document.getElementById('explorer-tree');
    if (isRoot) container.innerHTML = '';

    // Render directories
    for (const dir of result.directories) {
      const fullDir = dirPath ? `${dirPath}/${dir}` : dir;
      const expanded = AppState.isDirExpanded(fullDir);
      const item = this.createDirItem(dir, fullDir, expanded);
      if (isRoot) container.appendChild(item);
      else container.appendChild(item);

      if (expanded) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children open';
        childContainer.dataset.dir = fullDir;
        // Lazy load children
        await this.loadChildren(childContainer, fullDir);
        if (isRoot) container.appendChild(childContainer);
        else container.appendChild(childContainer);
      }
    }

    // Render files
    for (const file of result.files) {
      const filePath = dirPath ? `${dirPath}/${file.name}` : file.name;
      const item = this.createFileItem(file, filePath);
      if (isRoot) container.appendChild(item);
      else container.appendChild(item);
    }
  },

  async loadChildren(container, dirPath) {
    const result = await API.listDirectory(AppState.currentBundle, dirPath);
    if (result.error) return;

    for (const dir of result.directories) {
      const fullDir = dirPath ? `${dirPath}/${dir}` : dir;
      const expanded = AppState.isDirExpanded(fullDir);
      const item = this.createDirItem(dir, fullDir, expanded);
      container.appendChild(item);

      if (expanded) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children open';
        childContainer.dataset.dir = fullDir;
        await this.loadChildren(childContainer, fullDir);
        container.appendChild(childContainer);
      }
    }

    for (const file of result.files) {
      const filePath = dirPath ? `${dirPath}/${file.name}` : file.name;
      container.appendChild(this.createFileItem(file, filePath));
    }
  },

  createDirItem(name, fullPath, expanded) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.path = fullPath;

    const chevron = document.createElement('span');
    chevron.className = `tree-chevron ${expanded ? 'open' : ''}`;
    chevron.innerHTML = '<i class="bi bi-chevron-right"></i>';

    const icon = document.createElement('span');
    icon.className = 'tree-icon dir';
    icon.innerHTML = expanded ? '<i class="bi bi-folder-fill"></i>' : '<i class="bi bi-folder"></i>';

    const label = document.createElement('span');
    label.className = 'tree-name';
    label.textContent = name;

    item.appendChild(chevron);
    item.appendChild(icon);
    item.appendChild(label);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      AppState.toggleDir(fullPath);

      // Update chevron and icon
      const chev = item.querySelector('.tree-chevron');
      const icn = item.querySelector('.tree-icon');
      if (AppState.isDirExpanded(fullPath)) {
        chev.classList.add('open');
        icn.innerHTML = '<i class="bi bi-folder-fill"></i>';

        // Show/create children container
        let childContainer = item.parentElement?.querySelector(`.tree-children[data-dir="${fullPath}"]`);
        if (!childContainer) {
          childContainer = document.createElement('div');
          childContainer.className = 'tree-children open';
          childContainer.dataset.dir = fullPath;
          item.after(childContainer);
          this.loadChildren(childContainer, fullPath);
        } else {
          childContainer.classList.add('open');
        }
      } else {
        chev.classList.remove('open');
        icn.innerHTML = '<i class="bi bi-folder"></i>';
        const childContainer = item.parentElement?.querySelector(`.tree-children[data-dir="${fullPath}"]`);
        if (childContainer) childContainer.classList.remove('open');
      }
    });

    // Right-click menu for new file in directory
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.State._newFileInDir = fullPath;
      Modals.showNewFile();
    });

    return item;
  },

  createFileItem(fileData, filePath) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.path = filePath;

    const icon = document.createElement('span');
    icon.className = 'tree-icon md';
    const typeIcon = AppState.getTypeIcon(fileData.type);
    icon.innerHTML = `<i class="bi ${typeIcon}"></i>`;

    const label = document.createElement('span');
    label.className = 'tree-name';
    label.textContent = fileData.title || fileData.name.replace('.md', '');
    label.title = filePath;

    item.appendChild(icon);
    item.appendChild(label);

    // Click to open
    item.addEventListener('click', () => {
      // Remove active from all
      document.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      Editor.openConcept(filePath);
    });

    // Right-click for context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.State._contextPath = filePath;
      this.showContextMenu(e, fileData, filePath);
    });

    return item;
  },

  showContextMenu(event, fileData, filePath) {
    // Simple context menu using existing modals
    const actions = [
      { label: 'Rename', icon: 'bi-pencil', action: () => this.renameFile(filePath) },
      { label: 'Delete', icon: 'bi-trash', action: () => this.deleteFileConfirm(filePath) },
      { label: 'Validate', icon: 'bi-shield-check', action: () => Modals.showValidation(filePath) },
    ];

    // Create floating menu
    const menu = document.createElement('div');
    menu.style.cssText = `
      position:fixed; left:${event.clientX}px; top:${event.clientY}px;
      background:var(--bg-primary); border:1px solid var(--border-color);
      border-radius:var(--radius-md); box-shadow:var(--shadow-md);
      z-index:500; min-width:160px; overflow:hidden;
    `;

    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display:flex; align-items:center; gap:8px; width:100%; padding:8px 12px;
        border:none; background:transparent; text-align:left; cursor:pointer;
        font-size:13px; color:var(--text-primary);
      `;
      btn.innerHTML = `<i class="bi ${a.icon}" style="width:16px;text-align:center;color:var(--text-muted);"></i>${a.label}`;
      btn.addEventListener('click', () => {
        a.action();
        menu.remove();
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
  },

  async renameFile(oldPath) {
    const newName = prompt('New filename:', oldPath);
    if (!newName || newName === oldPath) return;

    try {
      const data = await API.getConcept(AppState.currentBundle, oldPath);
      if (data.error) throw new Error(data.error);

      await API.saveConcept(AppState.currentBundle, newName, data.frontmatter, data.body, data.raw);
      await API.deleteConcept(AppState.currentBundle, oldPath);

      if (AppState.currentConcept === oldPath) {
        AppState.openConcept(newName);
        Editor.refreshPreview();
      }

      Toast.show('Renamed successfully', 'success');
      this.renderTree();
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  async deleteFileConfirm(path) {
    if (!confirm(`Delete "${path}"? This cannot be undone.`)) return;
    try {
      await API.deleteConcept(AppState.currentBundle, path);
      if (AppState.currentConcept === path) {
        AppState.closeConcept();
        Editor.hideEditor();
      }
      Toast.show('Deleted', 'success');
      this.renderTree();
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  // Refresh the entire tree
  async refresh() {
    AppState.expandedDirs.clear();
    await this.renderTree();
  },
};
