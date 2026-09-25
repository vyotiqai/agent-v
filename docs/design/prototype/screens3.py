"""Batch 3: You and settings. Part of the build: python3 screens7.py writes every screen."""
import json

from build import (BLUE_TEXT, RED_TEXT, ON_INK, logic, radio_script, hideable, act, undo_bar, BLUE, DARK, DARK_3, INK, LINE, MUTED, MUTED_DARK, ON_DARK, RED, SURFACE, SURFACE_2, dark_header,
                   icon, page, pill, round_link, screen, spacer, stat, top_row, write_all)
from screens import BLOCK, H1, LABEL, SUB_DARK, initial, mark, primary, secondary
import screens2  # noqa: F401  (registers batch 2 so write_all writes everything)
from screens2 import bar, chevron

from build import GREEN_TEXT as GREEN


def settings_header(back, title, sub=None, extra=''):
    sub_html = f'\n    <p style="{SUB_DARK}; margin-top: 8px">{sub}</p>' if sub else ''
    return dark_header(f'''{top_row(round_link(back, 'back', 'Back'), spacer(0), spacer())}
    <h1 style="{H1}; margin-top: 18px">{title}</h1>{sub_html}{extra}''', bottom_pad=24)


def srow(href, lead, title, sub=None, trail=None, first=False, sub_color=MUTED, h=56):
    rule = '' if first else f'border-top: 1px solid {LINE}; '
    sub_html = (f'<span style="font-size: 13px; color: {sub_color}; white-space: nowrap; overflow: hidden; '
                f'text-overflow: ellipsis">{sub}</span>') if sub else ''
    trail = chevron() if trail is None else trail
    tag, attr = ('a', f' href="{href}"') if href else ('div', '')
    return (f'      <{tag}{attr} style="{rule}display: flex; align-items: center; gap: 12px; min-height: {h}px; '
            f'padding: {(h - 40) // 2}px 0; box-sizing: border-box">{lead}<span style="flex-grow: 1; min-width: 0; display: flex; '
            f'flex-direction: column; gap: 1px"><span style="font-size: 15px; font-weight: 500">{title}</span>'
            f'{sub_html}</span>{trail}</{tag}>')


def group(rows, label=None, pad='4px 18px'):
    head = f'\n      <h2 style="{LABEL}; padding-top: 10px">{label}</h2>' if label else ''
    return f'    <section style="padding: {pad}; {BLOCK}">{head}\n' + '\n'.join(rows) + '\n    </section>'


def body_wrap(*parts):
    return ('\n  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">\n'
            + '\n'.join(parts) + '\n  </div>')


def dot_status(color, text):
    return (f'<span style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: {color}">'
            f'<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 999px; background: {color}"></span>{text}</span>')


# ---- switches: real checkboxes, state in the logic class

def switch(key, label):
    return (f'<span style="position: relative; width: 52px; height: 32px; flex-shrink: 0">'
            f'<span aria-hidden="true" style="position: absolute; inset: 0; border-radius: 999px; background: {{{{{key}.track}}}}; box-shadow: {{{{{key}.ring}}}}"></span>'
            f'<span aria-hidden="true" style="position: absolute; top: 3px; left: {{{{{key}.knob}}}}; width: 26px; height: 26px; border-radius: 999px; background: {{{{{key}.knobBg}}}}; box-shadow: var(--shadow-knob)"></span>'
            f'<input type="checkbox" role="switch" aria-label="{label}" checked="{{{{{key}.on}}}}" onChange="{{{{{key}.flip}}}}" '
            f'style="position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer"></span>')


def toggle_script(defaults, extra_vals='', methods=''):
    """Switches (real checkboxes) plus any extra behaviour, in the shared logic class."""
    vals = f"""    const defaults = {json.dumps(defaults)};
    Object.keys(defaults).forEach((k) => {{
      const on = st[k] ?? defaults[k];
      out[k] = {{
        on: on,
        track: on ? 'var(--ink)' : 'var(--line-strong)',
        ring: on ? 'none' : 'inset 0 0 0 1.5px var(--control-off)',
        knobBg: on ? 'var(--on-ink)' : '#FFFFFF',
        knob: on ? '23px' : '3px',
        flip: () => this.setState({{ [k]: !on }}),
      }};
    }});{extra_vals}"""
    return logic(vals, methods)


