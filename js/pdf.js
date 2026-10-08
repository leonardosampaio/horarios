/* Exportação do horário em PDF (vetorial, gerado no próprio navegador com jsPDF). */
'use strict';

const Pdf = {
  /* sections: [{title, view, entity}] — uma página A4 paisagem por seção. */
  export(sections, fileName) {
    const D = Store.data, sch = D.school;
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210, MX = 10;
    const days = Core.dayList(sch), periods = Core.periodList(sch), NP = periods.length, p0 = periods[0];
    const lessons = Grid.lessonMap();
    const rgb = hex => { const n = parseInt((/^#?([0-9a-f]{6})$/i.exec(hex || '') || [0, 'b0bec5'])[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    // texto centralizado que encolhe (e por fim corta) para caber na largura
    const fit = (text, cx, y, maxW, size, bold) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      let s = size;
      doc.setFontSize(s);
      while (s > 4 && doc.getTextWidth(text) > maxW) { s -= 0.5; doc.setFontSize(s); }
      while (text.length > 1 && doc.getTextWidth(text) > maxW) text = text.slice(0, -1);
      doc.text(text, cx, y, { align: 'center', baseline: 'middle' });
      return s;
    };

    sections.forEach((sec, si) => {
      if (si) doc.addPage();
      const list = D[sec.view], single = sec.entity !== 'all' ? Core.find(list, sec.entity) : null;
      doc.setTextColor(20);
      fit(sec.title, W / 2, 13, W - 2 * MX, 15, true);
      doc.setTextColor(110);
      fit((sch.name ? sch.name + ' — ' : '') + sch.year, W / 2, 19, W - 2 * MX, 9, false);

      const rows = single ? days.map(d => ({ ent: single, label: d.name, days: [d] })) : list.map(e => ({ ent: e, label: e.abbr || e.name, days: days }));
      const ncols = single ? NP : days.length * NP;
      const LW = single ? 24 : 20, top = 24, headH = single ? 9 : 10;
      const cw = (W - 2 * MX - LW) / ncols;
      const rh = Math.min(single ? 28 : 11, (H - top - headH - 10) / Math.max(1, rows.length));
      const X = col => MX + LW + col * cw, Y = r => top + headH + r * rh;

      // cabeçalho
      doc.setDrawColor(120); doc.setLineWidth(0.15); doc.setFillColor(237, 241, 246);
      doc.rect(MX, top, W - 2 * MX, headH, 'FD');
      doc.setTextColor(50);
      if (single) {
        fit(single.name, MX + LW / 2, top + headH / 2, LW - 1, 9, true);
        periods.forEach((p, i) => {
          doc.line(X(i), top, X(i), top + headH);
          fit(String(p), X(i) + cw / 2, top + (sch.bells[p] ? 3 : headH / 2), cw - 1, 9, true);
          if (sch.bells[p]) fit(sch.bells[p], X(i) + cw / 2, top + 6.5, cw - 1, 7, false);
        });
      } else {
        days.forEach((d, di) => {
          fit(d.name.toUpperCase(), X(di * NP) + cw * NP / 2, top + 2.6, cw * NP - 1, 8, true);
          periods.forEach((p, i) => fit(String(p), X(di * NP + i) + cw / 2, top + 7.4, cw, 6.5, false));
        });
        doc.line(MX + LW, top + 5, W - MX, top + 5);
      }

      // linhas, células e cartões
      const byEnt = new Map();
      D.cards.forEach(c => {
        if (c.day == null) return;
        const l = lessons.get(c.lessonId);
        const ids = sec.view === 'classes' ? l.classIds : sec.view === 'teachers' ? l.teacherIds : (c.roomId ? [c.roomId] : []);
        ids.forEach(id => { if (!byEnt.has(id)) byEnt.set(id, []); byEnt.get(id).push(c); });
      });
      rows.forEach((r, ri) => {
        doc.setFillColor(237, 241, 246); doc.setDrawColor(120);
        doc.rect(MX, Y(ri), LW, rh, 'FD');
        doc.setTextColor(30);
        fit(r.label, MX + LW / 2, Y(ri) + rh / 2, LW - 1, single ? 10 : 9, true);
        r.days.forEach((d, dpos) => {
          periods.forEach((p, i) => {
            const x = X(dpos * NP + i);
            if ((r.ent.timeOff || {})[d.index + '-' + p] === 2) { doc.setFillColor(228, 228, 228); doc.rect(x, Y(ri), cw, rh, 'F'); }
            doc.setDrawColor(190); doc.rect(x, Y(ri), cw, rh, 'S');
          });
          const items = (byEnt.get(r.ent.id) || []).filter(c => c.day === d.index);
          items.forEach(c => {
            const l = lessons.get(c.lessonId), ln = Grid.lane(c, l, sec.view, r.ent, items);
            const x = X(dpos * NP + (c.period - p0)) + 0.25, w = cw * c.duration - 0.5, hh = rh / ln.k - 0.5, y = Y(ri) + (rh / ln.k) * ln.lane + 0.25;
            const bg = Fmt.color(l);
            doc.setFillColor.apply(doc, rgb(bg)); doc.setDrawColor(70);
            doc.rect(x, y, w, hh, 'FD');
            doc.setTextColor(UI.textColor(bg) === '#fff' ? 255 : 0);
            const lines = Grid.cardLines(c, l, sec.view, !!single).slice(0, hh < 5 ? 1 : 3);
            const step = hh / (lines.length + 0.4);
            lines.forEach((t, i) => fit(t, x + w / 2, y + step * (i + 0.7), w - 0.6, i ? (single ? 8 : 5.5) : (single ? 10 : 7), !i));
          });
        });
      });
      doc.setDrawColor(60); doc.setLineWidth(0.3);
      doc.rect(MX, top, W - 2 * MX, headH + rows.length * rh, 'S');
      doc.line(MX + LW, top, MX + LW, top + headH + rows.length * rh);
      if (!single) for (let di = 1; di < days.length; di++) doc.line(X(di * NP), top, X(di * NP), top + headH + rows.length * rh);
      doc.setTextColor(140);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), MX, H - 6);
      doc.text('Página ' + (si + 1) + ' de ' + sections.length, W - MX, H - 6, { align: 'right' });
    });
    App.download(doc.output('blob'), fileName);
  }
};
