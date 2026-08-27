/**
 * OKF Wiki — Graph View Module
 * Force-directed graph visualization of concept relationships using canvas.
 */

const Graph = {
  _canvas: null,
  _ctx: null,
  _nodes: [],
  _edges: [],
  _animationId: null,
  _dragging: null,
  _hovered: null,
  _zoom: 1,
  _panX: 0,
  _panY: 0,
  _initialized: false,

  async init() {
    if (!AppState.currentBundle) return;

    this._canvas = document.getElementById('graph-canvas');
    this._ctx = this._canvas.getContext('2d');
    this.resize();

    // Load graph data
    try {
      const data = await API.getGraphData(AppState.currentBundle);
      this._nodes = (data.nodes || []).map((n, i) => ({
        ...n,
        x: this._canvas.width / 2 + (Math.random() - 0.5) * 300,
        y: this._canvas.height / 2 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
        radius: 8 + (n.tags?.length || 0) * 2,
      }));
      this._edges = data.edges || [];

      // Build legend
      this.buildLegend();

      // Setup interactions
      this.setupEvents();

      // Show graph view
      document.getElementById('editor-container').classList.add('hidden');
      document.getElementById('welcome-screen').classList.add('hidden');
      document.getElementById('graph-container').classList.remove('hidden');

      // Start animation
      this.animate();

    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  resize() {
    const rect = this._canvas.parentElement.getBoundingClientRect();
    this._canvas.width = rect.width;
    this._canvas.height = rect.height;
  },

  setupEvents() {
    // Mouse events
    this._canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this._canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this._canvas.addEventListener('mouseup', () => this.onMouseUp());
    this._canvas.addEventListener('mouseleave', () => this.onMouseUp());
    this._canvas.addEventListener('wheel', (e) => this.onWheel(e));
    this._canvas.addEventListener('dblclick', (e) => this.onDblClick(e));

    // Window resize
    window.addEventListener('resize', () => {
      this.resize();
    });

    // Reset button
    document.getElementById('btn-graph-reset').addEventListener('click', () => {
      this._zoom = 1;
      this._panX = 0;
      this._panY = 0;
      this._nodes.forEach(n => {
        n.x = this._canvas.width / 2 + (Math.random() - 0.5) * 300;
        n.y = this._canvas.height / 2 + (Math.random() - 0.5) * 300;
      });
    });

    // Filter button
    document.getElementById('btn-graph-filter').addEventListener('click', () => {
      this.toggleFilter();
    });
  },

  onMouseDown(e) {
    const pos = this.getMousePos(e);
    const node = this.findNodeAt(pos.x, pos.y);
    if (node) {
      this._dragging = node;
      this._canvas.style.cursor = 'grabbing';
    } else {
      this._dragging = '_pan';
      this._lastPanX = e.clientX - this._panX;
      this._lastPanY = e.clientY - this._panY;
      this._canvas.style.cursor = 'move';
    }
  },

  onMouseMove(e) {
    const pos = this.getMousePos(e);

    if (this._dragging === '_pan') {
      this._panX = e.clientX - this._lastPanX;
      this._panY = e.clientY - this._lastPanY;
      return;
    }

    if (this._dragging) {
      this._dragging.x = pos.x;
      this._dragging.y = pos.y;
      this._dragging.vx = 0;
      this._dragging.vy = 0;
      return;
    }

    // Hover detection
    const hovered = this.findNodeAt(pos.x, pos.y);
    if (hovered !== this._hovered) {
      this._hovered = hovered;
      this._canvas.style.cursor = hovered ? 'pointer' : 'default';
    }
  },

  onMouseUp() {
    if (this._dragging && typeof this._dragging === 'object') {
      // Node was dropped - could trigger open
    }
    this._dragging = null;
    this._canvas.style.cursor = this._hovered ? 'pointer' : 'default';
  },

  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this._zoom = Math.max(0.2, Math.min(3, this._zoom * delta));
  },

  onDblClick(e) {
    const pos = this.getMousePos(e);
    const node = this.findNodeAt(pos.x, pos.y);
    if (node) {
      // Open the concept
      Explorer.refresh().then(() => {
        Editor.openConcept(node.id);
        AppState.showGraph = false;
        Editor.updatePanelVisibility();
      });
    }
  },

  getMousePos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this._panX) / this._zoom,
      y: (e.clientY - rect.top - this._panY) / this._zoom,
    };
  },

  findNodeAt(x, y) {
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const n = this._nodes[i];
      const dx = x - n.x;
      const dy = y - n.y;
      if (dx * dx + dy * dy <= n.radius * n.radius) {
        return n;
      }
    }
    return null;
  },

  animate() {
    this._animationId = requestAnimationFrame(() => this.animate());
    this.simulate();
    this.render();
  },

  simulate() {
    const width = this._canvas.width;
    const height = this._canvas.height;
    const k = 0.5; // spring constant
    const repulsion = 500;
    const damping = 0.85;

    // Repulsion between all nodes
    for (let i = 0; i < this._nodes.length; i++) {
      const a = this._nodes[i];
      if (a === this._dragging) continue;

      for (let j = i + 1; j < this._nodes.length; j++) {
        const b = this._nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = repulsion / (dist * dist);

        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
        b.vx -= (dx / dist) * force;
        b.vy -= (dy / dist) * force;
      }
    }

    // Attraction along edges
    for (const edge of this._edges) {
      const source = this._nodes.find(n => n.id === edge.source);
      const target = this._nodes.find(n => n.id === edge.target);
      if (!source || !target) continue;

      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = (dist - 100) * k;

      if (source !== this._dragging) {
        source.vx += (dx / dist) * force;
        source.vy += (dy / dist) * force;
      }
      if (target !== this._dragging) {
        target.vx -= (dx / dist) * force;
        target.vy -= (dy / dist) * force;
      }
    }

    // Center gravity
    for (const n of this._nodes) {
      if (n === this._dragging) continue;
      n.vx += (width / 2 - n.x) * 0.001;
      n.vy += (height / 2 - n.y) * 0.001;
    }

    // Apply velocities
    for (const n of this._nodes) {
      if (n === this._dragging) continue;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;

      // Boundary constraints
      const margin = 50;
      if (n.x < margin) { n.x = margin; n.vx *= -0.5; }
      if (n.x > width - margin) { n.x = width - margin; n.vx *= -0.5; }
      if (n.y < margin) { n.y = margin; n.vy *= -0.5; }
      if (n.y > height - margin) { n.y = height - margin; n.vy *= -0.5; }
    }
  },

  render() {
    const ctx = this._ctx;
    const width = this._canvas.width;
    const height = this._canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    // Draw edges
    for (const edge of this._edges) {
      const source = this._nodes.find(n => n.id === edge.source);
      const target = this._nodes.find(n => n.id === edge.target);
      if (!source || !target) continue;

      const isHighlighted = this._hovered && (this._hovered.id === edge.source || this._hovered.id === edge.target);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = isHighlighted ? 'rgba(76, 110, 245, 0.8)' : 'rgba(140, 150, 170, 0.3)';
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.stroke();

      // Arrow
      if (isHighlighted) {
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowLen = 10;
        ctx.beginPath();
        ctx.moveTo(target.x, target.y);
        ctx.lineTo(target.x - arrowLen * Math.cos(angle - 0.4), target.y - arrowLen * Math.sin(angle - 0.4));
        ctx.moveTo(target.x, target.y);
        ctx.lineTo(target.x - arrowLen * Math.cos(angle + 0.4), target.y - arrowLen * Math.sin(angle + 0.4));
        ctx.stroke();
      }
    }

    // Draw nodes
    for (const node of this._nodes) {
      const isHovered = this._hovered === node;
      const isConnected = this._hovered && this._edges.some(e =>
        (e.source === this._hovered.id && e.target === node.id) ||
        (e.target === this._hovered.id && e.source === node.id)
      );
      const dimmed = this._hovered && !isHovered && !isConnected;

      ctx.globalAlpha = dimmed ? 0.2 : 1;

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = AppState.getTrustColor(node.trust_tier);
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Label
      ctx.globalAlpha = dimmed ? 0.2 : (isHovered ? 1 : 0.8);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
      ctx.font = `${isHovered ? '600' : '400'} ${isHovered ? 12 : 10}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + node.radius + 14);

      // Type badge
      if (isHovered && node.type) {
        ctx.font = '500 9px -apple-system, sans-serif';
        ctx.fillStyle = AppState.getTrustColor(node.trust_tier);
        ctx.fillText(node.type, node.x, node.y + node.radius + 26);
      }
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  },

  buildLegend() {
    const legend = document.getElementById('graph-legend');
    const types = new Map();
    const tiers = new Map();

    for (const n of this._nodes) {
      if (n.type) types.set(n.type, (types.get(n.type) || 0) + 1);
      const tier = n.trust_tier || 'unverified';
      tiers.set(tier, (tiers.get(tier) || 0) + 1);
    }

    let html = '<div style="font-weight:600;margin-bottom:6px;">Trust Tier</div>';
    for (const [tier, count] of tiers) {
      const color = AppState.getTrustColor(tier);
      const label = tier.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
      html += `<div class="legend-item"><span class="legend-dot" style="background:${color};"></span>${label} (${count})</div>`;
    }

    if (types.size > 0) {
      html += '<div style="font-weight:600;margin:8px 0 4px;">Types</div>';
      for (const [type, count] of types) {
        html += `<div class="legend-item"><span style="font-size:10px;">${type}</span> (${count})</div>`;
      }
    }

    legend.innerHTML = html;
  },

  toggleFilter() {
    // Simple type filter - cycle through showing all types
    const types = [...new Set(this._nodes.map(n => n.type).filter(Boolean))];
    if (types.length === 0) return;

    const currentFilter = localStorage.getItem('okf-graph-filter');
    let nextIdx;
    if (!currentFilter) {
      nextIdx = 0;
    } else {
      nextIdx = parseInt(currentFilter) + 1;
      if (nextIdx >= types.length) nextIdx = -1; // -1 means show all
    }

    if (nextIdx === -1) {
      localStorage.removeItem('okf-graph-filter');
      this._nodes.forEach(n => n._visible = true);
      Toast.show('Showing all types', 'success');
    } else {
      localStorage.setItem('okf-graph-filter', nextIdx.toString());
      const filterType = types[nextIdx];
      this._nodes.forEach(n => {
        n._visible = n.type === filterType;
      });
      Toast.show(`Filtered by: ${filterType}`, 'success');
    }
  },

  destroy() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  },
};
