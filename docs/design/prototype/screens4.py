"""Batch 4: getting started, job menu, spend, notifications, share. Part of the build: python3 screens7.py writes every screen."""
from build import (RED_TEXT, ON_BLUE_MUTED, ON_INK, ON_BLUE, ON_RED, ON_GREEN, SCRIM, LINE_STRONG, GREEN as GREEN_FILL, RED_ON_DARK, dot, logic, hideable, act, undo_bar, radio_script, BLUE, BLUE_SOFT, DARK, DARK_2, DARK_3, GLASS, GLOW_TOP, HOLD_SCRIPT, INK, LINE, MUTED, MUTED_DARK,
                   ON_DARK, RED, SURFACE, SURFACE_2, dark_header, hold_button, icon, page, pill, round_link, screen,
                   spacer, top_row, write_all)
from screens import BLOCK, H1, LABEL, SUB_DARK, initial, mark, primary, secondary
import screens3  # noqa: F401  (registers earlier batches)
from screens3 import GREEN, account_row, accounts_vals, body_wrap, dot_status, group, settings_header, srow, switch, toggle_script

STEPS = 4


def steps_bar(n):
    segs = ''.join(f'<span style="flex-grow: 1; height: 4px; border-radius: 2px; '
                   f'background: {ON_DARK if i < n else "rgba(255,255,255,0.18)"}"></span>' for i in range(STEPS))
    return f'<div role="img" aria-label="Step {n} of {STEPS}" style="display: flex; gap: 4px">{segs}</div>'


def setup_header(back, step, title, sub=None):
    """The first step has no Back (you've just signed in): it has Not now instead, which goes to You (D46, D160)."""
    sub_html = f'\n    <p style="{SUB_DARK}; margin-top: 8px">{sub}</p>' if sub else ''
    if back:
        left, right = round_link(back, 'back', 'Back'), spacer()
    else:
        left = spacer(64)
        right = (f'<a href="NYou.dc.html" style="width: 64px; height: 44px; flex-shrink: 0; display: flex; align-items: center; '
                 f'justify-content: flex-end; font-size: 15px; font-weight: 500; color: {MUTED_DARK}">Not now</a>')
    return dark_header(f'''{top_row(left, f'<span style="font-size: 13px; color: {MUTED_DARK}">Step {step} of {STEPS}</span>', right)}
    <div style="margin-top: 16px">{steps_bar(step)}</div>
    <h1 style="{H1}; margin-top: 22px">{title}</h1>{sub_html}''', bottom_pad=24)


def bottom(*buttons):
    return (f'\n  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; gap: 8px">\n    '
            + '\n    '.join(buttons) + '\n  </div>')


def radio_card(key, lead, title, sub, name):
    return f'''    <label style="min-height: 72px; padding: 12px 18px; box-sizing: border-box; border-radius: 24px; background: {SURFACE}; border: {{{{{key}.border}}}}; display: flex; align-items: center; gap: 14px; cursor: pointer">
      {lead}
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">{title}</span><span style="font-size: 13px; color: {MUTED}">{sub}</span></span>
      <input type="radio" name="{name}" checked="{{{{{key}.on}}}}" onChange="{{{{{key}.pick}}}}" style="width: 22px; height: 22px; margin: 0; flex-shrink: 0; accent-color: {INK}">
    </label>'''


# ---------------------------------------------------------------- Welcome

@screen
def NWelcome():
    body = f'''  <div style="position: absolute; left: 50%; top: 250px; width: 0; height: 0" aria-hidden="true">
    <span style="position: absolute; left: -150px; top: -150px; width: 300px; height: 300px; border-radius: 999px; background: radial-gradient(circle, rgba(111,136,255,0.55) 0%, rgba(51,85,255,0.25) 40%, rgba(51,85,255,0) 70%)"></span>
    <span style="position: absolute; left: -44px; top: -44px; width: 88px; height: 88px; border-radius: 28px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m7 8 5 9 5-9"/></svg></span>
  </div>
  <div style="position: absolute; left: 24px; right: 24px; top: 430px; display: flex; flex-direction: column; gap: 12px">
    <h1 style="margin: 0; font-size: 48px; line-height: 1; font-weight: 500; letter-spacing: -0.04em">Hand it off.</h1>
    <p style="margin: 0; font-size: 17px; line-height: 1.45; color: {MUTED_DARK}">Tell me what you want done. I plan it, work on it around the clock, and bring you only what needs you.</p>
  </div>
  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; gap: 8px">
    <a href="NConnect.dc.html" style="height: 56px; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600">Continue with Apple</a>
    <a href="NConnect.dc.html" style="height: 56px; border-radius: 999px; background: {GLASS}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600">Continue with Google</a>
    <p style="margin: 0; text-align: center; font-size: 12px; color: {MUTED_DARK}">By continuing you agree to the Terms and the Privacy Policy.</p>
  </div>'''
    return page('Welcome', body, ground=DARK, color=ON_DARK)


