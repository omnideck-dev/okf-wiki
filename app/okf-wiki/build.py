#!/usr/bin/env python3
"""Build OKF Wiki into a single self-contained inlined index.html."""
import os, re, sys

APP = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(APP, 'web')

css = open(os.path.join(WEB, 'css/main.css')).read()

js_files = ['state','api','explorer','editor','graph','search','commands','modals','app']
js_content = ''
for name in js_files:
    js_content += open(os.path.join(WEB, 'js', name + '.js')).read() + '\n'

# Fresh, canonical body structure
body = '''<header id="topbar">
  <div class="topbar-left">
    <button id="btn-bundles" class="icon-btn" title="Collections"><i class="bi bi-collection"></i></button>
    <span id="bundle-name" class="bundle-label">No collection selected</span>
    <span id="breadcrumb" class="breadcrumb"></span>
  </div>
  <div class="topbar-center">
    <div id="search-box" class="search-box">
      <i class="bi bi-search"></i>
      <input type="text" id="search-input" placeholder="Search concepts (Ctrl+O)..." autocomplete="off">
      <div id="search-results" class="search-results hidden"></div>
    </div>
  </div>
  <div class="topbar-right">
    <button id="btn-new-file" class="icon-btn" title="New File (Ctrl+N)"><i class="bi bi-plus-lg"></i></button>
    <button id="btn-source-toggle" class="icon-btn" title="Toggle Source (⌘⌥E)"><i class="bi bi-code-slash"></i></button>
    <button id="btn-save" class="icon-btn btn-primary" title="Save (Ctrl+S)" disabled><i class="bi bi-check2"></i></button>
    <button id="btn-properties" class="icon-btn" title="Properties Panel"><i class="bi bi-sliders"></i></button>
    <button id="btn-backlinks" class="icon-btn" title="Backlinks"><i class="bi bi-link-45deg"></i></button>
    <button id="btn-graph" class="icon-btn" title="Graph View"><i class="bi bi-diagram-3"></i></button>
    <button id="btn-validate" class="icon-btn" title="Validate OKF Conformance"><i class="bi bi-shield-check"></i></button>
    <button id="btn-theme" class="icon-btn" title="Toggle Theme"><i class="bi bi-moon-stars"></i></button>
  </div>
</header>

<div id="main-layout">
  <aside id="sidebar-explorer" class="sidebar sidebar-left">
    <div class="sidebar-header"><span><i class="bi bi-folder2-open"></i> Explorer</span></div>
    <div id="explorer-tree" class="tree-container"></div>
  </aside>

  <main id="editor-area">
    <div id="welcome-screen" class="welcome-screen">
      <div class="welcome-content">
        <i class="bi bi-journal-text welcome-icon"></i>
        <h1>OKF Wiki</h1>
        <p>Open Knowledge Format — agent-ready knowledge base</p>
        <div class="welcome-actions">
          <button id="btn-open-collections" class="btn btn-primary"><i class="bi bi-collection"></i> Browse Collections</button>
        </div>
        <div style="margin-top:16px;padding:12px;background:var(--bg-tertiary);border-radius:var(--radius-md);font-size:12px;color:var(--text-secondary);">
          <i class="bi bi-info-circle" style="color:var(--accent);"></i>
          Collections are subdirectories under <code>/home/omnideck/wiki/</code>. Each subdirectory is an OKF bundle with its own <code>index.md</code>.
        </div>
        <div class="welcome-shortcuts" style="margin-top:24px;">
          <h3>Keyboard Shortcuts</h3>
          <table>
            <tr><td><kbd>Ctrl+O</kbd></td><td>Quick Open / Search</td></tr>
            <tr><td><kbd>Ctrl+N</kbd></td><td>New File</td></tr>
            <tr><td><kbd>Ctrl+S</kbd></td><td>Save</td></tr>
            <tr><td><kbd>⌘⌥E</kbd></td><td>Toggle Source / Preview</td></tr>
            <tr><td><kbd>Ctrl+B</kbd></td><td>Toggle Explorer</td></tr>
            <tr><td><kbd>Ctrl+P</kbd></td><td>Command Palette</td></tr>
          </table>
        </div>
      </div>
    </div>

    <div id="editor-container" class="editor-container hidden">
      <div id="live-preview" class="editor-pane preview-pane"></div>
      <div id="source-editor" class="editor-pane source-pane hidden">
        <textarea id="raw-editor" spellcheck="false"></textarea>
      </div>
    </div>

    <div id="graph-container" class="graph-container hidden">
      <canvas id="graph-canvas"></canvas>
      <div id="graph-controls">
        <button id="btn-graph-reset" class="btn btn-sm"><i class="bi bi-arrows-fullscreen"></i> Reset</button>
        <button id="btn-graph-filter" class="btn btn-sm"><i class="bi bi-funnel"></i> Filter</button>
      </div>
      <div id="graph-legend" class="graph-legend"></div>
    </div>
  </main>

  <aside id="sidebar-properties" class="sidebar sidebar-right hidden">
    <div class="sidebar-header"><span><i class="bi bi-sliders"></i> Properties</span></div>
    <div id="properties-content" class="properties-content">
      <div class="prop-group">
        <label>Type</label>
        <select id="prop-type">
          <option value="">Select type...</option>
          <option value="Concept">Concept</option>
          <option value="Reference">Reference</option>
          <option value="How-to">How-to</option>
          <option value="Decision">Decision</option>
          <option value="Metric">Metric</option>
          <option value="Playbook">Playbook</option>
          <option value="Glossary">Glossary</option>
          <option value="Daily Note">Daily Note</option>
          <option value="Template">Template</option>
          <option value="Directory">Directory</option>
          <option value="Log">Log</option>
        </select>
      </div>
      <div class="prop-group">
        <label>Title</label>
        <input type="text" id="prop-title" placeholder="Concept title...">
      </div>
      <div class="prop-group">
        <label>Description</label>
        <textarea id="prop-description" rows="2" placeholder="Brief description..."></textarea>
      </div>
      <div class="prop-group">
        <label>Tags</label>
        <div id="tag-picker" class="tag-picker">
          <input type="text" id="tag-input" placeholder="Add tag...">
          <div id="tag-list" class="tag-list"></div>
        </div>
      </div>
      <div class="prop-group">
        <label>Status</label>
        <select id="prop-status">
          <option value="">(none)</option>
          <option value="draft">Draft</option>
          <option value="stable">Stable</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </div>
      <div class="prop-group">
        <label>Stale After</label>
        <input type="date" id="prop-stale-after">
      </div>
      <div class="prop-group">
        <label>Resource URL</label>
        <input type="url" id="prop-resource" placeholder="https://...">
      </div>
      <div class="prop-group prop-group-expanded">
        <label>Raw Frontmatter</label>
        <textarea id="prop-raw-yaml" rows="8" spellcheck="false" class="mono"></textarea>
      </div>
    </div>
  </aside>

  <aside id="sidebar-backlinks" class="sidebar sidebar-right hidden">
    <div class="sidebar-header"><span><i class="bi bi-link-45deg"></i> Backlinks</span></div>
    <div id="backlinks-content" class="backlinks-content">
      <div id="backlinks-list" class="backlinks-list"></div>
    </div>
  </aside>
</div>

<div id="modal-bundles" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-dialog">
    <div class="modal-header">
      <h2><i class="bi bi-collection"></i> Collections</h2>
      <button class="modal-close"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="modal-body">
      <div id="bundles-list" class="bundles-list"></div>
    </div>
  </div>
</div>

<div id="modal-new-file" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-dialog modal-sm">
    <div class="modal-header">
      <h2><i class="bi bi-file-earmark-plus"></i> New Concept</h2>
      <button class="modal-close"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="new-file-name" placeholder="concept-name.md">
      </div>
      <div class="form-group">
        <label>Folder</label>
        <select id="new-file-folder"></select>
      </div>
      <div class="form-group" id="template-selector-group" style="display:none;">
        <label>Template</label>
        <select id="new-file-template"></select>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="new-file-type">
          <option value="Concept">Concept</option>
          <option value="Reference">Reference</option>
          <option value="How-to">How-to</option>
          <option value="Decision">Decision</option>
          <option value="Metric">Metric</option>
          <option value="Playbook">Playbook</option>
          <option value="Glossary">Glossary</option>
          <option value="Daily Note">Daily Note</option>
          <option value="Template">Template</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button id="btn-cancel-new" class="btn btn-secondary">Cancel</button>
      <button id="btn-create-new" class="btn btn-primary">Create</button>
    </div>
  </div>
</div>

<div id="modal-command-palette" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-dialog modal-md">
    <div class="modal-body" style="padding:0;">
      <input type="text" id="command-input" placeholder="Type a command..." autofocus>
      <div id="command-results" class="command-results"></div>
    </div>
  </div>
</div>

<div id="modal-validation" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-dialog modal-md">
    <div class="modal-header">
      <h2><i class="bi bi-shield-check"></i> OKF Validation</h2>
      <button class="modal-close"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="modal-body">
      <div id="validation-summary" class="validation-summary"></div>
      <div id="validation-details" class="validation-details"></div>
    </div>
  </div>
</div>

<div id="toast-container" class="toast-container"></div>'''

final = '\n'.join([
    '<!DOCTYPE html>',
    '<html lang="en" data-theme="light">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>OKF Wiki</title>',
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">',
    '<link href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" rel="stylesheet">',
    '<style>', css, '</style>',
    '<script src="https://cdn.jsdelivr.net/npm/marked@12.0.1/marked.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js"></script>',
    '<script src="/api/custom-apps/sdk.js"></script>',
    '</head>',
    '<body>',
    body,
    '<script>', js_content, '</script>',
    '</body>',
    '</html>',
])

out = os.path.join(WEB, 'index.html')
open(out, 'w').write(final)
print('Wrote', len(final), 'chars to', out)
print('AppState defs:', final.count('const AppState'))
print('script (non-src) blocks:', final.count('\n<script>\n'))
print('raw-editor listener:', final.count("getElementById('raw-editor')"))
print('inline app entries:', final.count('window.State = AppState'))