def always_on():
    return (f'<span style="display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; color: {MUTED}">'
            f'{icon("lock", 14)}Always on</span>')


# ---------------------------------------------------------------- You (hub)

@screen
def NYou():
    agent = [
        srow('NAI.dc.html', mark('sparkle'), 'Your AI', 'Anthropic · Claude Sonnet 5',
             trail=dot_status(GREEN, 'Working'), first=True, h=52),
        srow('NAccounts.dc.html', mark('link'), 'Connected accounts', 'Gmail and Google Calendar', h=52),
        srow('NLogins.dc.html', mark('key'), 'Saved logins', '4 sites', h=52),
        srow('NRules.dc.html', mark('pen'), 'What needs your signature', 'Acting as you asks first', h=52),
        srow('NMemory.dc.html', mark('memory'), 'What I remember', '46 things', h=52),
    ]
    app = [
        srow('NProfile.dc.html', mark('user'), 'Profile and tone', 'Brief', first=True, h=52),
        srow('NBriefing.dc.html', mark('sun'), 'Morning briefing', 'Weekdays at 7:30', h=52),
        srow('NNotifs.dc.html', mark('bell'), 'Notifications', 'Quiet 22:00 to 07:00', h=52),
        srow('NAppearance.dc.html', mark('grid'), 'Appearance', 'Automatic', h=52),
    ]
    more = [
        srow('NPrivacy.dc.html', mark('shield'), 'Privacy and your data', first=True, h=52),
        srow('NHelp.dc.html', mark('help'), 'Help and feedback', h=52),
    ]
    head = dark_header(f'''{top_row(round_link('NToday.dc.html', 'back', 'Back to today'), '<span style="font-size: 15px; font-weight: 500">You</span>', spacer())}
    <a href="NProfile.dc.html" style="margin-top: 22px; display: flex; align-items: center; gap: 14px">
      {initial('A', bg=DARK_3, fg=ON_DARK, size=56, fs=22)}
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 3px"><span style="font-size: 24px; font-weight: 500; letter-spacing: -0.02em">Ajay</span><span style="font-size: 14px; color: {MUTED_DARK}">ajay@gmail.com</span></span>
      <span style="color: {MUTED_DARK}; display: flex">{icon('chevron', 18)}</span>
    </a>''', bottom_pad=24)
    return page('You', head + body_wrap(group(agent), group(app), group(more)))


# ---------------------------------------------------------------- Profile and tone



@screen
def NProfile():
    def tone(key, name, sample):
        return f'''    <label style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; border: {{{{{key}.border}}}}; display: flex; align-items: center; gap: 14px; cursor: pointer">
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 4px"><span style="font-size: 16px; font-weight: 500">{name}</span><span style="font-size: 14px; line-height: 1.4; color: {MUTED}">{sample}</span></span>
      <input type="radio" name="tone" checked="{{{{{key}.on}}}}" onChange="{{{{{key}.pick}}}}" style="width: 22px; height: 22px; margin: 0; flex-shrink: 0; accent-color: {INK}">
    </label>'''
    head = settings_header('NYou.dc.html', 'Profile and tone', extra=f'''
    <div style="margin-top: 20px; display: flex; align-items: center; gap: 14px">
      {initial('A', bg=DARK_3, fg=ON_DARK, size=64, fs=24)}
      <span style="display: flex; flex-direction: column; gap: 8px">
        <label for="name" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Your name</label>
        <input id="name" type="text" value="Ajay" style="width: 200px; height: 40px; padding: 0 14px; border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; background: rgba(255,255,255,0.06); font-family: inherit; font-size: 16px; color: {ON_DARK}; outline: 0">
        <button type="button" onClick="{{{{note_photo}}}}" style="align-self: flex-start; height: 32px; padding: 0; border: 0; background: transparent; font-family: inherit; font-size: 14px; font-weight: 500; color: {MUTED_DARK}">Change photo</button>
      </span>
    </div>''')
    body = f'''
  <fieldset style="margin: 16px 12px 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px">
    <legend style="margin: 0 12px 8px; padding: 0; font-size: 13px; font-weight: 500; color: {MUTED}">How I write for you</legend>
{tone('t0', 'Brief', '“Friday at 3 works. I’ll bring the Q3 numbers.”')}
{tone('t1', 'Warm', '“Friday at 3 is perfect, thanks Sam! I’ll bring the Q3 numbers.”')}
{tone('t2', 'Formal', '“Friday at 3pm suits me. I will bring the Q3 figures.”')}
{tone('t3', 'In my own words', 'Describe it, or let me learn from emails you’ve sent.')}
  </fieldset>'''
    return page('Profile and tone', head + body + undo_bar(28), script=radio_script({'tone': (0, ['t0', 't1', 't2', 't3'])},
                """
    note('photo', 'Opens your photos or camera to pick a new picture.');"""))


