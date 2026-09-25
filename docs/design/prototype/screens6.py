"""Batch 6 (stage 4, part 2): layouts that part 2 needs and stage 2 didn't draw.
Part of the build: python3 screens7.py writes every screen."""
from build import (ON_INK, SCRIM, LINE_STRONG, logic, hideable, act, undo_bar, radio_script, DARK, GLASS, INK, LINE, MUTED, MUTED_DARK, ON_DARK, SURFACE, SURFACE_2, ask_bar, dark_header, dot,
                   icon, page, pill, round_link, screen, spacer, stat, top_row, write_all)
from screens import BLOCK, H1, LABEL, SUB_DARK, initial, mark, primary, secondary
import screens5  # noqa: F401  (registers earlier batches)
from screens2 import block, chevron, jobs_header, row
from screens3 import body_wrap, group, settings_header, srow, switch, toggle_script
from screens4 import radio_card, radio_script
from screens5 import HIDDEN, small_button


# ---------------------------------------------------------------- A watch: its own job page

PRICES = [99900, 99900, 99900, 98500, 98500, 98500, 97900, 97900, 96900, 96900, 96900, 96900, 94900, 94900, 94900, 94900]
ALERT = 90000


def price_chart(w=330, h=128):
    lo, hi = 88000, 101000
    top, bottom = 22, h - 6

    def y(v):
        return round(bottom - (v - lo) / (hi - lo) * (bottom - top), 1)

    step = (w - 12) / (len(PRICES) - 1)
    xs = [round(i * step, 1) for i in range(len(PRICES))]
    d = f'M{xs[0]} {y(PRICES[0])}'
    for i in range(1, len(PRICES)):
        d += f' H{xs[i]} V{y(PRICES[i])}'  # step after: a price holds until it changes
    ya, ye = y(ALERT), y(PRICES[-1])
    return f'''<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Price over the last 30 days: from ₹99,900 on 1 September down to ₹94,900 today. Your alert is under ₹90,000." style="display: block; overflow: visible">
        <line x1="0" y1="{ya}" x2="{w}" y2="{ya}" stroke="{MUTED}" stroke-width="1" stroke-dasharray="3 4"/>
        <text x="0" y="{ya - 7}" font-size="12" fill="{MUTED}">Alert under ₹90,000</text>
        <text x="0" y="{y(PRICES[0]) - 9}" font-size="12" fill="{MUTED}">₹99,900</text>
        <path d="{d}" fill="none" stroke="{INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="{xs[-1]}" cy="{ye}" r="5" fill="{INK}" stroke="{SURFACE}" stroke-width="2"/>
        <text x="{xs[-1] + 5}" y="{ye + 20}" text-anchor="end" font-size="12" font-weight="500" fill="{INK}">₹94,900</text>
      </svg>'''