# ---------------------------------------------------------------- Connect your AI

@screen
def NConnect():
    cards = [
        radio_card('p0', initial('A', bg=INK, fg=ON_INK, size=40, fs=16), 'Anthropic', 'Claude models', 'provider'),
        radio_card('p1', initial('O', bg=INK, fg=ON_INK, size=40, fs=16), 'OpenAI', 'GPT models', 'provider'),
        radio_card('p2', initial('G', bg=INK, fg=ON_INK, size=40, fs=16), 'Google', 'Gemini models', 'provider'),
        radio_card('p3', mark('plus', size=40), 'Another provider', 'OpenRouter, Groq, your own server…', 'provider'),
    ]
    head = setup_header(None, 1, 'Connect your AI', 'Agent V is free. I run on your own AI account, and your provider bills you for what you use.')
    body = f'''
  <fieldset style="margin: 12px 12px 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px">
    <legend style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Choose your AI provider</legend>
{chr(10).join(cards)}
  </fieldset>''' + bottom(secondary('NGetKey.dc.html', 'Get a key'), primary('NKey.dc.html', 'I have a key'))
    return page('Connect your AI', head + body, script=radio_script({'provider': (0, ['p0', 'p1', 'p2', 'p3'])}))


# ---------------------------------------------------------------- Get a key

@screen
def NGetKey():
    def step(n, title, sub, first=False):
        rule = '' if first else f'border-top: 1px solid {LINE}; '
        return (f'      <li style="{rule}display: flex; gap: 14px; padding: 16px 0">'
                f'<span style="width: 34px; height: 34px; flex-shrink: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500">{n}</span>'
                f'<span style="display: flex; flex-direction: column; gap: 3px; padding-top: 6px"><span style="font-size: 16px; font-weight: 500">{title}</span>'
                f'<span style="font-size: 14px; line-height: 1.4; color: {MUTED}">{sub}</span></span></li>')
    steps = [step(1, 'Open the Anthropic Console', 'Sign in, or create an account.', True),
             step(2, 'Add a little credit', 'Billing → add $5 or more. You pay Anthropic directly.'),
             step(3, 'Create a key and copy it', 'API keys → Create key. Name it “Agent V”.')]
    head = setup_header('NConnect.dc.html', 1, 'Get an Anthropic key', 'About two minutes.')
    body = f'''
  <ol style="margin: 12px 12px 0; padding: 4px 20px; list-style: none; {BLOCK}">
{chr(10).join(steps)}
  </ol>''' + bottom(secondary('NKey.dc.html', 'I have it'),
                    primary('NGetKey.dc.html', 'Open the Console', trailing='up_right'))
    return page('Get a key', head + body)


# ---------------------------------------------------------------- Paste and test key

@screen
def NKey():
    head = setup_header('NConnect.dc.html', 1, 'Paste your key', 'I test it with a real call before we go on.')
    body = f'''
  <div style="padding: 16px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <label for="key" style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; flex-direction: column; gap: 8px">
      <span style="{LABEL}">Anthropic API key</span>
      <input id="key" type="password" value="sk-ant-api03-xxxxxxxxxxxxxxxx9Qx2" style="height: 32px; padding: 0; border: 0; outline: 0; background: transparent; font-family: 'Geist Mono', ui-monospace, monospace; font-size: 16px; letter-spacing: 0.08em; color: {INK}">
    </label>
    <div role="status" style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; align-items: center; gap: 14px">
      {mark('check', bg=GREEN_FILL, fg=ON_GREEN, size=40)}
      <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">Your key works</span><span style="font-size: 13px; color: {MUTED}">12 models available, 9 can run jobs</span></span>
    </div>
    <p style="margin: 6px 12px 0; display: flex; gap: 8px; font-size: 13px; line-height: 1.45; color: {MUTED}">{icon('lock', 15)}<span>Stored encrypted and used only on our servers. I never show it again.</span></p>
  </div>''' + bottom(primary('NModels.dc.html', 'Continue'))
    return page('Paste your key', head + body)