# ---------------------------------------------------------------- Your AI

@screen
def NAI():
    models = [
        srow('NModels.dc.html', mark('sparkle'), 'For jobs', 'Claude Sonnet 5', first=True),
        srow('NModels.dc.html', mark('sparkle'), 'For quick steps', 'Claude Haiku 4.5'),
    ]
    others = [srow('NConnect.dc.html', mark('plus'), 'Add another provider', 'OpenAI, Google or any other', first=True)]
    head = settings_header('NYou.dc.html', 'Your AI', extra=f'''
    <div style="margin-top: 20px; display: flex; align-items: flex-end; justify-content: space-between">
      <span style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 44px; line-height: 1; font-weight: 500; letter-spacing: -0.035em">$3.10</span><span style="font-size: 13px; color: {MUTED_DARK}">this month, of your {{{{limitText}}}} limit</span></span>
      <span style="font-size: 20px; font-weight: 500; color: {MUTED_DARK}">{{{{pct}}}}%</span>
    </div>
    <div style="margin-top: 14px"><span role="img" aria-label="{{{{pct}}}}% of the limit used" style="display: block; height: 6px; border-radius: 999px; background: rgba(255,255,255,0.14); overflow: hidden"><span style="display: block; width: {{{{pct}}}}%; height: 100%; border-radius: 999px; background: {ON_DARK}"></span></span></div>''')
    provider = f'''    <section style="padding: 18px; {BLOCK}; display: flex; flex-direction: column; gap: 14px">
      <div style="display: flex; align-items: center; gap: 12px">
        {initial('A', bg=INK, fg=ON_INK, size=40, fs=16)}
        <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 16px; font-weight: 500">Anthropic</span><span style="font-size: 13px; color: {MUTED}">Key ···9Qx2 · billed by Anthropic</span></span>
        {dot_status(GREEN, 'Working')}
      </div>
      <div style="display: flex; gap: 8px">
        <a href="NKey.dc.html" style="height: 40px; padding: 0 16px; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; font-size: 14px; font-weight: 500; color: {INK}">Replace key</a>
        <button type="button" onClick="{{{{flipLimits}}}}" aria-expanded="{{{{limitsOpen}}}}" style="height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: {SURFACE_2}; font-family: inherit; font-size: 14px; font-weight: 500; color: {INK}">Change limit</button>
      </div>
      <sc-if value="{{{{limitsOpen}}}}" hint-placeholder-val="{{{{ false }}}}">
        <div role="group" aria-label="Monthly limit" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px">{LIMIT_CHIPS}</div>
      </sc-if>
    </section>'''
    return page('Your AI', head + body_wrap(provider, group(models, 'Models'), group(others)) + undo_bar(28), script=logic("""
    // Change limit: pick a new monthly limit; spend and the bar update at once.
    const limits = [10, 20, 50, 100];
    const lim = st.limit ?? 20;
    out.limitText = '$' + lim;
    out.pct = Math.min(100, Math.round(3.10 / lim * 100));
    out.limitsOpen = Boolean(st.limitsOpen);
    out.flipLimits = () => this.setState({ limitsOpen: !st.limitsOpen });
    limits.forEach((v, i) => {
      out['l' + i] = {
        bg: v === lim ? 'var(--ink)' : 'var(--surface-2)',
        fg: v === lim ? 'var(--on-ink)' : 'var(--ink)',
        pressed: v === lim ? 'true' : 'false',
        pick: () => { this.setState({ limit: v, limitsOpen: false }); this.flash('Monthly limit set to $' + v + '.'); },
      };
    });"""))


