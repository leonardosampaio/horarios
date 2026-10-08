/* Utilitários de interface: DOM, janelas modais, seleção em lista dupla, menu de contexto. */
'use strict';

function h(tag, attrs) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  const add = kid => {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(add);
    else el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  };
  for (let i = 2; i < arguments.length; i++) add(arguments[i]);
  return el;
}

const UI = {
  stack: [],

  /* buttons: [{label, primary, left, onClick(api)}]; sem onClick o botão apenas fecha. */
  modal(opts) {
    const overlay = h('div', { class: 'overlay' });
    const api = {
      close(result) {
        const i = UI.stack.indexOf(api);
        if (i < 0) return;
        UI.stack.splice(i, 1);
        overlay.remove();
        if (opts.onClose) opts.onClose(result);
      },
      setTitle(t) { titleEl.textContent = t; }
    };
    const titleEl = h('span', null, opts.title || '');
    const foot = h('div', { class: 'modal-foot' });
    let primary = null;
    (opts.buttons || []).forEach(b => {
      const btn = h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.left ? ' left' : ''), onclick: () => (b.onClick ? b.onClick(api) : api.close()) }, b.label);
      if (b.primary) primary = btn;
      foot.appendChild(btn);
    });
    const win = h('div', { class: 'modal ' + (opts.className || ''), style: opts.width ? 'width:' + opts.width + 'px' : '' },
      h('div', { class: 'modal-title' }, titleEl, h('button', { class: 'x', title: 'Fechar', onclick: () => api.close() }, '✕')),
      h('div', { class: 'modal-body' }, opts.body),
      (opts.buttons || []).length ? foot : null);
    win.addEventListener('keydown', e => {
      if (e.key === 'Enter' && primary && /^(INPUT|SELECT)$/.test(e.target.tagName) && e.target.type !== 'checkbox') { e.preventDefault(); primary.click(); }
    });
    overlay.appendChild(win);
    document.body.appendChild(overlay);
    api.el = win;
    UI.stack.push(api);
    const focus = win.querySelector('.modal-body input:not([type=checkbox]):not([type=color]), .modal-body select');
    if (focus && !opts.noFocus) setTimeout(() => { focus.focus(); if (focus.select) focus.select(); }, 0);
    return api;
  },

  field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
  },

  check(label, checked, onchange) {
    const input = h('input', { type: 'checkbox', checked: !!checked, onchange: e => onchange && onchange(e.target.checked) });
    const el = h('label', { class: 'check' }, input, h('span', null, label));
    el.input = input;
    return el;
  },

  select(options, value, onchange) {
    const sel = h('select', { onchange: e => onchange && onchange(e.target.value) });
    options.forEach(o => sel.appendChild(h('option', { value: o.value, disabled: !!o.disabled }, o.label)));
    sel.value = value == null ? '' : value;
    return sel;
  },

  confirm(message, okLabel) {
    return new Promise(resolve => {
      let done = false;
      UI.modal({
        title: 'Confirmação', width: 420, body: h('p', { class: 'msg' }, message), onClose: () => { if (!done) resolve(false); },
        buttons: [{ label: okLabel || 'Sim', primary: true, onClick: m => { done = true; m.close(); resolve(true); } }, { label: 'Cancelar' }]
      });
    });
  },

  alert(title, message) {
    return new Promise(resolve => UI.modal({ title: title, width: 440, body: h('p', { class: 'msg' }, message), onClose: resolve, buttons: [{ label: 'OK', primary: true }] }));
  },

  askText(title, label, value) {
    return new Promise(resolve => {
      let done = false;
      const input = h('input', { type: 'text', value: value || '' });
      UI.modal({
        title: title, width: 400, body: UI.field(label, input), onClose: () => { if (!done) resolve(null); },
        buttons: [{ label: 'OK', primary: true, onClick: m => { done = true; m.close(); resolve(input.value.trim()); } }, { label: 'Cancelar' }]
      });
    });
  },

  /* Lista dupla "Seleção": items [{id,label}], selected [ids] -> Promise<ids|null> */
  pickMany(title, items, selected) {
    return new Promise(resolve => {
      let chosen = (selected || []).filter(id => items.some(i => i.id === id));
      let done = false, hiL = null, hiR = null;
      const left = h('div', { class: 'pick-list' }), right = h('div', { class: 'pick-list' });
      const draw = () => {
        left.textContent = ''; right.textContent = '';
        items.filter(i => chosen.indexOf(i.id) < 0).forEach(i => left.appendChild(h('div', {
          class: 'pick-item' + (hiL === i.id ? ' sel' : ''), onclick: () => { hiL = i.id; draw(); }, ondblclick: () => { chosen.push(i.id); draw(); }
        }, i.label)));
        chosen.forEach(id => { const i = items.find(x => x.id === id); right.appendChild(h('div', {
          class: 'pick-item' + (hiR === id ? ' sel' : ''), onclick: () => { hiR = id; draw(); }, ondblclick: () => { chosen = chosen.filter(x => x !== id); draw(); }
        }, i.label)); });
      };
      const move = () => { if (hiL && chosen.indexOf(hiL) < 0) { chosen.push(hiL); hiL = null; draw(); } };
      const back = () => { if (hiR) { chosen = chosen.filter(x => x !== hiR); hiR = null; draw(); } };
      draw();
      UI.modal({
        title: title || 'Seleção', width: 560, onClose: () => { if (!done) resolve(null); },
        body: h('div', { class: 'pick' },
          h('div', { class: 'pick-col' }, h('div', { class: 'pick-head' }, 'Disponíveis'), left,
            h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { chosen = items.map(i => i.id); draw(); } }, 'Todos'),
              h('button', { class: 'btn', onclick: () => { chosen = []; draw(); } }, 'Remover'))),
          h('div', { class: 'pick-arrows' }, h('button', { class: 'btn arrow', title: 'Adicionar', onclick: move }, '➡'), h('button', { class: 'btn arrow', title: 'Retirar', onclick: back }, '⬅')),
          h('div', { class: 'pick-col' }, h('div', { class: 'pick-head' }, 'Seleção'), right)),
        buttons: [{ label: 'OK', primary: true, onClick: m => { done = true; m.close(); resolve(chosen); } }, { label: 'Cancelar' }]
      });
    });
  },

  toast(text, kind) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts' }); document.body.appendChild(box); }
    const t = h('div', { class: 'toast ' + (kind || '') }, text);
    box.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  },

  menu(x, y, items) {
    UI.closeMenu();
    const el = h('div', { class: 'ctx', id: 'ctx' });
    items.forEach(it => {
      if (!it) return;
      if (it.sep) { el.appendChild(h('div', { class: 'ctx-sep' })); return; }
      if (it.head) { el.appendChild(h('div', { class: 'ctx-head' }, it.head)); return; }
      el.appendChild(h('div', { class: 'ctx-item' + (it.disabled ? ' disabled' : ''), onclick: () => { if (it.disabled) return; UI.closeMenu(); it.onClick(); } }, it.label));
    });
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
  },
  closeMenu() { const m = document.getElementById('ctx'); if (m) m.remove(); },

  textColor(bg) {
    const m = /^#?([0-9a-f]{6})$/i.exec(bg || '');
    if (!m) return '#111';
    const n = parseInt(m[1], 16), lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 150 ? '#111' : '#fff';
  }
};

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('ctx')) { UI.closeMenu(); return; }
  const top = UI.stack[UI.stack.length - 1];
  if (top) top.close();
});
document.addEventListener('mousedown', e => { if (!e.target.closest || !e.target.closest('#ctx')) UI.closeMenu(); });