@screen
def NWatch():
    checks = [
        row(None, mark('check'), 'No change', 'Today, 10:00', first=True),
        row(None, mark('check'), 'No change', 'Today, 09:00'),
        row(None, mark('eye'), 'Dropped ₹2,000 to ₹94,900', 'Yesterday, 16:00'),
    ]
    body = dark_header(f'''{top_row(round_link('NJobs.dc.html', 'back', 'Back'), pill(dot(ON_DARK, live=True) + 'Watching · hourly'), round_link('NJobMenu.dc.html', 'more', 'Pause, change how often, or stop'))}
    <h1 style="{H1}; margin-top: 22px">MacBook Air 13” price</h1>
    <div style="margin-top: 22px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">
      {stat('₹94,900', 'now, at store.example.in')}
      {stat('₹4,900', 'above your alert', left_rule=True)}
    </div>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <section aria-labelledby="trend" style="padding: 14px 18px 12px; {BLOCK}; display: flex; flex-direction: column; gap: 10px">
      <h2 id="trend" style="{LABEL}">Last 30 days</h2>
      {price_chart()}
      <div aria-hidden="true" style="display: flex; justify-content: space-between; font-size: 12px; color: {MUTED}"><span>1 Sep</span><span>Today</span></div>
    </section>
{block('Recent checks · next at 11:00', checks)}
  </div>
{ask_bar('Ask about this, or change it…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('A watch', body)


# ---------------------------------------------------------------- Jobs: Done (finished, couldn't finish, archived; D41)

@screen
def NJobsDone():
    week = [
        row('NResult.dc.html', mark('mail'), 'This week’s investor emails', 'Filed today, 06:58', trail=chevron(), first=True),
        row('NSpending.dc.html', mark('sheet'), 'Where your money went', 'Filed 22 Sep · spending summary', trail=chevron()),
        row('NReplay.dc.html', mark('calendar'), 'Introduce Maya to the design team', 'Done 12 Sep · replay', trail=chevron()),
    ]
    couldnt = [row('NCouldnt.dc.html', mark('alert'), 'Book a table at Olive for Friday', 'Yesterday · their booking page was down',
                   trail=chevron(), first=True)]
    archived = [hideable(row(None, mark('archive'), 'Q2 board pack', 'Archived 3 Aug', trail=act('Restore', 'hide_q2'), first=True), 'q2')]
    body = jobs_header('Done') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{block('This month', week)}
{block('Couldn’t finish', couldnt)}
{block('Archived · 14', archived)}
    <a href="NSearch.dc.html" style="align-self: center; height: 44px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: {MUTED}">{icon('search', 16)}Search older jobs</a>
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}{undo_bar()}'''
    return page('Jobs, done', body, script=logic("    hide('q2', 'Restored “Q2 board pack” to Active.');"))


# ---------------------------------------------------------------- Appearance

def preview(top, ground, split=False):
    if split:
        return (f'<span aria-hidden="true" style="width: 44px; height: 56px; flex-shrink: 0; border-radius: 12px; overflow: hidden; '
                f'border: 1px solid {LINE}; display: flex"><span style="flex-grow: 1; display: flex; flex-direction: column">'
                f'<span style="height: 20px; background: #0C0C0E"></span><span style="flex-grow: 1; background: #EFEFEC"></span></span>'
                f'<span style="flex-grow: 1; background: #0C0C0E"></span></span>')
    return (f'<span aria-hidden="true" style="width: 44px; height: 56px; flex-shrink: 0; border-radius: 12px; overflow: hidden; '
            f'border: 1px solid {LINE}; display: flex; flex-direction: column"><span style="height: 20px; background: {top}"></span>'
            f'<span style="flex-grow: 1; padding: 5px; box-sizing: border-box; background: {ground}; display: flex; flex-direction: column; gap: 4px">'
            f'<span style="height: 8px; border-radius: 3px; background: {"#FFFFFF" if ground != "#0C0C0E" else "#2A2A30"}"></span>'
            f'<span style="height: 8px; border-radius: 3px; background: {"#FFFFFF" if ground != "#0C0C0E" else "#2A2A30"}"></span></span></span>')


@screen
def NAppearance():
    body = settings_header('NYou.dc.html', 'Appearance') + f'''
  <fieldset style="margin: 12px 12px 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px">
    <legend style="{HIDDEN}">Appearance</legend>
{radio_card('o0', preview(None, None, split=True), 'Automatic', 'Matches your phone’s setting', 'look')}
{radio_card('o1', preview('#0C0C0E', '#EFEFEC'), 'Light', 'Dark tops, warm white below', 'look')}
{radio_card('o2', preview('#17171A', '#0C0C0E'), 'Dark', 'Dark throughout, easier at night', 'look')}
  </fieldset>
  <p style="margin: 16px 28px 0; display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.4; color: {MUTED}">{icon('sun', 15)}Text size and bold text follow your phone’s settings.</p>'''
    return page('Appearance', body, script=radio_script({'sel': (0, ['o0', 'o1', 'o2'])}))


# ---------------------------------------------------------------- Help and feedback

GUIDES = {
    'sign': ('pen', 'How signing works', 'What I do alone and what waits for you', 'NRules.dc.html', 'What needs your signature', [
        'I read, search and draft on my own. Anything that acts as you, such as sending an email or accepting a meeting, waits for your signature: press and hold.',
        'Spending money always asks, then Face ID. So does anything that can’t be undone.',
        'You choose what else asks first, and you can undo anything I’ve learned to do alone.']),
    'keys': ('key', 'Keys and what they cost', 'Getting, replacing and limiting a key', 'NAI.dc.html', 'Your AI', [
        'I run on your own AI account, with your key. Your provider bills you directly for what your jobs use.',
        'Set a monthly limit. When it’s reached, jobs pause and ask you before anything more is spent.',
        'Replace or remove your key at any time.']),
    'control': ('hand', 'Taking control of the browser', 'Sign-ins, codes and saved logins', 'NLogins.dc.html', 'Saved logins', [
        'Some sites need a person: to sign in, type a code or prove you’re human. The job pauses and asks you to take control.',
        'While you’re in control I’m not watching or recording, so your passwords and codes stay yours.',
        'Tap “Done, carry on” to hand back. Sites you stay signed in to are listed in Saved logins.']),
}


def guide_sheet(key):
    ic, title, _, href, where, paras = GUIDES[key]
    text = ''.join(f'<p style="margin: 0; font-size: 16px; line-height: 1.5">{t}</p>' for t in paras)
    return f'''  <sc-if value="{{{{p_{key}}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div aria-hidden="true" onClick="{{{{closePanel}}}}" style="position: absolute; inset: 0; background: {SCRIM}"></div>
    <section role="dialog" aria-label="{title}" style="position: absolute; left: 8px; right: 8px; bottom: 8px; padding: 10px 22px 14px; border-radius: 32px; background: {SURFACE}; display: flex; flex-direction: column; gap: 14px">
      <span aria-hidden="true" style="align-self: center; width: 40px; height: 5px; border-radius: 3px; background: {LINE_STRONG}"></span>
      <div style="display: flex; align-items: center; gap: 12px">{mark(ic)}<h2 style="margin: 0; font-size: 20px; font-weight: 500; letter-spacing: -0.015em">{title}</h2></div>
      {text}
      <a href="{href}" style="min-height: 52px; padding: 0 14px 0 16px; border-radius: 18px; background: {SURFACE_2}; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 15px; font-weight: 500">Open {where}{chevron()}</a>
      <button type="button" onClick="{{{{closePanel}}}}" style="height: 52px; border: 0; border-radius: 999px; background: {INK}; font-family: inherit; font-size: 16px; font-weight: 600; color: {ON_INK}">Close</button>
    </section>
  </sc-if>'''


@screen
def NHelp():
    def guide_row(key, first=False):
        ic, title, sub = GUIDES[key][:3]
        rule = '' if first else f'border-top: 1px solid {LINE}; '
        return (f'      <button type="button" onClick="{{{{open_{key}}}}}" style="width: 100%; padding: 8px 0; border: 0; {rule}background: transparent; display: flex; align-items: center; gap: 12px; min-height: 56px; '
                f'text-align: left; font-family: inherit; color: {INK}">{mark(ic)}<span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px">'
                f'<span style="font-size: 15px; font-weight: 500">{title}</span><span style="font-size: 13px; color: {MUTED}">{sub}</span></span>{chevron()}</button>')
    guides = [guide_row('sign', first=True), guide_row('keys'), guide_row('control')]
    contact = [
        srow('NReport.dc.html', mark('alert'), 'Report a problem', 'Pick the job; I add the details for you', first=True),
        srow('NReport.dc.html', mark('mail'), 'Send feedback', 'Ideas and what you’d change'),
    ]
    link = (f'style="height: 44px; padding: 0; border: 0; background: transparent; font-family: inherit; font-size: 13px; '
            f'color: {MUTED}; text-decoration: underline"')
    body = settings_header('NYou.dc.html', 'Help and feedback') + body_wrap(
        group(guides, 'Guides'), group(contact, 'Tell us')) + f'''
  <p style="margin: 8px 28px 0; display: flex; align-items: center; gap: 6px; font-size: 13px; color: {MUTED}">Agent V 1.0 (100) · <button type="button" onClick="{{{{note_terms}}}}" {link}>Terms</button> · <button type="button" onClick="{{{{note_privacy}}}}" {link}>Privacy Policy</button></p>
{guide_sheet('sign')}
{guide_sheet('keys')}
{guide_sheet('control')}{undo_bar(28)}'''
    return page('Help and feedback', body, script=logic("""    panels(['sign', 'keys', 'control']);
    note('terms', 'Opens the Terms in your browser.');
    note('privacy', 'Opens the Privacy Policy in your browser.');"""))


# ---------------------------------------------------------------- Tell us: report a problem or send feedback

@screen
def NReport():
    kinds = f'''  <fieldset style="margin: 12px 12px 0; padding: 0; border: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
    <legend style="{HIDDEN}">What is it?</legend>
    <label style="height: 52px; border-radius: 999px; background: {SURFACE}; border: {{{{k0.border}}}}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 500; cursor: pointer"><input type="radio" name="kind" checked="{{{{k0.on}}}}" onChange="{{{{k0.pick}}}}" style="margin: 0; accent-color: {INK}">A problem</label>
    <label style="height: 52px; border-radius: 999px; background: {SURFACE}; border: {{{{k1.border}}}}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 500; cursor: pointer"><input type="radio" name="kind" checked="{{{{k1.on}}}}" onChange="{{{{k1.pick}}}}" style="margin: 0; accent-color: {INK}">Feedback</label>
  </fieldset>'''
    form = f'''  <sc-if value="{{{{notSent}}}}" hint-placeholder-val="{{{{ true }}}}">
  <div style="padding: 8px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <sc-if value="{{{{problem}}}}" hint-placeholder-val="{{{{ true }}}}">
    <label style="padding: 14px 18px; {BLOCK}; display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; color: {MUTED}">Which job?
      <select onChange="{{{{pickJob}}}}" style="height: 44px; padding: 0 10px; border: 1px solid {LINE}; border-radius: 12px; background: {SURFACE}; font-family: inherit; font-size: 16px; color: {INK}">
        <option>Book a table at Olive for Friday</option><option>Compare CRM tools</option><option>Not about a job</option>
      </select>
    </label>
    </sc-if>
    <label style="padding: 14px 18px; {BLOCK}; display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; color: {MUTED}">{{{{askLabel}}}}
      <textarea rows="4" value="{{{{text}}}}" onChange="{{{{typed}}}}" placeholder="{{{{hint}}}}" style="padding: 10px 12px; border: 1px solid {LINE}; border-radius: 12px; outline: 0; resize: none; background: {SURFACE}; font-family: inherit; font-size: 16px; line-height: 1.45; color: {INK}"></textarea>
    </label>
    <sc-if value="{{{{problem}}}}" hint-placeholder-val="{{{{ true }}}}">
    <label style="padding: 12px 18px; {BLOCK}; display: flex; align-items: center; gap: 12px">
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 15px; font-weight: 500">Add the job’s details</span><span style="font-size: 13px; color: {MUTED}">Its reference and the app version. Never your emails or files.</span></span>
      {switch('details', 'Add the job’s details')}
    </label>
    </sc-if>
  </div>
  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex">
    <button type="button" onClick="{{{{send}}}}" disabled="{{{{empty}}}}" style="flex-grow: 1; height: 56px; border: 0; border-radius: 999px; background: {{{{sendBg}}}}; color: {{{{sendFg}}}}; font-family: inherit; font-size: 16px; font-weight: 600">Send</button>
  </div>
  </sc-if>
  <sc-if value="{{{{sent}}}}" hint-placeholder-val="{{{{ false }}}}">
  <div role="status" style="margin: 12px 12px 0; padding: 20px; {BLOCK}; display: flex; align-items: center; gap: 14px">
    {mark('check', bg=INK, fg=ON_INK, size=40)}
    <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">Thanks. It’s sent.</span><span style="font-size: 13px; color: {MUTED}">We reply to ajay@gmail.com, usually within 2 days.</span></span>
  </div>
  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex">{primary('NHelp.dc.html', 'Back to help', trailing=None)}</div>
  </sc-if>'''
    body = settings_header('NHelp.dc.html', 'Tell us') + kinds + form
    vals = """    const problem = (st.kind ?? 0) === 0;
    out.problem = problem;
    out.askLabel = problem ? 'What happened?' : 'What would you change?';
    out.hint = problem ? 'For example: it said the page was down, but it works for me.' : 'Anything: ideas, what’s confusing, what you’d love.';
    out.text = st.text || '';
    out.typed = (e) => this.setState({ text: e.target.value });
    out.pickJob = (e) => this.setState({ job: e.target.value });
    out.empty = !(st.text || '').trim();
    out.sendBg = out.empty ? 'var(--disabled)' : 'var(--action)';
    out.sendFg = out.empty ? 'var(--ink-muted)' : 'var(--on-action)';
    out.sent = Boolean(st.sent);
    out.notSent = !st.sent;
    out.send = () => this.setState({ sent: true });
    const d = st.details ?? true;
    out.details = { on: d, track: d ? 'var(--ink)' : 'var(--line-strong)', ring: d ? 'none' : 'inset 0 0 0 1.5px var(--control-off)', knobBg: d ? 'var(--on-ink)' : '#FFFFFF', knob: d ? '23px' : '3px', flip: () => this.setState({ details: !d }) };"""
    return page('Tell us', body, script=radio_script({'kind': (0, ['k0', 'k1'])}, vals))


# ---------------------------------------------------------------- Speaking, with the microphone off

@screen
def NVoiceOff():
    body = f'''  <div style="padding: 58px 24px 0">
{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill(icon('mic_off', 15) + 'Microphone off'), spacer())}
  </div>
  <h1 style="{H1}; margin: 40px 24px 0; font-size: 30px">I can’t hear you yet</h1>
  <p style="{SUB_DARK}; margin: 10px 24px 0">Microphone access is off for Agent V. Turn it on in Settings, or type instead.</p>

  <div aria-hidden="true" style="position: absolute; left: 50%; top: 470px; width: 132px; height: 132px; margin-left: -66px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: {GLASS}; color: {MUTED_DARK}; display: flex; align-items: center; justify-content: center">{icon('mic_off', 40, 1.5)}</div>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
    <button type="button" onClick="{{{{note_settings}}}}" style="height: 56px; border: 0; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; font-size: 16px; font-weight: 600">Open Settings{icon('up_right', 18, 2)}</button>
    <a href="NAsk.dc.html" style="align-self: center; height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500; color: {ON_DARK}">Type instead</a>
  </div>'''
    return page('Speaking, microphone off', body + undo_bar(120), ground=DARK, color=ON_DARK,
                script=logic("    note('settings', 'Opens Agent V in your phone’s Settings, where you turn on the microphone.');"))


if __name__ == '__main__':
    write_all()