LIMIT_CHIPS = ''.join(
    f'<button type="button" onClick="{{{{l{i}.pick}}}}" aria-pressed="{{{{l{i}.pressed}}}}" style="height: 40px; border: 0; border-radius: 999px; '
    f'background: {{{{l{i}.bg}}}}; color: {{{{l{i}.fg}}}}; font-family: inherit; font-size: 14px; font-weight: 500">${v}</button>'
    for i, v in enumerate([10, 20, 50, 100]))


# ---------------------------------------------------------------- Connected accounts

def account_row(key, letter, name, who, access, first=False):
    """An account whose Connect really connects, and whose status follows."""
    trail = (f'<sc-if value="{{{{c_{key}}}}}" hint-placeholder-val="{{{{ true }}}}">{dot_status(GREEN, "Connected")}</sc-if>'
             f'<sc-if value="{{{{n_{key}}}}}" hint-placeholder-val="{{{{ false }}}}">'
             f'<button type="button" onClick="{{{{connect_{key}}}}}" disabled="{{{{busy_{key}}}}}" style="height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: {INK}; color: {ON_INK}; font-family: inherit; font-size: 13px; font-weight: 500">{{{{label_{key}}}}}</button></sc-if>')
    return srow(None, initial(letter), name, f'{{{{sub_{key}}}}}', trail=trail, first=first)


def accounts_vals(accts):
    """accts: {key: (connected_at_start, who_when_connected, what_when_not, name)}"""
    import json as _json
    return f"""
    const ACCTS = {_json.dumps(accts, ensure_ascii=False)};
    Object.keys(ACCTS).forEach((k) => {{
      const [start, who, what, name] = ACCTS[k];
      const on = (st.acc || {{}})[k] ?? start;
      const busy = (st.busy || {{}})[k] === true;
      out['c_' + k] = on;
      out['n_' + k] = !on;
      out['busy_' + k] = busy;
      out['label_' + k] = busy ? 'Connecting…' : 'Connect';
      out['sub_' + k] = on ? who : what;
      // Connect goes to the provider's own sign-in; here it comes back connected after a moment.
      out['connect_' + k] = () => {{
        this.setState({{ busy: {{ ...(st.busy || {{}}), [k]: true }} }});
        clearTimeout(this.wait);
        this.wait = setTimeout(() => {{
          const s2 = this.state || {{}};
          this.setState({{ acc: {{ ...(s2.acc || {{}}), [k]: true }}, busy: {{ ...(s2.busy || {{}}), [k]: false }} }});
          this.flash(name + ' connected.');
        }}, 900);
      }};
      out['disconnect_' + k] = () => {{
        this.setState({{ acc: {{ ...(st.acc || {{}}), [k]: false }}, panel: null }});
        this.flash(name + ' disconnected. 2 jobs that use it are paused.', () => {{
          const s2 = this.state || {{}};
          this.setState({{ acc: {{ ...(s2.acc || {{}}), [k]: true }} }});
        }});
      }};
    }});"""


