/**
 * OKF Wiki — Search Module
 * Fuzzy search across concepts with keyboard navigation.
 */

const Search = {
  _input: null,
  _results: null,
  _selectedIndex: -1,
  _debounceTimer: null,

  init() {
    this._input = document.getElementById('search-input');
    this._results = document.getElementById('search-results');

    this._input.addEventListener('input', () => this.onInput());
    this._input.addEventListener('focus', () => {
      if (this._input.value.length >= 2) this.onInput();
    });
    this._input.addEventListener('keydown', (e) => this.onKeyDown(e));
    this._input.addEventListener('blur', () => {
      setTimeout(() => this._results.classList.add('hidden'), 200);
    });
  },

  onInput() {
    const query = this._input.value.trim();
    clearTimeout(this._debounceTimer);

    if (query.length < 2 || !AppState.currentBundle) {
      this._results.classList.add('hidden');
      return;
    }

    this._debounceTimer = setTimeout(() => this.search(query), 200);
  },

  async search(query) {
    try {
      const results = await API.searchConcepts(AppState.currentBundle, query, 'all');

      if (results.length === 0) {
        this._results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:13px;">No results found</div>';
        this._results.classList.remove('hidden');
        return;
      }

      this._results.innerHTML = '';
      this._selectedIndex = -1;

      results.slice(0, 15).forEach((r, i) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.dataset.index = i;
        item.dataset.path = r.path;

        const icon = AppState.getTypeIcon(r.type);
        item.innerHTML = `
          <span class="sr-title"><i class="bi ${icon}" style="margin-right:4px;"></i>${r.title || r.path}</span>
          <span class="sr-type">${r.type || ''}</span>
          <br><span class="sr-path">${r.path}</span>
        `;

        item.addEventListener('click', () => {
          this.selectResult(r.path);
        });

        this._results.appendChild(item);
      });

      this._results.classList.remove('hidden');
    } catch (err) {
      console.error('Search failed:', err);
    }
  },

  onKeyDown(e) {
    const items = this._results.querySelectorAll('.search-result-item');
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
          const path = items[this._selectedIndex].dataset.path;
          this.selectResult(path);
        } else if (items.length > 0) {
          // Select first result
          this.selectResult(items[0].dataset.path);
        }
        break;
      case 'Escape':
        this._results.classList.add('hidden');
        this._input.blur();
        break;
    }
  },

  highlightSelected(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === this._selectedIndex);
      if (i === this._selectedIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  },

  selectResult(path) {
    this._results.classList.add('hidden');
    this._input.value = '';
    this._input.blur();

    Explorer.refresh().then(() => {
      Editor.openConcept(path);
    });
  },

  clear() {
    this._input.value = '';
    this._results.classList.add('hidden');
    this._selectedIndex = -1;
  },
};