# ---------------------------------------------------------------- Brave Search key (D105, D161)

@screen
def NSearchKey():
    def step(n, title, sub, first=False):
        rule = '' if first else f'border-top: 1px solid {LINE}; '
        return (f'      <li style="{rule}display: flex; gap: 14px; padding: 14px 0">'
                f'<span style="width: 30px; height: 30px; flex-shrink: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 500">{n}</span>'
                f'<span style="display: flex; flex-direction: column; gap: 2px; padding-top: 4px"><span style="font-size: 15px; font-weight: 500">{title}</span>'
                f'<span style="font-size: 13px; line-height: 1.4; color: {MUTED}">{sub}</span></span></li>')
    steps = [step(1, 'Open the Brave Search API', 'Sign in, or create an account.', True),
             step(2, 'Choose the free plan', 'About 1,000 searches a month, billed to you by Brave if you go over.'),
             step(3, 'Create a key and copy it', 'API keys → Add. Name it “Agent V”.')]
    head = settings_header('NAI.dc.html', 'Brave Search key', sub='For searching the web when your AI provider can’t. Anthropic, OpenAI and Google search for themselves.')
    body = f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <ol style="margin: 0; padding: 4px 18px; list-style: none; {BLOCK}">
{chr(10).join(steps)}
    </ol>
    <label for="brave" style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; flex-direction: column; gap: 8px">
      <span style="{LABEL}">Brave Search API key</span>
      <input id="brave" type="password" placeholder="Paste your key" style="height: 32px; padding: 0; border: 0; outline: 0; background: transparent; font-family: 'Geist Mono', ui-monospace, monospace; font-size: 16px; letter-spacing: 0.08em; color: {INK}">
    </label>
    <p style="margin: 6px 12px 0; display: flex; gap: 8px; font-size: 13px; line-height: 1.45; color: {MUTED}">{icon('lock', 15)}<span>I test it with a real search, then keep it encrypted. I never show it again.</span></p>
  </div>''' + bottom(secondary('NSearchKey.dc.html', 'Open Brave'), primary('NAI.dc.html', 'Test and save', trailing=None))
    return page('Brave Search key', head + body)


# ---------------------------------------------------------------- Choose models

@screen
def NModels():
    jobs = [
        radio_card('j0', mark('sparkle', size=40), 'Claude Sonnet 5', 'Recommended · capable and fast', 'jobs'),
        radio_card('j1', mark('sparkle', size=40), 'Claude Opus 5.5', 'Most capable · costs more', 'jobs'),
    ]
    quick = [radio_card('q0', mark('sparkle', size=40), 'Claude Haiku 4.5', 'Recommended · fastest and cheapest', 'quick')]
    head = setup_header('NKey.dc.html', 2, 'Choose models', 'You can change these any time in Your AI.')
    body = f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <fieldset style="margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px">
      <legend style="margin: 0 0 8px 12px; padding: 0; font-size: 13px; font-weight: 500; color: {MUTED}">For jobs</legend>
{chr(10).join(jobs)}
    </fieldset>
    <fieldset style="margin: 8px 0 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px">
      <legend style="margin: 0 0 8px 12px; padding: 0; font-size: 13px; font-weight: 500; color: {MUTED}">For quick steps</legend>
{chr(10).join(quick)}
    </fieldset>
    <div style="margin-top: 8px; padding: 14px 18px; border-radius: 24px; background: {SURFACE}; display: flex; align-items: center; gap: 12px">
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 15px; font-weight: 500">Monthly limit</span><span style="font-size: 13px; color: {MUTED}">Jobs pause and ask when it’s reached</span></span>
      <span style="height: 40px; padding: 0 16px; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; font-size: 16px; font-weight: 500">$20</span>
    </div>
  </div>''' + bottom(primary('NLinkAccounts.dc.html', 'Continue'))
    return page('Choose models', head + body, script=radio_script({'jobs': (0, ['j0', 'j1']), 'quick': (0, ['q0'])}))


# ---------------------------------------------------------------- Connect accounts