@screen
def NAccounts():
    accts = {'gmail': [True, 'ajay@gmail.com', 'Mail and drafts', 'Gmail'],
             'gcal': [True, 'ajay@gmail.com', 'Free time and events', 'Google Calendar'],
             'outlook': [False, 'ajay@outlook.com', 'Mail and drafts', 'Outlook mail'],
             'ocal': [False, 'ajay@outlook.com', 'Free time and events', 'Outlook Calendar']}
    google = [account_row('gmail', 'G', 'Gmail', *accts['gmail'][1:3], first=True), account_row('gcal', 'G', 'Google Calendar', *accts['gcal'][1:3])]
    microsoft = [account_row('outlook', 'O', 'Outlook mail', *accts['outlook'][1:3], first=True), account_row('ocal', 'O', 'Outlook Calendar', *accts['ocal'][1:3])]
    access = f'''    <sc-if value="{{{{c_gmail}}}}" hint-placeholder-val="{{{{ true }}}}">
    <section style="padding: 16px 18px; {BLOCK}; display: flex; flex-direction: column; gap: 10px">
      <h2 style="{LABEL}">What Gmail access allows</h2>
      <p style="margin: 0; display: flex; gap: 10px; font-size: 14px; line-height: 1.45">{icon('check', 16, 2)}<span>Read and sort your mail, and write drafts</span></p>
      <p style="margin: 0; display: flex; gap: 10px; font-size: 14px; line-height: 1.45">{icon('pen', 16)}<span>Send only what you sign</span></p>
      <sc-if value="{{{{menu}}}}" hint-placeholder-val="{{{{ true }}}}">
        <button type="button" onClick="{{{{open_disc}}}}" style="align-self: flex-start; height: 36px; margin-top: 4px; padding: 0 14px; border: 0; border-radius: 999px; background: {SURFACE_2}; font-family: inherit; font-size: 13px; font-weight: 500; color: {INK}">Disconnect Gmail</button>
      </sc-if>
      <sc-if value="{{{{p_disc}}}}" hint-placeholder-val="{{{{ false }}}}">
        <div role="alertdialog" aria-label="Disconnect Gmail?" style="margin-top: 4px; padding: 14px; border-radius: 18px; background: {SURFACE_2}; display: flex; flex-direction: column; gap: 10px">
          <span style="font-size: 14px; line-height: 1.4"><b style="font-weight: 600">Disconnect Gmail?</b> The morning briefing and 1 other job use it and will pause.</span>
          <span style="display: flex; gap: 8px">{act('Cancel', 'closePanel', bg=SURFACE)}{act('Disconnect', 'disconnect_gmail', bg=INK, fg=ON_INK)}</span>
        </div>
      </sc-if>
    </section>
    </sc-if>'''
    head = settings_header('NYou.dc.html', 'Connected accounts', 'I work through these. You can disconnect any of them at any time.')
    return page('Connected accounts', head + body_wrap(group(google, 'Google'), access, group(microsoft, 'Microsoft')) + undo_bar(28),
                script=logic("    panels(['disc']);" + accounts_vals(accts)))


# ---------------------------------------------------------------- Saved logins

@screen
def NLogins():
    def remove(key):
        return act('Remove', f'hide_{key}')
    sites = [
        hideable(srow(None, initial('H'), 'hubspot.com', 'Used today, 09:14', trail=remove('hubspot'), first=True), 'hubspot'),
        hideable(srow(None, initial('L'), 'linkedin.com', 'Used yesterday', trail=remove('linkedin')), 'linkedin'),
        hideable(srow(None, initial('A'), 'amazon.in', 'Used 3 days ago', trail=remove('amazon')), 'amazon'),
        hideable(srow(None, initial('N'), 'notion.so', 'Used 12 Sep', trail=remove('notion')), 'notion'),
    ]
    note = f'''    <p style="margin: 6px 16px 0; display: flex; gap: 8px; font-size: 13px; line-height: 1.45; color: {MUTED}">{icon('lock', 15)}<span>Passwords and codes are always typed by you, in Take control. I keep only the signed-in session, encrypted.</span></p>'''
    head = settings_header('NYou.dc.html', 'Saved logins', 'Sites my browser stays signed in to, so I can work there for you.')
    body = body_wrap(group(sites), note) + f'''
  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex">
    {primary('NControl.dc.html', 'Sign in to a site', trailing='plus')}
  </div>'''
    return page('Saved logins', head + body + undo_bar(100), script=logic("""    ['hubspot', 'linkedin', 'amazon', 'notion'].forEach((k) => hide(k, 'Signed out of ' + {hubspot: 'hubspot.com', linkedin: 'linkedin.com', amazon: 'amazon.in', notion: 'notion.so'}[k] + ' and removed the saved login.'));"""))


