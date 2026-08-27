/**
 * OKF Wiki — API Module
 * Wralls all backend action calls via window.omnideck.invoke().
 */

const API = {
  async call(action, params = {}) {
    try {
      const result = await window.omnideck.invoke(action, params);
      if (result && result.error) {
        throw new Error(result.error);
      }
      return result;
    } catch (err) {
      console.error(`API call failed: ${action}`, err);
      Toast.show(err.message || `Failed to call ${action}`, 'error');
      throw err;
    }
  },

  // Bundle operations
  async listBundles() {
    return this.call('list_bundles');
  },

  async createBundle(name) {
    return this.call('create_bundle', { name });
  },

  async deleteBundle(name) {
    return this.call('delete_bundle', { name });
  },

  // Concept operations
  async getConcept(bundle, path) {
    return this.call('get_concept', { bundle, path });
  },

  async saveConcept(bundle, path, frontmatter, body, raw) {
    return this.call('save_concept', { bundle, path, frontmatter, body, raw });
  },

  async deleteConcept(bundle, path) {
    return this.call('delete_concept', { bundle, path });
  },

  async createConcept(bundle, path, frontmatter, body, template) {
    return this.call('create_concept', { bundle, path, frontmatter, body, template });
  },

  // File explorer
  async listDirectory(bundle, path) {
    return this.call('list_directory', { bundle, path });
  },

  // Backlinks
  async findBacklinks(bundle, targetPath) {
    return this.call('find_backlinks', { bundle, target_path: targetPath });
  },

  // Search
  async searchConcepts(bundle, query, scope = 'all') {
    return this.call('search_concepts', { bundle, query, scope });
  },

  // Tags
  async collectTags(bundle) {
    return this.call('collect_tags', { bundle });
  },

  // Graph data
  async getGraphData(bundle) {
    return this.call('get_graph_data', { bundle });
  },

  // Validation
  async validateConcept(bundle, path) {
    return this.call('validate_concept', { bundle, path });
  },

  async validateBundle(bundle) {
    return this.call('validate_bundle', { bundle });
  },

  // Templates
  async listTemplates(bundle, path) {
    return this.call('list_templates', { bundle, path });
  },

  // Import/Export
  async exportBundle(bundle) {
    return this.call('export_bundle', { bundle });
  },

  async importBundle(data) {
    return this.call('import_bundle', { data });
  },
};