@screen
def NLinkAccounts():
    accts = {'outlook': [True, 'ajay@outlook.com', 'Mail and drafts', 'Outlook mail'],
             'ocal': [False, 'ajay@outlook.com', 'Free time and events', 'Outlook Calendar'],
             'gcal': [True, 'ajay@gmail.com', 'Free time and events', 'Google Calendar']}
    rows = [account_row('outlook', 'O', 'Outlook mail', *accts['outlook'][1:3], first=True),
            account_row('ocal', 'O', 'Outlook Calendar', *accts['ocal'][1:3]),
            account_row('gcal', 'G', 'Google Calendar', *accts['gcal'][1:3])]
    head = setup_header('NModels.dc.html', 3, 'Connect your accounts', 'Optional. I read and prepare; anything sent as you needs your signature.')
    body = body_wrap(group(rows)) + bottom(secondary('NNotifyAsk.dc.html', 'Skip'), primary('NNotifyAsk.dc.html', 'Continue')) + undo_bar(100)
    return page('Connect accounts', head + body, script=logic(accounts_vals(accts)))


# ---------------------------------------------------------------- Notifications permission

@screen
def NNotifyAsk():
    head = setup_header('NLinkAccounts.dc.html', 4, 'Let me reach you', 'Some work waits for your signature. A notification means it never waits long.')
    demo = f'''
  <div role="img" aria-label="Example notification: Agent V needs your signature to reply to Sam" style="margin: 28px 20px 0; padding: 14px 16px; border-radius: 22px; background: {SURFACE}; box-shadow: 0 12px 30px rgba(12,12,14,0.10); display: flex; gap: 12px">
    <span style="width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px; background: {DARK}; color: {ON_DARK}; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m7 8 5 9 5-9"/></svg></span>
    <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px"><span style="display: flex; justify-content: space-between; font-size: 13px; color: {MUTED}"><span style="font-weight: 600; color: {INK}">Agent V</span>now</span><span style="font-size: 15px; font-weight: 500">Needs your signature</span><span style="font-size: 14px; color: {MUTED}">Reply to Sam about Friday</span></span>
  </div>
  <p style="margin: 20px 28px 0; font-size: 14px; line-height: 1.45; color: {MUTED}">Replies can be signed right from the notification. Anything that can’t be undone always opens the app.</p>'''
    return page('Notifications', head + demo + bottom(secondary('NReady.dc.html', 'Not now'),
                                                        primary('NReady.dc.html', 'Allow notifications', trailing=None)))


# ---------------------------------------------------------------- Ready

@screen
def NReady():
    body = f'''  <div style="padding: 58px 24px 0">
    <span style="width: 56px; height: 56px; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center">{icon('check', 26, 2.2)}</span>
    <h1 style="margin: 28px 0 0; font-size: 40px; line-height: 1.05; font-weight: 500; letter-spacing: -0.035em">You’re set, Ajay.</h1>
    <p style="margin: 12px 0 0; font-size: 16px; line-height: 1.45; color: {MUTED_DARK}">Here’s a first job, based on what you connected. Or hand me anything else.</p>
  </div>
  <a href="NToday.dc.html" style="position: absolute; left: 16px; right: 16px; top: 380px; padding: 22px; border-radius: 28px; background: {BLUE}; color: {ON_BLUE}; display: flex; flex-direction: column; gap: 14px">
    <span style="display: flex; align-items: center; justify-content: space-between">
      <span style="width: 40px; height: 40px; border-radius: 999px; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center">{icon('sun', 20)}</span>
      <span style="font-size: 13px; color: {ON_BLUE_MUTED}">Every weekday</span>
    </span>
    <span style="font-size: 24px; line-height: 1.2; font-weight: 500; letter-spacing: -0.02em">Brief me on my inbox and calendar at 7:30</span>
    <span style="font-size: 14px; color: {ON_BLUE_MUTED}">Reads only. Nothing is sent.</span>
  </a>
  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; gap: 8px">
    <a href="NToday.dc.html" style="height: 56px; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600">Start this job</a>
    <a href="NAsk.dc.html" style="height: 48px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 500; color: {MUTED_DARK}">Hand me something else</a>
  </div>'''
    return page('Ready', body, ground=DARK, bg_image=GLOW_TOP, color=ON_DARK)


# ---------------------------------------------------------------- Job menu (sheet over the job page)

def menu_item(ic, text, on=None, href=None, color=INK, first=False):
    rule = '' if first else f'border-top: 1px solid {LINE}; '
    style = (f'width: 100%; min-height: 54px; padding: 0; border: 0; {rule}background: transparent; display: flex; '
             f'align-items: center; gap: 14px; font-family: inherit; font-size: 16px; font-weight: 500; color: {color}')
    if href:
        return f'      <a href="{href}" style="{style}">{icon(ic, 20)}{text}</a>'
    return f'      <button type="button" onClick="{{{{{on}}}}}" style="{style}">{icon(ic, 20)}{text}</button>'