# ---------------------------------------------------------------- What needs your signature

@screen
def NRules():
    def level(ic, name, what, setting, first=False, color=INK, locked=False):
        lk = icon('lock', 13) if locked else ''
        trail = (f'<span style="display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 500; '
                 f'color: {color}; white-space: nowrap">{lk}{setting}</span>')
        return srow(None if locked else 'NRules.dc.html', mark(ic), name, what, trail=trail, first=first)
    levels = [
        level('eye', 'Look', 'Read, search, compare', 'Never asks', first=True, color=MUTED),
        level('file', 'Prepare', 'Drafts, plans, files', 'Never asks', color=MUTED),
        level('mail', 'Act as you', 'Send, accept, post', 'Asks first', color=BLUE_TEXT),
        level('sparkle', 'Spend', 'Buy, book, pay', 'Always asks', color=BLUE_TEXT, locked=True),
        level('trash', 'Can’t be undone', 'Delete, cancel, unsubscribe', 'Asks + Face ID', color=RED_TEXT, locked=True),
    ]
    learned = [
        hideable(srow(None, mark('check'), 'Accept team meetings', 'Since 12 Sep', trail=act('Undo', 'hide_meet'), first=True), 'meet'),
        hideable(srow(None, mark('check'), 'Reply “thanks” to receipts', 'Since 20 Sep', trail=act('Undo', 'hide_thanks')), 'thanks'),
    ]
    head = settings_header('NYou.dc.html', 'What needs your signature')
    return page('What needs your signature', head + body_wrap(group(levels), group(learned, 'Learned exceptions')) + undo_bar(28),
                script=logic("""    hide('meet', 'Accepting team meetings will ask you first again.');
    hide('thanks', 'Replying “thanks” to receipts will ask you first again.');"""))


# ---------------------------------------------------------------- What I remember

@screen
def NMemory():
    mems = [
        hideable(srow(None, mark('user'), 'Maya prefers morning calls', 'From 3 emails', trail=act('Forget', 'hide_m1'), first=True), 'm1'),
        hideable(srow(None, mark('pen'), 'You sign off as “Ajay”', 'From your sent mail', trail=act('Forget', 'hide_m2')), 'm2'),
        hideable(srow(None, mark('flag'), 'Tool budget: $30 a seat', 'You told me · 18 Sep', trail=act('Forget', 'hide_m3')), 'm3'),
        hideable(srow(None, mark('calendar'), 'No meetings before 9:30', 'From your calendar', trail=act('Forget', 'hide_m4')), 'm4'),
    ]
    learn = f'''    <label style="padding: 6px 18px; {BLOCK}; display: flex; align-items: center; gap: 12px; min-height: 68px">
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 15px; font-weight: 500">Learn from my work</span><span style="font-size: 13px; color: {MUTED}">Turn off to keep only what you tell me</span></span>
      {switch('learn', 'Learn from my work')}
    </label>'''
    head = settings_header('NYou.dc.html', 'What I remember', extra=f'''
    <div style="margin-top: 20px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">
      {stat('46', 'things')}
      {stat('12', 'people', left_rule=True)}
      {stat('0', 'shared', left_rule=True)}
    </div>''')
    return page('What I remember', head + body_wrap(learn, group(mems, 'Recent')) + undo_bar(28), script=toggle_script({'learn': True}, """
    ['Maya prefers morning calls', 'You sign off as “Ajay”', 'Tool budget: $30 a seat', 'No meetings before 9:30']
      .forEach((m, i) => hide('m' + (i + 1), 'Forgot: ' + m + '.'));"""))


