"""Shared pieces of the Agent V design prototype: tokens, icons, the page template, the shared logic class
(Undo bar, hide and restore, panels), and write_all(), which writes every screen and its dark copy.

The screens are in screens.py to screens7.py; run: python3 screens7.py  (writes into appmap/project/).
"""
import os

OUT = os.path.join(os.path.dirname(__file__), 'appmap', 'project')

# Tokens (stage 5). Every colour is a CSS variable from tokens.py, so each screen follows the light or
# dark theme set on <main data-theme>. Light values are exactly the agreed screens' (D34, D35).
import tokens as T


def v(name):
    return f'var(--{name})'


DARK = v('night')             # the dark top; ground of full dark screens
DARK_2 = v('night-2')         # dark tiles and panels
DARK_3 = v('night-3')         # avatars on night
ON_DARK = v('on-night')
MUTED_DARK = v('on-night-muted')
DIM_DARK = v('on-night-dim')
GLASS = v('glass')
LIGHT = v('ground')           # light ground
SURFACE = v('surface')
SURFACE_2 = v('surface-2')
INK = v('ink')
MUTED = v('ink-muted')
LINE = v('line')
LINE_STRONG = v('line-strong')
SKELETON = v('skeleton')
DISABLED = v('disabled')
ON_INK = v('on-ink')
ACTION = v('action')
ON_ACTION = v('on-action')
BAR = v('bar')
ON_BAR = v('on-bar')
ON_BAR_MUTED = v('on-bar-muted')
BLUE = v('blue')
ON_BLUE = v('on-blue')
ON_BLUE_MUTED = v('on-blue-muted')
BLUE_DEEP = v('blue-deep')
BLUE_TEXT = v('blue-text')
BLUE_SOFT = v('blue-on-night')   # blue on dark, for small marks
RED = v('red')
ON_RED = v('on-red')
RED_TEXT = v('red-text')
RED_ON_DARK = v('red-on-night')
GREEN = v('green')
GREEN_TEXT = v('green-text')
ON_GREEN = v('on-green')
SCRIM = v('scrim')
CONTROL_OFF = v('control-off')
TOAST = v('toast')
ON_TOAST = v('on-toast')
GLOW_TOP = 'radial-gradient(70% 60% at 100% 0%, var(--glow) 0%, rgba(51,85,255,0) 100%)'
# Pictures of other things (a website, a calendar in a replay) keep their own fixed colours.
PIC_INK = '#111113'
PIC_MUTED = '#6B6B70'

ICONS = {
    'x': '<path d="M18 6 6 18M6 6l12 12"/>',
    'back': '<path d="m15 18-6-6 6-6"/>',
    'more': '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    'pen': '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
    'edit': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    'list': '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    'arrow': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'up_right': '<path d="M7 17 17 7M8 7h9v9"/>',
    'lock': '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    'hand': '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5v-7a1.5 1.5 0 0 1 3 0V12"/><path d="M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.3 15.2a1.6 1.6 0 0 1 2.4-2.1L8 14.5"/>',
    'share': '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    'face': '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 16a4 4 0 0 0 5 0"/>',
    'memory': '<path d="M12 3a6 6 0 0 0-6 6c0 2.4 1.4 3.9 2.5 5 .6.6 1 1.3 1 2.1V17h5v-.9c0-.8.4-1.5 1-2.1 1.1-1.1 2.5-2.6 2.5-5a6 6 0 0 0-6-6z"/><path d="M10 21h4"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'cursor': '<path d="m5 3 14 7-6 2-2 6z" fill="currentColor"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'key': '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M16 7l3 3M14 9l2 2"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    'shield': '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    'bell': '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    'help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
    'download': '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    'sparkle': '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
    'alert': '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17.5v.01"/>',
    'flag': '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    'terminal': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    'file': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    'sheet': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    'play': '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    'prev': '<path d="M18 6 9 12l9 6zM6 6v12"/>',
    'next': '<path d="m6 6 9 6-9 6zM18 6v12"/>',
    'grid': '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    'repeat': '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    'question': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
    'chevron': '<path d="m9 6 6 6-6 6"/>',
    'archive': '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    'vmark': '<path d="m7 8 5 9 5-9"/>',
    'mic_off': '<path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18"/>',
    'offline': '<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.3-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.7"/><path d="M22 8.8A15 15 0 0 0 10.7 5.1"/><path d="m2 2 20 20"/>',
    'trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
}