def panel(name, title, body, actions):
    """A step inside a menu sheet: a confirmation or a small form, in place of the menu's items."""
    return f'''    <sc-if value="{{{{p_{name}}}}}" hint-placeholder-val="{{{{ false }}}}">
      <div style="padding: 6px 0 4px; display: flex; flex-direction: column; gap: 10px">
        <h2 style="margin: 0; font-size: 20px; font-weight: 500; letter-spacing: -0.015em">{title}</h2>
{body}
        <div style="margin-top: 6px; display: flex; gap: 8px">{actions}</div>
      </div>
    </sc-if>'''


def sheet_button(text, on=None, href=None, bg=SURFACE_2, fg=INK, grow=True):
    style = (f'{"flex-grow: 1; " if grow else ""}height: 52px; padding: 0 20px; border: 0; border-radius: 999px; background: {bg}; '
             f'color: {fg}; display: flex; align-items: center; justify-content: center; font-family: inherit; font-size: 16px; font-weight: 600')
    if href:
        return f'<a href="{href}" style="{style}">{text}</a>'
    return f'<button type="button" onClick="{{{{{on}}}}}" style="{style}">{text}</button>'


def choice(text, on):
    return (f'        <button type="button" onClick="{{{{{on}}}}}" style="min-height: 52px; padding: 0 16px; border: 0; border-radius: 16px; '
            f'background: {SURFACE_2}; text-align: left; font-family: inherit; font-size: 15px; font-weight: 500; color: {INK}">{text}</button>')


def text_field(label, key):
    return (f'        <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: {MUTED}">{label}'
            f'<input type="text" value="{{{{{key}}}}}" onChange="{{{{set_{key}}}}}" style="height: 48px; padding: 0 14px; border: 1px solid {LINE}; '
            f'border-radius: 14px; outline: 0; background: {SURFACE}; font-family: inherit; font-size: 16px; color: {INK}"></label>')


def menu_sheet(title_hole, behind, items, panels, close_href, script):
    body = f'''  <div aria-hidden="true" style="position: absolute; inset: 0; background: {DARK}; background-image: {GLOW_TOP}"></div>
  <div aria-hidden="true" style="position: absolute; left: 24px; right: 24px; top: 150px; font-size: 28px; font-weight: 500; letter-spacing: -0.025em; color: {ON_DARK}; opacity: 0.4">{behind}</div>
  <div aria-hidden="true" style="position: absolute; inset: 0; background: {SCRIM}"></div>
  <section role="dialog" aria-label="Options" style="position: absolute; left: 8px; right: 8px; bottom: 8px; padding: 10px 22px 12px; border-radius: 32px; background: {SURFACE}; display: flex; flex-direction: column">
    <span aria-hidden="true" style="align-self: center; width: 40px; height: 5px; border-radius: 3px; background: {LINE_STRONG}; margin-bottom: 10px"></span>
    <span style="font-size: 13px; font-weight: 500; color: {MUTED}; padding: 4px 0 6px">{title_hole}</span>
    <sc-if value="{{{{menu}}}}" hint-placeholder-val="{{{{ true }}}}">
{chr(10).join(items)}
      <a href="{close_href}" style="margin-top: 8px; height: 52px; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600">Close</a>
    </sc-if>
{chr(10).join(panels)}
  </section>{undo_bar(16)}'''
    return body, script


MENU_FORM_VALS = """
    // Text fields in a menu's forms; Save applies them and closes the form.
    const field = (k, def) => {
      out[k] = st[k] ?? def;
      out['set_' + k] = (e) => this.setState({ [k]: e.target.value });
    };
    const done = (msg, extra, undo) => () => {
      this.setState({ panel: null, ...(extra || {}) });
      this.flash(msg, undo);
    };"""