# ---------------------------------------------------------------- Notifications

@screen
def NNotifs():
    def trow(key, title, sub, first=False):
        rule = '' if first else f'border-top: 1px solid {LINE}; '
        return (f'      <label style="{rule}display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 8px 0; box-sizing: border-box">'
                f'<span style="flex-grow: 1; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 15px; font-weight: 500">{title}</span>'
                f'<span style="font-size: 13px; color: {MUTED}">{sub}</span></span>{switch(key, title)}</label>')
    always = [
        srow(None, mark('pen'), 'Signatures and questions', 'So work never waits silently', trail=always_on(), first=True),
        srow(None, mark('alert'), 'A key or account fails', 'Jobs pause until it’s fixed', trail=always_on()),
    ]
    optional = [
        trow('done', 'Finished jobs', 'When a result is filed', first=True),
        trow('ideas', 'Ideas', 'At most one a day'),
        trow('watch', 'Watch alerts', 'Prices and page changes'),
        trow('quiet', 'Quiet hours', '22:00 to 07:00, except can’t-wait items'),
    ]
    head = settings_header('NYou.dc.html', 'Notifications')
    return page('Notifications', head + body_wrap(group(always), group(optional, 'You choose')),
                script=toggle_script({'done': True, 'ideas': False, 'watch': True, 'quiet': True}))


# ---------------------------------------------------------------- Morning briefing

BRIEFING_SCRIPT_EXTRA = '''
    const days = st.days || [true, true, true, true, true, false, false];
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].forEach((d, i) => {
      out[d] = {
        bg: days[i] ? 'var(--ink)' : 'var(--surface)',
        fg: days[i] ? 'var(--on-ink)' : 'var(--ink)',
        pressed: days[i] ? 'true' : 'false',
        flip: () => { const next = days.slice(); next[i] = !next[i]; this.setState({ days: next }); },
      };
    });'''


@screen
def NBriefing():
    day_btns = ''.join(
        f'<button type="button" aria-label="{full}" aria-pressed="{{{{{k}.pressed}}}}" onClick="{{{{{k}.flip}}}}" '
        f'style="height: 44px; border: 0; border-radius: 999px; background: {{{{{k}.bg}}}}; color: {{{{{k}.fg}}}}; '
        f'font-family: inherit; font-size: 14px; font-weight: 500">{short}</button>'
        for k, short, full in [('mo', 'M', 'Monday'), ('tu', 'T', 'Tuesday'), ('we', 'W', 'Wednesday'),
                               ('th', 'T', 'Thursday'), ('fr', 'F', 'Friday'), ('sa', 'S', 'Saturday'),
                               ('su', 'S', 'Sunday')])

    def trow(key, ic, title, first=False):
        rule = '' if first else f'border-top: 1px solid {LINE}; '
        return (f'      <label style="{rule}display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 6px 0; box-sizing: border-box">'
                f'{mark(ic)}<span style="flex-grow: 1; font-size: 15px; font-weight: 500">{title}</span>{switch(key, title)}</label>')
    includes = [trow('inbox', 'mail', 'Inbox: what needs a reply', first=True), trow('cal', 'calendar', 'Today’s meetings'),
                trow('jobs', 'grid', 'Jobs that finished overnight'), trow('idea', 'memory', 'One idea')]
    head = settings_header('NYou.dc.html', 'Morning briefing', extra=f'''
    <div style="margin-top: 18px; display: flex; align-items: baseline; gap: 10px">
      <span style="font-size: 56px; line-height: 1; font-weight: 500; letter-spacing: -0.04em">7:30</span>
      <span style="font-size: 15px; color: {MUTED_DARK}">every weekday</span>
    </div>''')
    days = f'''    <section style="padding: 14px 18px 18px; {BLOCK}">
      <h2 style="{LABEL}; margin-bottom: 12px">Days</h2>
      <div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px">{day_btns}</div>
    </section>'''
    return page('Morning briefing', head + body_wrap(days, group(includes, 'Includes')),
                script=toggle_script({'inbox': True, 'cal': True, 'jobs': True, 'idea': False},
                                     extra_vals=BRIEFING_SCRIPT_EXTRA))