def icon(name, size=20, sw=1.75, label=None, extra=''):
    a11y = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true"'
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" {a11y}{extra}>{ICONS[name]}</svg>')


def page(title, body, ground=LIGHT, bg_image=None, color=INK, extra_css='', script=None):
    bg = f'background-color: {ground}' + (f'; background-image: {bg_image}' if bg_image else '')
    script = script or logic('')
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Agent V — {title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400&amp;display=swap">
<style>
body{{margin:0;font-family:"Geist",system-ui,sans-serif;background:{ground};font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}}
a{{color:inherit;text-decoration:none}}
@keyframes breathe{{0%,100%{{opacity:1}}50%{{opacity:.3}}}}
.live{{animation:breathe 1.6s ease-in-out infinite}}
@media (prefers-reduced-motion:reduce){{.live{{animation:none}}}}
:focus-visible{{outline:2px solid var(--focus);outline-offset:2px}}
{T.css_vars()}{extra_css}
</style>
</helmet>
<main data-theme="{{{{theme}}}}" style="position: relative; width: 390px; height: 844px; overflow: hidden; {bg}; font-family: 'Geist', system-ui, sans-serif; color: {color}">
{body}
</main>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"theme":{{"editor":"enum","options":["light","dark"],"default":"light","section":"Appearance"}},"$preview":{{"width":390,"height":844}}}}'>
{script}
</script>
</body>
</html>
'''


def round_link(href, name, label, bg=GLASS, fg=ON_DARK, size=44):
    return (f'<a href="{href}" aria-label="{label}" style="width: {size}px; height: {size}px; flex-shrink: 0; border-radius: 999px; '
            f'background: {bg}; color: {fg}; display: flex; align-items: center; justify-content: center">{icon(name)}</a>')


def round_button(name, label, bg=GLASS, fg=ON_DARK, size=44, on=None):
    handler = f' onClick="{{{{{on}}}}}"' if on else ''
    return (f'<button type="button" aria-label="{label}"{handler} style="width: {size}px; height: {size}px; flex-shrink: 0; border: 0; border-radius: 999px; '
            f'background: {bg}; color: {fg}; display: flex; align-items: center; justify-content: center">{icon(name)}</button>')


def spacer(w=44):
    return f'<span style="width: {w}px; flex-shrink: 0"></span>'


def pill(content, bg=GLASS, fg=ON_DARK, h=32):
    return (f'<span style="height: {h}px; padding: 0 13px; border-radius: 999px; background: {bg}; color: {fg}; display: flex; '
            f'align-items: center; gap: 7px; white-space: nowrap; font-size: 13px; font-weight: 500">{content}</span>')


def dot(color, live=False):
    cls = ' class="live"' if live else ''
    return f'<span{cls} aria-hidden="true" style="width: 7px; height: 7px; border-radius: 999px; background: {color}"></span>'


def top_row(left, center, right):
    return f'''    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
      {left}
      {center}
      {right}
    </div>'''


def dark_header(inner, bottom_pad=26, glow=True):
    img = f'; background-image: {GLOW_TOP}' if glow else ''
    return f'''  <header style="padding: 58px 24px {bottom_pad}px; border-radius: 0 0 32px 32px; background-color: {DARK}{img}; color: {ON_DARK}; display: flex; flex-direction: column">
{inner}
  </header>'''


def ask_bar(placeholder, href_text, href_voice, bottom=28):
    return f'''  <div style="position: absolute; left: 12px; right: 12px; bottom: {bottom}px; height: 60px; padding: 0 8px; box-sizing: border-box; border-radius: 999px; background: {BAR}; color: {ON_BAR}; display: flex; align-items: center; gap: 4px; box-shadow: var(--shadow-bar)">
    {round_link(href_text, 'plus', 'Attach a photo, file or link', bg='rgba(255,255,255,0.1)')}
    <a href="{href_text}" style="flex-grow: 1; min-width: 0; height: 44px; padding-left: 8px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; font-size: 16px; color: {ON_BAR_MUTED}">{placeholder}</a>
    {round_link(href_voice, 'mic', 'Speak', bg=BLUE, fg=ON_BLUE)}
  </div>'''


def stat(num, label, color_num=ON_DARK, color_label=MUTED_DARK, left_rule=False):
    rule = f'padding-left: 16px; border-left: 1px solid rgba(255,255,255,0.1); ' if left_rule else ''
    return (f'<span style="{rule}display: flex; flex-direction: column; gap: 4px">'
            f'<span style="font-size: 34px; line-height: 1; font-weight: 500; letter-spacing: -0.03em; color: {color_num}">{num}</span>'
            f'<span style="font-size: 13px; color: {color_label}">{label}</span></span>')


def logic(vals='', methods=''):
    """One logic class per screen: the shared Undo bar (D65), hide and restore, notes, flags and panels,
    plus the screen's own behaviour (vals: JS statements that add to `out`; methods: extra class methods)."""
    return f"""class Component extends DCLogic {{
  componentWillUnmount() {{
    clearTimeout(this.barTimer);
    clearInterval(this.timer);
    clearInterval(this.tick);
    clearTimeout(this.wait);
  }}
  flash(text, undo) {{
    clearTimeout(this.barTimer);
    this.setState({{ bar: text, undo: undo || null }});
    this.barTimer = setTimeout(() => this.setState({{ bar: null, undo: null }}), 5000);
  }}
  setGone(id, on) {{
    const g = {{ ...((this.state || {{}}).gone || {{}}) }};
    if (on) g[id] = true; else delete g[id];
    this.setState({{ gone: g }});
  }}{methods}
  renderVals() {{
    const st = this.state || {{}};
    const gone = st.gone || {{}};
    const out = {{
      theme: (this.props && this.props.theme) || 'light',
      bar: st.bar || '',
      barOn: Boolean(st.bar),
      canUndo: Boolean(st.undo),
      undo: () => {{
        const u = st.undo;
        clearTimeout(this.barTimer);
        this.setState({{ bar: null, undo: null }});
        if (u) u();
      }},
    }};
    // A row that goes away at once, with Undo (D65).
    const hide = (id, msg) => {{
      out['show_' + id] = gone[id] ? 'none' : 'flex';
      out['hide_' + id] = () => {{
        this.setGone(id, true);
        this.flash(msg, () => this.setGone(id, false));
      }};
    }};
    // A short message in the bar, for things that happen outside the app (share sheet, browser, Settings).
    const note = (id, msg) => {{
      out['note_' + id] = () => this.flash(msg);
    }};
    // Which panel or confirmation is open: out.p_<name> is true for the open one, out.menu when none is.
    const panels = (names) => {{
      out.menu = !st.panel;
      names.forEach((n) => {{
        out['p_' + n] = st.panel === n;
        out['open_' + n] = () => this.setState({{ panel: n }});
      }});
      out.closePanel = () => this.setState({{ panel: null }});
    }};
{vals}
    return out;
  }}
}}"""


HOLD_METHODS = """
  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  begin() {
    const st = this.state || {};
    if (this.timer || st.signed) return;
    const started = Date.now();
    this.timer = setInterval(() => {
      const pct = Math.min(100, (Date.now() - started) / 9);
      if (pct >= 100) {
        this.stopTimer();
        this.setState({ pct: 100, signed: true });
      } else {
        this.setState({ pct: pct });
      }
    }, 16);
  }
  end() {
    this.stopTimer();
    const st = this.state || {};
    if (!st.signed) this.setState({ pct: 0 });
  }"""

HOLD_VALS = """    out.pct = Math.round(st.pct || 0);
    out.signed = Boolean(st.signed);
    out.notSigned = !st.signed;
    out.begin = () => this.begin();
    out.end = () => this.end();
    out.keyBegin = (e) => {
      if (e && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.begin();
      }
    };"""

HOLD_SCRIPT = logic(HOLD_VALS, HOLD_METHODS)


def radio_script(groups, extra_vals='', methods='', color='var(--ink)'):
    """groups: {state_key: (default_index, [value keys])}; one selected card per group, in the shared logic class."""
    lines = []
    for sk, (default, keys) in groups.items():
        for i, k in enumerate(keys):
            lines.append(f"    out.{k} = opt('{sk}', {i}, {default});")
    vals = f"    const COLOR = '{color}';\n" + """    const opt = (sk, i, def) => {
      const sel = st[sk] ?? def;
      return {
        on: sel === i,
        border: sel === i ? '2px solid ' + COLOR : '2px solid transparent',
        pick: () => this.setState({ [sk]: i }),
      };
    };
""" + '\n'.join(lines) + extra_vals
    return logic(vals, methods)


def hideable(html, key):
    """Makes a row removable: its first `display: flex` becomes the state-driven show_<key>."""
    assert 'display: flex' in html
    return html.replace('display: flex', f'display: {{{{show_{key}}}}}', 1)


def act(text, handler, bg=None, fg=None, h=34, disabled=None):
    bg = bg or SURFACE_2
    fg = fg or INK
    dis = f' disabled="{{{{{disabled}}}}}"' if disabled else ''
    return (f'<button type="button" onClick="{{{{{handler}}}}}"{dis} style="height: {h}px; padding: 0 13px; flex-shrink: 0; '
            f'border: 0; border-radius: 999px; background: {bg}; font-family: inherit; font-size: 13px; font-weight: 500; '
            f'color: {fg}; white-space: nowrap">{text}</button>')


def undo_bar(bottom=100):
    """The bar that says what just happened, with Undo when it can be undone (D65)."""
    return f"""
  <sc-if value="{{{{barOn}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div role="status" style="position: absolute; left: 12px; right: 12px; bottom: {bottom}px; min-height: 52px; padding: 8px 8px 8px 18px; box-sizing: border-box; border-radius: 18px; background: {TOAST}; color: {ON_TOAST}; display: flex; align-items: center; gap: 12px; box-shadow: var(--shadow-toast); z-index: 5">
      <span style="flex-grow: 1; font-size: 14px; line-height: 1.35">{{{{bar}}}}</span>
      <sc-if value="{{{{canUndo}}}}" hint-placeholder-val="{{{{ false }}}}">
        <button type="button" onClick="{{{{undo}}}}" style="height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(255,255,255,0.12); font-family: inherit; font-size: 14px; font-weight: 600; color: {ON_TOAST}">Undo</button>
      </sc-if>
    </div>
  </sc-if>"""


def hold_button(text, color, icon_name):
    return f'''<button type="button" onPointerDown="{{{{begin}}}}" onPointerUp="{{{{end}}}}" onPointerLeave="{{{{end}}}}" onKeyDown="{{{{keyBegin}}}}" onKeyUp="{{{{end}}}}" style="position: relative; height: 60px; border: 0; border-radius: 999px; background: {color}; overflow: hidden; font-family: inherit; font-size: 16px; font-weight: 600; color: #FFFFFF; touch-action: none; user-select: none">
        <span aria-hidden="true" style="position: absolute; left: 0; top: 0; bottom: 0; width: {{{{pct}}}}%; background: #FFFFFF; opacity: 0.24"></span>
        <span style="position: relative; display: flex; align-items: center; justify-content: center; gap: 9px">{icon(icon_name, 20)}{text}</span>
      </button>'''


SCREENS = {}


def screen(fn):
    SCREENS[fn.__name__] = fn
    return fn


def dark_copy(name, html):
    """The same screen in the dark theme; links go to the dark copies, so a whole flow stays dark."""
    out = html.replace("theme: (this.props && this.props.theme) || 'light',", "theme: (this.props && this.props.theme) || 'dark',")
    out = out.replace('"theme":{"editor":"enum","options":["light","dark"],"default":"light"',
                      '"theme":{"editor":"enum","options":["light","dark"],"default":"dark"')
    assert out.count("|| 'dark',") == 1, name
    for other in SCREENS:
        out = out.replace(f'href="{other}.dc.html"', f'href="{other}Dark.dc.html"')
    return out.replace('<title>Agent V — ', '<title>Agent V (dark) — ', 1)


def write_all():
    for name, fn in SCREENS.items():
        html = fn()
        with open(os.path.join(OUT, f'{name}.dc.html'), 'w') as f:
            f.write(html)
        with open(os.path.join(OUT, f'{name}Dark.dc.html'), 'w') as f:
            f.write(dark_copy(name, html))
    print('wrote', ', '.join(SCREENS), '(each also in dark)')