@screen
def NJobMenu():
    items = [
        '      <sc-if value="{{notPaused}}" hint-placeholder-val="{{ true }}">',
        menu_item('clock', 'Pause', on='pause', first=True),
        '      </sc-if>',
        '      <sc-if value="{{paused}}" hint-placeholder-val="{{ false }}">',
        menu_item('play', 'Resume', on='resume', first=True),
        '      </sc-if>',
        menu_item('x', 'Stop', on='open_stop'),
        menu_item('repeat', 'Repeat…', on='open_repeat'),
        menu_item('edit', 'Rename', on='open_rename'),
        menu_item('flag', 'Add to a goal', on='open_goal'),
        menu_item('share', 'Share the result', on='note_share'),
        '      <sc-if value="{{notArchived}}" hint-placeholder-val="{{ true }}">',
        menu_item('archive', 'Archive', on='archive'),
        '      </sc-if>',
        '      <sc-if value="{{archived}}" hint-placeholder-val="{{ false }}">',
        menu_item('archive', 'Restore', on='restore'),
        '      </sc-if>',
        menu_item('trash', 'Delete', on='open_delete', color=RED_TEXT),
    ]
    cancel = sheet_button('Cancel', on='closePanel')
    panels = [
        panel('stop', 'Stop this job?', f'        <p style="margin: 0; font-size: 15px; line-height: 1.45; color: {MUTED}">What it did so far stays filed under Done.</p>',
              cancel + sheet_button('Stop', href='NJobsDone.dc.html', bg=INK, fg=ON_INK)),
        panel('repeat', 'How often?', '\n'.join([choice('Every day at 9:00', 'rep_day'), choice('Every weekday at 9:00', 'rep_weekday'),
                                                  choice('Every Monday at 9:00', 'rep_week'), choice('Every month on the 1st', 'rep_month')]), cancel),
        panel('rename', 'Rename', text_field('Name', 'name'), cancel + sheet_button('Save', on='saveName', bg=INK, fg=ON_INK)),
        panel('goal', 'Add to a goal', '\n'.join([choice('Save ₹1,50,000 by March', 'goal_save'), choice('Hire a sales lead by November', 'goal_hire')]),
              cancel + sheet_button('New goal', href='NGoals.dc.html', grow=False)),
        panel('delete', 'Delete this job and its files?', f'        <p style="margin: 0; font-size: 15px; line-height: 1.45; color: {MUTED}">This can’t be undone. Its results, files and record go too.</p>',
              cancel + sheet_button('Delete', href='NJobs.dc.html', bg=RED, fg=ON_RED)),
    ]
    vals = MENU_FORM_VALS + """
    panels(['stop', 'repeat', 'rename', 'goal', 'delete']);
    field('name', 'Compare CRM tools');
    out.paused = Boolean(st.paused);
    out.notPaused = !st.paused;
    out.pause = () => { this.setState({ paused: true }); this.flash('Paused. Nothing more happens until you resume it.'); };
    out.resume = () => { this.setState({ paused: false }); this.flash('Resumed from step 3 of 5.'); };
    out.archived = Boolean(st.archived);
    out.notArchived = !st.archived;
    out.archive = () => {
      this.setState({ archived: true });
      this.flash('Archived. Find it in Jobs, Done.', () => this.setState({ archived: false }));
    };
    out.restore = () => { this.setState({ archived: false }); this.flash('Restored to Active.'); };
    const every = { day: 'every day at 9:00', weekday: 'every weekday at 9:00', week: 'every Monday at 9:00', month: 'on the 1st of every month' };
    Object.keys(every).forEach((k) => { out['rep_' + k] = done('It will repeat ' + every[k] + '.'); });
    out.saveName = done('Renamed.');
    out.goal_save = done('Added to “Save ₹1,50,000 by March”.');
    out.goal_hire = done('Added to “Hire a sales lead by November”.');
    note('share', 'Opens your phone’s share sheet: send it, or save it as a PDF.');"""
    body, script = menu_sheet('{{name}}', 'Compare CRM tools', items, panels, 'NJob.dc.html', logic(vals))
    return page('Job options', body, ground=DARK, script=script)


@screen
def NGoalMenu():
    items = [
        menu_item('edit', 'Rename', on='open_rename', first=True),
        menu_item('flag', 'Change the target or date', on='open_target'),
        menu_item('archive', 'Archive', on='archive'),
        menu_item('trash', 'Delete', on='open_delete', color=RED_TEXT),
    ]
    cancel = sheet_button('Cancel', on='closePanel')
    save = lambda on: sheet_button('Save', on=on, bg=INK, fg=ON_INK)
    panels = [
        panel('rename', 'Rename', text_field('Name', 'name'), cancel + save('saveName')),
        panel('target', 'Change the target or date', text_field('Target', 'target') + '\n' + text_field('By', 'date'), cancel + save('saveTarget')),
        panel('delete', 'Delete this goal?', f'        <p style="margin: 0; font-size: 15px; line-height: 1.45; color: {MUTED}">Its jobs stay; they’re just no longer grouped under it.</p>',
              cancel + sheet_button('Delete', href='NGoals.dc.html', bg=RED, fg=ON_RED)),
    ]
    vals = MENU_FORM_VALS + """
    panels(['rename', 'target', 'delete']);
    field('name', 'Save ₹1,50,000 by March');
    field('target', '₹1,50,000');
    field('date', '31 March');
    out.saveName = done('Renamed.');
    out.saveTarget = done('Target updated. Progress is worked out again from your jobs.');
    out.archive = () => this.flash('Archived. Find it in Goals, at the bottom.');"""
    body, script = menu_sheet('{{name}}', 'Save ₹1,50,000 by March', items, panels, 'NGoal.dc.html', logic(vals))
    return page('Goal options', body, ground=DARK, script=script)


