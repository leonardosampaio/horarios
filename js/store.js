/* Estado do aplicativo: documento aberto + preferências de visualização. */
'use strict';

const Store = {
  KEY: 'horarios.doc',
  data: null,
  ui: { view: 'classes', entity: 'all', colorBy: 'teacher', zoom: 30, selected: null },
  listeners: [],

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.data = raw ? Core.normalize(JSON.parse(raw)) : Core.newDoc();
      Object.assign(this.ui, JSON.parse(localStorage.getItem(this.KEY + '.ui') || '{}'), { selected: null });
    } catch (e) {
      this.data = Core.newDoc();
    }
    return !!this.data.lessons.length || !!this.data.classes.length;
  },

  /* Chamar depois de qualquer alteração no documento. */
  commit() {
    Core.syncCards(this.data);
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* armazenamento indisponível */ }
    this.listeners.forEach(fn => fn());
  },

  saveUi() {
    try { localStorage.setItem(this.KEY + '.ui', JSON.stringify(this.ui)); } catch (e) { /* idem */ }
    this.listeners.forEach(fn => fn());
  },

  replace(doc) {
    this.data = Core.normalize(doc);
    this.ui.entity = 'all'; this.ui.selected = null;
    this.commit();
  }
};