# ---------------------------------------------------------------- Privacy and your data

@screen
def NPrivacy():
    data = [
        f'''      <button type="button" onClick="{{{{export}}}}" disabled="{{{{exporting}}}}" style="width: 100%; padding: 8px 0; border: 0; background: transparent; display: flex; align-items: center; gap: 12px; min-height: 56px; text-align: left; font-family: inherit; color: {INK}">{mark('download')}<span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 15px; font-weight: 500">Export everything</span><span style="font-size: 13px; color: {MUTED}">{{{{exportSub}}}}</span></span>{chevron()}</button>''',
        srow('NMemory.dc.html', mark('memory'), 'What I remember', '46 things'),
        srow('NComputer.dc.html', mark('file'), 'Files on my computer', '0.4 GB'),
    ]
    promises = f'''    <section style="padding: 16px 18px; {BLOCK}; display: flex; flex-direction: column; gap: 10px">
      <h2 style="{LABEL}">How your data is kept</h2>
      <p style="margin: 0; display: flex; gap: 10px; font-size: 14px; line-height: 1.45">{icon('lock', 16)}<span>Encrypted, and never used to train AI models</span></p>
      <p style="margin: 0; display: flex; gap: 10px; font-size: 14px; line-height: 1.45">{icon('key', 16)}<span>Your API key is only ever used on our servers, for your jobs</span></p>
    </section>'''
    danger = f'''    <section style="padding: 4px 18px; {BLOCK}">
      <sc-if value="{{{{menu}}}}" hint-placeholder-val="{{{{ true }}}}">
        <button type="button" onClick="{{{{open_signout}}}}" style="width: 100%; padding: 0; border: 0; background: transparent; display: flex; align-items: center; min-height: 56px; font-family: inherit; font-size: 15px; font-weight: 500; color: {INK}">Sign out</button>
      </sc-if>
      <sc-if value="{{{{p_signout}}}}" hint-placeholder-val="{{{{ false }}}}">
        <div role="alertdialog" aria-label="Sign out?" style="margin: 8px 0; padding: 14px; border-radius: 18px; background: {SURFACE_2}; display: flex; flex-direction: column; gap: 10px">
          <span style="font-size: 14px; line-height: 1.4"><b style="font-weight: 600">Sign out on this phone?</b> Your jobs keep running; sign in again to see them.</span>
          <span style="display: flex; gap: 8px">{act('Cancel', 'closePanel', bg=SURFACE)}<a href="NWelcome.dc.html" style="height: 34px; padding: 0 13px; border-radius: 999px; background: {INK}; display: flex; align-items: center; font-size: 13px; font-weight: 500; color: {ON_INK}">Sign out</a></span>
        </div>
      </sc-if>
      <a href="NDeleteAccount.dc.html" style="border-top: 1px solid {LINE}; display: flex; align-items: center; gap: 10px; min-height: 56px; font-size: 15px; font-weight: 500; color: {RED_TEXT}">{icon('trash', 18)}Delete my account</a>
    </section>'''
    head = settings_header('NYou.dc.html', 'Privacy and your data')
    return page('Privacy and your data', head + body_wrap(group(data), promises, danger) + undo_bar(28), script=logic("""    panels(['signout']);
    out.exporting = Boolean(st.exporting);
    out.exportSub = st.exporting ? 'Preparing… I’ll tell you when it’s ready' : 'Jobs, files, memory and settings, as a zip';
    out.export = () => {
      this.setState({ exporting: true });
      this.flash('Preparing your export. I’ll notify you when it’s ready to download, usually within an hour.');
    };"""))


if __name__ == '__main__':
    write_all()