# ---------------------------------------------------------------- Spend

@screen
def NSpend():
    head = dark_header(f'''{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill('<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 999px; background: ' + BLUE_SOFT + '"></span>Spends money · 1 of 1'), spacer())}
    <p style="margin: 26px 0 0; font-size: 15px; color: {MUTED_DARK}">Nimbus CRM Starter · 7 seats</p>
    <span style="margin-top: 6px; font-size: 56px; line-height: 1; font-weight: 500; letter-spacing: -0.04em">$105</span>
    <span style="margin-top: 8px; font-size: 14px; color: {MUTED_DARK}">a month · first charge today · cancel any time</span>''', bottom_pad=26)
    rows = [srow(None, mark('file'), 'Pays with Visa ···4242', 'Saved with your login on nimbuscrm.example', trail='', first=True),
            srow(None, mark('flag'), 'Your pick from Compare CRM tools', 'Best fit of the 4 for 7 seats', trail='')]
    body = body_wrap(group(rows)) + f'''
  <sc-if value="{{{{notSigned}}}}" hint-placeholder-val="{{{{ true }}}}">
    <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
      {hold_button('Hold, then confirm with Face ID', BLUE, 'face')}
      <div style="display: flex; justify-content: center"><a href="NToday.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500">Don’t buy</a></div>
    </div>
  </sc-if>
  <sc-if value="{{{{signed}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div role="status" style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; gap: 14px">
      <div style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; align-items: center; gap: 14px">{mark('check', bg=BLUE, fg=ON_BLUE, size=40)}<span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">Bought · receipt filed</span><span style="font-size: 13px; color: {MUTED}">I’ll set up the 7 seats next</span></span></div>
      <div style="display: flex">{primary('NToday.dc.html', 'Back to today', trailing=None)}</div>
    </div>
  </sc-if>'''
    return page('Spend', head + body, script=HOLD_SCRIPT)


# ---------------------------------------------------------------- Lock-screen notifications

@screen
def NLock():
    def note(title, text, when, actions=None):
        acts = ''
        if actions:
            acts = ('<span style="display: flex; gap: 6px; margin-top: 8px">' + ''.join(
                f'<span style="height: 32px; padding: 0 14px; border-radius: 999px; background: rgba(255,255,255,0.16); display: flex; align-items: center; font-size: 13px; font-weight: 500">{a}</span>'
                for a in actions) + '</span>')
        return f'''    <div style="padding: 14px 16px; border-radius: 22px; background: rgba(40,40,46,0.72); display: flex; gap: 12px">
      <span style="width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m7 8 5 9 5-9"/></svg></span>
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px"><span style="display: flex; justify-content: space-between; font-size: 13px; color: {MUTED_DARK}"><span style="font-weight: 600; color: {ON_DARK}">{title}</span>{when}</span><span style="font-size: 14px; line-height: 1.35">{text}</span>{acts}</span>
    </div>'''
    body = f'''  <div aria-hidden="true" style="position: absolute; inset: 0; background: radial-gradient(90% 60% at 30% 20%, #26306B 0%, #0C0C0E 70%)"></div>
  <p style="position: relative; margin: 110px 0 0; text-align: center; font-size: 18px; font-weight: 500; color: rgba(245,245,244,0.8)">Thursday 25 September</p>
  <p style="position: relative; margin: 0; text-align: center; font-size: 88px; line-height: 1; font-weight: 500; letter-spacing: -0.04em">09:24</p>
  <div style="position: absolute; left: 10px; right: 10px; bottom: 60px; display: flex; flex-direction: column; gap: 8px">
{note('Needs your signature', 'Reply to Sam about Friday: “Friday at 3 works for me…”', 'now', ['Sign and send', 'Open'])}
{note('A question', 'How many seats should I price for?', '2m', ['10', '7', 'Other…'])}
{note('Can’t be undone', 'Unsubscribe from 9 newsletters. Open Agent V to decide.', '5m')}
{note('Filed', 'This week’s investor emails: 2 need a reply', '06:58')}
  </div>'''
    return page('Notifications', body, ground=DARK, color=ON_DARK)


