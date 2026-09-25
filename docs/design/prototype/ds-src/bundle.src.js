/* @ds-bundle: {"format":4,"namespace":"AgentV","components":[{"name":"Icon"},{"name":"DarkTop"},{"name":"StatusChip"},{"name":"IconButton"},{"name":"Button"},{"name":"HoldButton"},{"name":"Block"},{"name":"Row"},{"name":"Mark"},{"name":"NeedsYou"},{"name":"Tile"},{"name":"Stats"},{"name":"Steps"},{"name":"AskBar"},{"name":"Switch"},{"name":"ChoiceCard"},{"name":"Filters"},{"name":"Sheet"},{"name":"UndoBar"},{"name":"Confirm"},{"name":"Skeleton"},{"name":"Empty"},{"name":"Problem"},{"name":"StepChart"}]} */
(function () {
  'use strict';
  var React = window.React;
  var h = React.createElement;
  var ICONS = __ICONS__;
  var cx = function () { return Array.prototype.filter.call(arguments, Boolean).join(' '); };

  function Icon(p) {
    var size = p.size || 20;
    return h('svg', {
      className: 'av-icon', width: size, height: size, viewBox: '0 0 24 24', strokeWidth: p.stroke || 1.75,
      role: p.label ? 'img' : undefined, 'aria-label': p.label, 'aria-hidden': p.label ? undefined : 'true',
      dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' },
    });
  }

  // A link when href is given, else a button.
  function Pressable(p) {
    var rest = Object.assign({}, p);
    delete rest.href; delete rest.children;
    if (p.href) return h('a', Object.assign({ href: p.href }, rest), p.children);
    return h('button', Object.assign({ type: 'button' }, rest), p.children);
  }

  function IconButton(p) {
    return h(Pressable, { href: p.href, onClick: p.onClick, 'aria-label': p.label, className: cx('av-iconbtn', 'av-iconbtn-' + (p.tone || 'night')) },
      h(Icon, { name: p.icon }));
  }

  var DOTS = { needs: 'var(--blue-on-night)', undone: 'var(--red-on-night)', working: 'var(--on-night)', quiet: 'var(--on-night-muted)' };
  function StatusChip(p) {
    var dot = p.icon ? h(Icon, { name: p.icon, size: 15 })
      : h('span', { className: cx('av-dot', p.live && 'av-live'), 'aria-hidden': 'true', style: { background: DOTS[p.tone || 'working'] } });
    return h('span', { className: 'av-chip' }, dot, p.children);
  }

  function DarkTop(p) {
    return h('header', { className: cx('av', 'av-top', p.glow !== false && 'av-top-glow') },
      h('div', { className: 'av-top-bar' },
        p.leading || h('span', { className: 'av-spacer' }),
        p.chip || null,
        p.trailing || h('span', { className: 'av-spacer' })),
      p.title ? h('h1', { className: 'av-top-title' }, p.title) : null,
      p.sub ? h('p', { className: 'av-top-sub' }, p.sub) : null,
      p.children);
  }

  function Button(p) {
    var v = p.variant || 'primary';
    return h(Pressable, { href: p.href, onClick: p.onClick, disabled: p.disabled, className: cx('av-btn', 'av-btn-' + v, p.grow && 'av-btn-grow') },
      p.icon ? h(Icon, { name: p.icon, size: 19 }) : null, p.children,
      p.trailing ? h(Icon, { name: p.trailing, size: 18, stroke: 2 }) : null);
  }

  // Press and hold for about 0.9 s to sign (D25). Releasing early cancels. Enter or Space held works the same.
  function HoldButton(p) {
    var st = React.useState(0), pct = st[0], setPct = st[1];
    var sg = React.useState(false), signed = sg[0], setSigned = sg[1];
    var timer = React.useRef(null);
    var stop = function () { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
    React.useEffect(function () { return stop; }, []);
    var begin = function () {
      if (timer.current || signed) return;
      var start = Date.now();
      timer.current = setInterval(function () {
        var v = Math.min(100, (Date.now() - start) / (p.duration || 900) * 100);
        if (v >= 100) { stop(); setPct(100); setSigned(true); if (p.onSigned) p.onSigned(); } else setPct(v);
      }, 16);
    };
    var end = function () { stop(); if (!signed) setPct(0); };
    if (signed && p.done) return p.done;
    return h('button', {
      type: 'button', className: cx('av-hold', 'av-hold-' + (p.tone || 'blue')),
      onPointerDown: begin, onPointerUp: end, onPointerLeave: end,
      onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); begin(); } }, onKeyUp: end,
    },
      h('span', { className: 'av-hold-fill', 'aria-hidden': 'true', style: { width: pct + '%' } }),
      h('span', { className: 'av-hold-label' }, h(Icon, { name: p.faceId ? 'face' : (p.icon || 'pen') }), p.children));
  }

  function Block(p) {
    return h('section', { className: 'av av-block', 'aria-label': p.label },
      p.label ? h('h2', { className: 'av-label' }, p.label) : null, p.children);
  }

  function Mark(p) {
    return h('span', { className: cx('av-mark', p.tone && 'av-mark-' + p.tone), 'aria-hidden': p.label ? undefined : 'true' },
      h(Icon, { name: p.icon, size: 18, label: p.label }));
  }

  function Row(p) {
    var inner = [
      p.icon ? h(Mark, { key: 'm', icon: p.icon, tone: p.markTone }) : p.lead || null,
      h('span', { key: 't', className: 'av-rowtext' },
        h('span', { className: 'av-rowtitle' }, p.title),
        p.detail ? h('span', { className: cx('av-rowdetail', p.detailTone && 'av-tone-' + p.detailTone) }, p.detail) : null),
      p.trailing !== undefined ? h(React.Fragment, { key: 'r' }, p.trailing)
        : (p.href || p.onClick) ? h('span', { key: 'r', className: 'av-chev' }, h(Icon, { name: 'chevron', size: 18 })) : null,
    ];
    if (p.href) return h('a', { href: p.href, className: 'av-rowitem' }, inner);
    if (p.onClick) return h('button', { type: 'button', onClick: p.onClick, className: 'av-rowitem' }, inner);
    return h('div', { className: 'av-rowitem' }, inner);
  }

  function NeedsYou(p) {
    return h('section', { className: 'av av-needs', 'aria-label': 'Needs you' },
      h('div', { className: 'av-needs-head' },
        h('span', { className: 'av-needs-ic', 'aria-hidden': 'true' }, h(Icon, { name: p.icon || 'pen', size: 18 })),
        h('h2', { className: 'av-needs-count' }, 'Needs you' + (p.count ? ' · ' + p.count : '')),
        h('button', { type: 'button', className: 'av-needs-open', onClick: p.onOpen, 'aria-label': 'Open: ' + p.title }, h(Icon, { name: 'up_right' }))),
      h('p', { className: 'av-needs-title' }, p.title),
      p.detail ? h('p', { className: 'av-needs-detail' }, p.detail) : null,
      p.chips && p.chips.length ? h('div', { className: 'av-needs-chips' }, p.chips.map(function (c, i) {
        return h('button', { key: i, type: 'button', className: 'av-needs-chip', onClick: c.onClick }, h(Icon, { name: c.icon, size: 15 }), c.label);
      })) : null);
  }

  function Tile(p) {
    return h(Pressable, { href: p.href, onClick: p.onClick, className: cx('av', 'av-tile', p.dark && 'av-tile-dark') },
      h('span', { className: 'av-tile-head' }, h(Mark, { icon: p.icon }), h('span', { className: 'av-tile-status' }, p.status)),
      h('span', { className: 'av-tile-title' }, p.title),
      p.children);
  }

  function Stats(p) {
    return h('div', { className: 'av-stats', style: { gridTemplateColumns: 'repeat(' + p.items.length + ', minmax(0, 1fr))' } },
      p.items.map(function (s, i) {
        return h('span', { key: i, className: 'av-stat' }, h('span', { className: 'av-stat-value' }, s.value), h('span', { className: 'av-stat-label' }, s.label));
      }));
  }

  function Steps(p) {
    var segs = [];
    for (var i = 0; i < p.total; i++) segs.push(h('span', { key: i, className: cx('av-step', i < p.done && 'av-step-done', i === p.done && p.live && 'av-live') }));
    return h('span', { className: 'av-steps', role: 'img', 'aria-label': 'Step ' + Math.min(p.done + 1, p.total) + ' of ' + p.total }, segs);
  }

  function Meter(p) {
    return h('span', { className: 'av-meter', role: 'img', 'aria-label': p.value + '%' }, h('span', { style: { width: p.value + '%' } }));
  }

  function AskBar(p) {
    return h('div', { className: 'av av-ask' },
      h('button', { type: 'button', className: 'av-iconbtn av-ask-plus', 'aria-label': 'Attach a photo, file or link', onClick: p.onAttach }, h(Icon, { name: 'plus' })),
      h('button', { type: 'button', className: 'av-ask-text', onClick: p.onOpen }, p.placeholder || 'Hand something off…'),
      h('button', { type: 'button', className: 'av-iconbtn av-iconbtn-blue', 'aria-label': 'Speak', onClick: p.onSpeak }, h(Icon, { name: 'mic' })));
  }

  function Switch(p) {
    var st = React.useState(!!p.defaultChecked), on = p.checked !== undefined ? p.checked : st[0];
    return h('span', { className: 'av-switch' },
      h('input', { type: 'checkbox', role: 'switch', 'aria-label': p.label, checked: on,
        onChange: function () { st[1](!on); if (p.onChange) p.onChange(!on); } }),
      h('span', { className: 'av-switch-track', 'aria-hidden': 'true' }),
      h('span', { className: 'av-switch-knob', 'aria-hidden': 'true' }));
  }

  function ChoiceCard(p) {
    return h('label', { className: cx('av', 'av-choice', p.checked && 'av-choice-on') },
      p.lead || null,
      h('span', { className: 'av-choice-text' }, h('span', { className: 'av-choice-title' }, p.title),
        p.detail ? h('span', { className: 'av-choice-detail' }, p.detail) : null),
      h('input', { type: 'radio', name: p.name, checked: !!p.checked, onChange: p.onChange }));
  }

  function Filters(p) {
    var st = React.useState(p.defaultValue || 0), sel = p.value !== undefined ? p.value : st[0];
    return h('div', { className: 'av-filters', role: 'group', 'aria-label': p.label }, p.options.map(function (o, i) {
      return h('button', { key: i, type: 'button', 'aria-pressed': sel === i, className: cx('av-filter', sel === i && 'av-filter-on'),
        onClick: function () { st[1](i); if (p.onChange) p.onChange(i); } }, o);
    }));
  }

  function Sheet(p) {
    return h('section', { className: 'av av-sheet', role: 'dialog', 'aria-label': p.title },
      h('span', { className: 'av-grab', 'aria-hidden': 'true' }),
      p.title ? h('span', { className: 'av-sheet-title' }, p.title) : null,
      (p.items || []).map(function (it, i) {
        return h('button', { key: i, type: 'button', onClick: it.onClick, className: cx('av-menuitem', it.danger && 'av-menuitem-red') }, h(Icon, { name: it.icon }), it.label);
      }),
      p.children,
      p.onClose ? h('button', { type: 'button', className: 'av-sheet-close', onClick: p.onClose }, 'Close') : null);
  }

  function UndoBar(p) {
    return h('div', { className: 'av av-toast', role: 'status' },
      h('span', { className: 'av-toast-text' }, p.children),
      p.onUndo ? h('button', { type: 'button', className: 'av-toast-undo', onClick: p.onUndo }, 'Undo') : null);
  }

  function Confirm(p) {
    return h('div', { className: 'av av-confirm', role: 'alertdialog', 'aria-label': p.title },
      h('span', { className: 'av-confirm-text' }, h('b', { style: { fontWeight: 600 } }, p.title), p.detail ? ' ' + p.detail : ''),
      h('span', { className: 'av-confirm-actions' },
        h('button', { type: 'button', className: 'av-btn av-confirm-cancel', onClick: p.onCancel }, p.cancelLabel || 'Cancel'),
        h('button', { type: 'button', className: cx('av-btn', p.danger ? 'av-confirm-go-red' : 'av-confirm-go'), onClick: p.onConfirm }, p.confirmLabel)));
  }

  function Skeleton(p) {
    var lines = p.lines || [[36, 36, true], [78, 18], [46, 12]];
    return h('div', { className: 'av av-skel av-live', role: 'status', 'aria-label': p.label || 'Loading' },
      lines.map(function (l, i) {
        return h('span', { key: i, style: l[2] ? { width: l[0] + 'px', height: l[1] + 'px' } : { width: l[0] + '%', height: l[1] + 'px' } });
      }));
  }

  function Empty(p) {
    return h('section', { className: 'av av-empty' },
      h(Mark, { icon: p.icon || 'grid' }),
      h('h2', { className: 'av-empty-title' }, p.title),
      h('p', { className: 'av-empty-detail' }, p.detail),
      p.children);
  }

  function Problem(p) {
    return h('section', { className: 'av av-problem', role: 'alert' },
      h('div', { className: 'av-problem-head' }, h(Mark, { icon: 'alert' }),
        h('span', { className: 'av-rowtext' }, h('span', { className: 'av-rowtitle', style: { whiteSpace: 'normal' } }, p.title),
          h('span', { className: 'av-rowdetail', style: { whiteSpace: 'normal', lineHeight: 1.4 } }, p.detail))),
      h('div', { className: 'av-problem-foot' },
        p.onRetry ? h('button', { type: 'button', className: 'av-btn av-btn-small', onClick: p.onRetry }, p.retryLabel || 'Try again') : h('span'),
        p.reference ? h('span', { className: 'av-ref' }, 'Ref. ' + p.reference) : null));
  }

  // A value over time, drawn as steps (a price holds until it changes), with a dashed alert line.
  function StepChart(p) {
    var w = p.width || 330, H = p.height || 128, pts = p.points, lo = p.min, hi = p.max, top = 22, bottom = H - 6;
    var y = function (v) { return Math.round((bottom - (v - lo) / (hi - lo) * (bottom - top)) * 10) / 10; };
    var step = (w - 12) / (pts.length - 1);
    var d = 'M0 ' + y(pts[0]);
    for (var i = 1; i < pts.length; i++) d += ' H' + Math.round(i * step * 10) / 10 + ' V' + y(pts[i]);
    var last = pts[pts.length - 1], xe = Math.round((pts.length - 1) * step * 10) / 10, ya = y(p.alert);
    return h('section', { className: 'av av-chart', 'aria-label': p.title },
      h('h2', { className: 'av-label' }, p.title),
      h('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img', 'aria-label': p.summary },
        h('line', { x1: 0, y1: ya, x2: w, y2: ya, style: { stroke: 'var(--ink-muted)' }, strokeWidth: 1, strokeDasharray: '3 4' }),
        h('text', { x: 0, y: ya - 7, fontSize: 12, style: { fill: 'var(--ink-muted)' } }, p.alertLabel),
        h('text', { x: 0, y: y(pts[0]) - 9, fontSize: 12, style: { fill: 'var(--ink-muted)' } }, p.format(pts[0])),
        h('path', { d: d, fill: 'none', style: { stroke: 'var(--ink)' }, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        h('circle', { cx: xe, cy: y(last), r: 5, style: { fill: 'var(--ink)', stroke: 'var(--surface)' }, strokeWidth: 2 }),
        h('text', { x: xe + 5, y: y(last) + 20, textAnchor: 'end', fontSize: 12, fontWeight: 500, style: { fill: 'var(--ink)' } }, p.format(last))),
      h('div', { className: 'av-chart-axis', 'aria-hidden': 'true' }, h('span', null, p.from), h('span', null, p.to)));
  }

  window.AgentV = Object.assign(window.AgentV || {}, {
    Icon: Icon, DarkTop: DarkTop, StatusChip: StatusChip, IconButton: IconButton, Button: Button, HoldButton: HoldButton,
    Block: Block, Row: Row, Mark: Mark, NeedsYou: NeedsYou, Tile: Tile, Stats: Stats, Steps: Steps, Meter: Meter,
    AskBar: AskBar, Switch: Switch, ChoiceCard: ChoiceCard, Filters: Filters, Sheet: Sheet, UndoBar: UndoBar,
    Confirm: Confirm, Skeleton: Skeleton, Empty: Empty, Problem: Problem, StepChart: StepChart,
  });
})();