# ---------------------------------------------------------------- Share into Agent V

@screen
def NShare():
    body = f'''  <div style="padding: 58px 24px 0; display: flex; align-items: center; justify-content: space-between">
    <a href="NToday.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500; color: {MUTED_DARK}">Cancel</a>
    <span style="font-size: 15px; font-weight: 500">Agent V</span>
    <span style="width: 52px"></span>
  </div>
  <div style="margin: 20px 16px 0; padding: 14px; border-radius: 22px; background: {DARK_2}; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 12px">
    <span aria-hidden="true" style="width: 64px; height: 64px; flex-shrink: 0; border-radius: 14px; background: linear-gradient(135deg, #3A3A42, #1D1D22)"></span>
    <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px"><span style="font-size: 15px; font-weight: 500">MacBook Air 13″ M5, 16 GB</span><span style="font-size: 13px; color: {MUTED_DARK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">store.example.in/macbook-air</span></span>
  </div>
  <label for="what" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">What should I do with this?</label>
  <textarea id="what" rows="3" style="display: block; box-sizing: border-box; width: calc(100% - 48px); margin: 20px 24px 0; padding: 0; border: 0; outline: 0; resize: none; background: transparent; font-family: inherit; font-size: 22px; line-height: 1.35; font-weight: 500; letter-spacing: -0.015em; color: {ON_DARK}">Tell me when this drops below ₹90,000</textarea>
  <div style="margin: 18px 24px 0; display: flex; flex-wrap: wrap; gap: 8px">
    {pill('Watch the price')}{pill('Compare with others')}{pill('Summarize reviews')}
  </div>
  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex">
    <a href="NToday.dc.html" style="flex-grow: 1; height: 56px; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 600">Hand it off{icon('arrow', 18, 2)}</a>
  </div>'''
    return page('Share into Agent V', body, ground=DARK, bg_image=GLOW_TOP, color=ON_DARK)


# ---------------------------------------------------------------- Delete my account (J10)

@screen
def NDeleteAccount():
    lost = [('grid', '24 jobs and their results'), ('file', '12 files on my computer'), ('memory', '46 things I remember'),
            ('key', '4 saved logins and your AI key'), ('link', '2 connected accounts')]
    rows = []
    for i, (ic, text) in enumerate(lost):
        rule = '' if i == 0 else f'border-top: 1px solid {LINE}; '
        rows.append(f'      <li style="{rule}display: flex; align-items: center; gap: 12px; height: 54px">{mark(ic)}<span style="font-size: 15px; font-weight: 500">{text}</span></li>')
    body = dark_header(f'''{top_row(round_link('NPrivacy.dc.html', 'x', 'Close'), pill(dot(RED_ON_DARK) + 'Can’t be undone'), spacer())}
    <h1 style="{H1}; margin-top: 26px">Delete your account</h1>
    <p style="{SUB_DARK}; margin-top: 8px">Running jobs stop. Your key and saved logins are erased at once; everything else within 30 days.</p>''') + f'''
  <ul aria-label="What will be deleted" style="margin: 12px 12px 0; padding: 4px 20px; list-style: none; {BLOCK}">
{chr(10).join(rows)}
  </ul>
  <a href="NPrivacy.dc.html" style="margin: 14px 28px 0; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500">{icon('download', 16)}Want a copy first? Export everything</a>

  <sc-if value="{{{{notSigned}}}}" hint-placeholder-val="{{{{ true }}}}">
    <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
      {hold_button('Hold, then confirm with Face ID', RED, 'face')}
      <div style="display: flex; justify-content: center">
        <a href="NPrivacy.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500">Keep my account</a>
      </div>
    </div>
  </sc-if>
  <sc-if value="{{{{signed}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div role="status" style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; gap: 14px">
      <div style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; align-items: center; gap: 14px">
        {mark('check', bg=INK, fg=ON_INK, size=40)}
        <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">Your account is being deleted</span><span style="font-size: 13px; color: {MUTED}">Signed out everywhere. The rest is erased within 30 days</span></span>
      </div>
      <div style="display: flex">{primary('NWelcome.dc.html', 'Done', trailing=None)}</div>
    </div>
  </sc-if>'''
    return page('Delete your account', body, script=HOLD_SCRIPT)


if __name__ == '__main__':
    write_all()
