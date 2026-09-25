"""Batch 1: every day (D34). Part of the build: python3 screens7.py writes every screen."""
from build import *  # noqa: F401,F403
from build import (BLUE_TEXT, ACTION, ON_ACTION, LINE_STRONG, ON_BLUE, ON_INK, logic, radio_script, hideable, act, undo_bar, HOLD_METHODS, HOLD_VALS, BLUE, BLUE_SOFT, DARK, DARK_2, DARK_3, DIM_DARK, GLASS, HOLD_SCRIPT, INK, LIGHT, LINE, MUTED,
                   MUTED_DARK, ON_DARK, RED, RED_ON_DARK, SURFACE, SURFACE_2, ask_bar, dark_header, dot, hold_button,
                   icon, page, pill, round_button, round_link, screen, spacer, stat, top_row, write_all)

H1 = 'margin: 0; font-size: 28px; line-height: 1.15; font-weight: 500; letter-spacing: -0.025em; text-wrap: pretty'
SUB_DARK = f'margin: 0; font-size: 15px; line-height: 1.45; color: {MUTED_DARK}; text-wrap: pretty'
BLOCK = f'border-radius: 28px; background: {SURFACE}'
LABEL = f'margin: 0; font-size: 13px; font-weight: 500; color: {MUTED}'


def mark(name, bg=SURFACE_2, fg=INK, size=36, label=None):
    return (f'<span style="width: {size}px; height: {size}px; flex-shrink: 0; border-radius: 999px; background: {bg}; color: {fg}; '
            f'display: flex; align-items: center; justify-content: center">{icon(name, 18, label=label)}</span>')


def initial(letter, bg=SURFACE_2, fg=INK, size=36, fs=15):
    return (f'<span aria-hidden="true" style="width: {size}px; height: {size}px; flex-shrink: 0; border-radius: 999px; background: {bg}; color: {fg}; '
            f'display: flex; align-items: center; justify-content: center; font-size: {fs}px; font-weight: 500">{letter}</span>')


def primary(href, text, trailing='arrow', bg=ACTION, fg=ON_ACTION):
    ic = icon(trailing, 18, 2) if trailing else ''
    return (f'<a href="{href}" style="flex-grow: 1; height: 56px; border-radius: 999px; background: {bg}; color: {fg}; display: flex; '
            f'align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 600">{text}{ic}</a>')


def secondary(href, text):
    return (f'<a href="{href}" style="height: 56px; padding: 0 22px; border-radius: 999px; border: 1px solid {LINE_STRONG}; box-sizing: border-box; '
            f'display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 500">{text}</a>')


# ---------------------------------------------------------------- Before I start

@screen
def NPlan():
    steps = [
        ('1', 'Check your calendar for next week', 'On my own', False),
        ('2', 'Pick three free mornings', 'I remember Maya prefers mornings', False),
        ('3', 'Send Maya the invite', 'Needs your signature first', True),
        ('4', 'Tell you when she accepts', 'Or find new times if she can’t', False),
    ]
    rows = []
    for i, (n, title, sub, needs) in enumerate(steps):
        rule = '' if i == 0 else f'border-top: 1px solid {LINE}; '
        num = (mark('pen', bg=BLUE, fg=ON_BLUE, size=34, label='Needs your signature') if needs else
               f'<span aria-label="Step {n}" style="width: 34px; height: 34px; flex-shrink: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500">{n}</span>')
        sub_color = BLUE_TEXT if needs else MUTED
        rows.append(f'''      <li style="{rule}display: flex; align-items: center; gap: 14px; padding: 15px 0">
        {num}
        <span style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-size: 16px; font-weight: 500">{title}</span>
          <span style="font-size: 13px; color: {sub_color}">{sub}</span>
        </span>
      </li>''')
    body = dark_header(f'''{top_row(round_link('NAsk.dc.html', 'back', 'Back'), '<span style="font-size: 15px; font-weight: 500">Before I start</span>', spacer())}
    <h1 style="{H1}; margin-top: 26px">Schedule a call with Maya</h1>
    <p style="{SUB_DARK}; margin-top: 8px">It sends an invite in your name, so here’s the plan first.</p>
    <div style="margin-top: 18px; display: flex; gap: 8px">
      {pill(icon('list', 15) + '4 steps')}
      {pill(icon('pen', 15) + '1 needs you', bg='rgba(51,85,255,0.22)', fg='#C9D3FF')}
    </div>''') + f'''
  <ol aria-label="The plan" style="margin: 12px 12px 0; padding: 4px 20px; list-style: none; {BLOCK}">
{chr(10).join(rows)}
  </ol>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; gap: 8px">
    {secondary('NAsk.dc.html', 'Change')}
    {primary('NToday.dc.html', 'Start')}
  </div>'''
    return page('Before I start', body)


# ---------------------------------------------------------------- Job page

@screen
def NJob():
    plan = [
        ('done', 'Find tools for a 10-person sales team'),
        ('done', 'Read each pricing page'),
        ('now', 'Read reviews of the 4 tools'),
        ('4', 'Write the comparison and my pick'),
        ('you', 'You choose; a trial only if you sign'),
    ]
    rows = []
    for i, (state, text) in enumerate(plan):
        rule = '' if i == 0 else f'border-top: 1px solid {LINE}; '
        color = INK
        weight = 400
        if state == 'done':
            mk = f'<span style="width: 24px; display: flex; justify-content: center; color: {MUTED}">{icon("check", 18, 2, label="Done")}</span>'
            color = MUTED
        elif state == 'now':
            mk = f'<span aria-label="In progress" style="width: 24px; display: flex; justify-content: center"><span class="live" style="width: 10px; height: 10px; border-radius: 999px; background: {INK}"></span></span>'
            weight = 500
        elif state == 'you':
            mk = f'<span style="width: 24px; display: flex; justify-content: center; color: {BLUE_TEXT}">{icon("pen", 18, label="Will need your signature")}</span>'
        else:
            mk = f'<span aria-label="Not started" style="width: 24px; text-align: center; font-size: 13px; color: {MUTED}">{state}</span>'
        rows.append(f'''      <li style="{rule}display: flex; align-items: center; gap: 12px; height: 42px; font-size: 15px; font-weight: {weight}; color: {color}">{mk}<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{text}</span></li>''')
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'back', 'Back'), pill(dot(ON_DARK, live=True) + 'Working'), round_link('NJobMenu.dc.html', 'more', 'Pause, stop, repeat or share'))}
    <h1 style="{H1}; margin-top: 22px">Compare CRM tools</h1>
    <div style="margin-top: 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">
      {stat('3/5', 'steps done')}
      {stat('4', 'fit the budget', left_rule=True)}
      {stat('$0.09', 'AI cost so far', left_rule=True)}
    </div>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <section aria-labelledby="now" style="padding: 18px 18px 20px; {BLOCK}; display: flex; flex-direction: column; gap: 12px">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <h2 id="now" style="{LABEL}">Now</h2>
        <a href="NBrowser.dc.html" style="height: 40px; padding: 0 15px 0 12px; border-radius: 999px; background: {DARK}; color: {ON_DARK}; display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 500">{icon('eye', 17)}Watch live</a>
      </div>
      <p style="margin: 0; font-size: 20px; line-height: 1.25; font-weight: 500; letter-spacing: -0.015em">Reading reviews of the 4 tools</p>
      <span role="img" aria-label="Step 3 of 5" style="display: flex; gap: 4px"><span style="flex-grow: 1; height: 4px; border-radius: 2px; background: {INK}"></span><span style="flex-grow: 1; height: 4px; border-radius: 2px; background: {INK}"></span><span class="live" style="flex-grow: 1; height: 4px; border-radius: 2px; background: {INK}"></span><span style="flex-grow: 1; height: 4px; border-radius: 2px; background: {LINE}"></span><span style="flex-grow: 1; height: 4px; border-radius: 2px; background: {LINE}"></span></span>
      <div aria-label="Queued follow-ups" style="margin-top: 2px; padding: 6px 6px 6px 12px; border-radius: 16px; background: {SURFACE_2}; display: {{{{show_queued}}}}; align-items: center; gap: 10px">
        <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column"><span style="font-size: 12px; color: {MUTED}">Queued · I’ll take it after this step</span><span style="font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">“Include HubSpot too”</span></span>
        <button type="button" aria-label="Remove from the queue" onClick="{{{{hide_queued}}}}" style="width: 44px; height: 44px; margin: -4px 0; flex-shrink: 0; border: 0; border-radius: 999px; background: transparent; color: {MUTED}; display: flex; align-items: center; justify-content: center">{icon('x', 16)}</button>
      </div>
    </section>
    <section aria-labelledby="plan" style="padding: 14px 18px 6px; {BLOCK}">
      <h2 id="plan" style="{LABEL}; margin-bottom: 4px">The plan</h2>
      <ol style="margin: 0; padding: 0; list-style: none">
{chr(10).join(rows)}
      </ol>
    </section>
  </div>
{ask_bar('Ask about this, or change it…', 'NAsk.dc.html', 'NVoice.dc.html')}{undo_bar()}'''
    return page('Job', body, script=logic("    hide('queued', 'Removed “Include HubSpot too” from the queue');"))


# ---------------------------------------------------------------- A question

QUESTION_SCRIPT = radio_script({'sel': (0, ['o0', 'o1', 'o2'])}, color=BLUE_TEXT)


@screen
def NQuestion():
    def option(key, big, text):
        big_html = (f'<span style="width: 44px; font-size: 28px; line-height: 1; font-weight: 500; letter-spacing: -0.03em">{big}</span>'
                    if big else f'<span style="width: 44px; display: flex; color: {MUTED}">{icon("edit", 22)}</span>')
        return f'''    <label style="height: 76px; padding: 0 20px; box-sizing: border-box; border-radius: 24px; background: {SURFACE}; border: {{{{{key}.border}}}}; display: flex; align-items: center; gap: 14px; cursor: pointer">
      {big_html}
      <span style="flex-grow: 1; font-size: 16px; font-weight: 500">{text}</span>
      <input type="radio" name="seats" checked="{{{{{key}.on}}}}" onChange="{{{{{key}.pick}}}}" style="width: 22px; height: 22px; margin: 0; accent-color: {BLUE_TEXT}">
    </label>'''
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill(dot(BLUE_SOFT) + 'Needs you · 2 of 3'), spacer())}
    <a href="NJob.dc.html" style="margin-top: 24px; align-self: flex-start; display: flex; align-items: center; gap: 8px; font-size: 13px; color: {MUTED_DARK}">{icon('globe', 15)}Compare CRM tools for the team</a>
    <h1 style="{H1}; margin-top: 10px">How many seats should I price for?</h1>
    <p style="{SUB_DARK}; margin-top: 8px">Your team page lists 10 people, but 3 are contractors. Prices are per seat, so it changes the ranking.</p>''') + f'''
  <fieldset style="margin: 12px 12px 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px">
    <legend style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Seats to price</legend>
{option('o0', '10', 'Everyone on the team')}
{option('o1', '7', 'Employees only')}
{option('o2', None, 'Something else…')}
  </fieldset>
  <p style="margin: 14px 28px 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: {MUTED}">{icon('clock', 15)}I’ll keep reading reviews while you decide.</p>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; gap: 8px">
    <a href="NVoice.dc.html" aria-label="Answer by voice" style="width: 56px; height: 56px; flex-shrink: 0; border-radius: 999px; border: 1px solid {LINE_STRONG}; box-sizing: border-box; display: flex; align-items: center; justify-content: center">{icon('mic', 20)}</a>
    {primary('NUndo.dc.html', 'Answer')}
  </div>'''
    return page('A question', body, script=QUESTION_SCRIPT)


# ---------------------------------------------------------------- For your signature

@screen
def NSign():
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill(dot(BLUE_SOFT) + 'Needs you · 1 of 3'), spacer())}
    <div style="margin-top: 26px; display: flex; align-items: center; gap: 14px">
      {initial('SR', bg=DARK_3, fg=ON_DARK, size=52, fs=17)}
      <span style="display: flex; flex-direction: column; gap: 3px">
        <span style="font-size: 24px; line-height: 1.15; font-weight: 500; letter-spacing: -0.02em">Reply to Sam Rivera</span>
        <span style="font-size: 14px; color: {MUTED_DARK}">Re: Friday review</span>
      </span>
    </div>
    <div style="margin-top: 20px; display: flex; flex-wrap: wrap; gap: 8px">
      {pill(icon('mail', 15) + 'From ajay@gmail.com')}
      {pill(icon('clock', 15) + 'Waits until 08:40 tomorrow')}
    </div>''') + f'''
  <article aria-label="The email" style="margin: 12px 12px 0; padding: 22px 22px 16px; {BLOCK}; display: flex; flex-direction: column; gap: 14px">
    <sc-if value="{{{{notEditing}}}}" hint-placeholder-val="{{{{ true }}}}">
      <p style="margin: 0; font-size: 18px; line-height: 1.55; white-space: pre-line">{{{{text}}}}</p>
      <button type="button" onClick="{{{{edit}}}}" style="align-self: flex-start; height: 40px; margin-left: -4px; padding: 0 14px 0 10px; border: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; gap: 7px; font-family: inherit; font-size: 14px; font-weight: 500; color: {INK}">{icon('edit', 16)}Edit</button>
    </sc-if>
    <sc-if value="{{{{editing}}}}" hint-placeholder-val="{{{{ false }}}}">
      <label for="draft" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">The email</label>
      <textarea id="draft" rows="6" value="{{{{text}}}}" onChange="{{{{typed}}}}" style="margin: -8px; padding: 8px; border: 1px solid {LINE}; border-radius: 14px; outline: 0; resize: none; background: {SURFACE}; font-family: inherit; font-size: 18px; line-height: 1.55; color: {INK}"></textarea>
      <button type="button" onClick="{{{{doneEditing}}}}" style="align-self: flex-start; height: 40px; margin-left: -4px; padding: 0 16px; border: 0; border-radius: 999px; background: {INK}; font-family: inherit; font-size: 14px; font-weight: 500; color: {ON_INK}">Done</button>
    </sc-if>
  </article>

  <sc-if value="{{{{notSigned}}}}" hint-placeholder-val="{{{{ true }}}}">
    <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
      {hold_button('Hold to sign and send', BLUE, 'pen')}
      <div style="display: flex; justify-content: space-between; padding: 0 8px">
        <a href="NQuestion.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500">Later</a>
        <a href="NToday.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500; color: {MUTED}">Don’t send</a>
      </div>
    </div>
  </sc-if>
  <sc-if value="{{{{signed}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div role="status" style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; gap: 14px">
      <div style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; align-items: center; gap: 14px">
        {mark('check', bg=BLUE, fg=ON_BLUE, size=40)}
        <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">Signed and sent</span><span style="font-size: 13px; color: {MUTED}">09:26 · filed with the job</span></span>
      </div>
      <div style="display: flex">{primary('NQuestion.dc.html', 'Next: 2 of 3')}</div>
    </div>
  </sc-if>'''
    return page('For your signature', body, script=logic(HOLD_VALS + SIGN_EDIT_VALS, HOLD_METHODS))


SIGN_EDIT_VALS = """
    // Editing: the text becomes editable, and what you edited is what is signed (stage 4, For your signature).
    out.text = st.text ?? 'Hi Sam,\\n\\nFriday at 3 works for me. I’ll bring the Q3 numbers.\\n\\nAjay';
    out.editing = Boolean(st.editing) && !st.signed;
    out.notEditing = !out.editing;
    out.edit = () => this.setState({ editing: true });
    out.doneEditing = () => this.setState({ editing: false });
    out.typed = (e) => this.setState({ text: e.target.value });"""


# ---------------------------------------------------------------- Can't be undone

@screen
def NUndo():
    senders = [('W', 'Weekly Growth Digest', 'Weekly'), ('M', 'The Morning Deal', 'Daily'), ('D', 'Design Notes', 'Weekly')]
    rows = []
    for i, (l, name, freq) in enumerate(senders):
        rule = '' if i == 0 else f'border-top: 1px solid {LINE}; '
        rows.append(f'''      <li style="{rule}display: flex; align-items: center; gap: 12px; height: 58px">{initial(l)}<span style="flex-grow: 1; font-size: 15px; font-weight: 500">{name}</span><span style="font-size: 13px; color: {MUTED}">{freq}</span></li>''')
    more = [('T', 'Tech Weekly Roundup', 'Weekly'), ('S', 'Startup Jobs Daily', 'Daily'), ('F', 'Fitness Friday', 'Weekly'),
            ('R', 'Recipe of the Day', 'Daily'), ('B', 'Book Club Picks', 'Monthly'), ('C', 'City Events', 'Weekly')]
    rows.append('      <sc-if value="{{all}}" hint-placeholder-val="{{ false }}">')
    for l, name, freq in more:
        rows.append(f'''      <li style="border-top: 1px solid {LINE}; display: flex; align-items: center; gap: 12px; height: 58px">{initial(l)}<span style="flex-grow: 1; font-size: 15px; font-weight: 500">{name}</span><span style="font-size: 13px; color: {MUTED}">{freq}</span></li>''')
    rows.append('      </sc-if>')
    rows.append(f'''      <sc-if value="{{{{notAll}}}}" hint-placeholder-val="{{{{ true }}}}"><li style="border-top: 1px solid {LINE}; display: flex; align-items: center; justify-content: space-between; height: 54px"><span style="font-size: 15px; color: {MUTED}">and 6 more</span><button type="button" onClick="{{{{showAll}}}}" style="height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: {SURFACE_2}; font-family: inherit; font-size: 14px; font-weight: 500; color: {INK}">See all 9</button></li></sc-if>''')
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill(dot(RED_ON_DARK) + 'Can’t be undone · 3 of 3'), spacer())}
    <h1 style="{H1}; margin-top: 26px">Unsubscribe from 9 newsletters</h1>
    <p style="{SUB_DARK}; margin-top: 8px">You haven’t opened any of them in 90 days. Some senders make it hard to sign up again.</p>''') + f'''
  <ul aria-label="Senders" style="margin: 12px 12px 0; padding: 4px 20px; max-height: 440px; overflow-y: auto; list-style: none; {BLOCK}">
{chr(10).join(rows)}
  </ul>

  <sc-if value="{{{{notSigned}}}}" hint-placeholder-val="{{{{ true }}}}">
    <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
      {hold_button('Hold, then confirm with Face ID', RED, 'face')}
      <div style="display: flex; justify-content: center">
        <a href="NToday.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500">Not now</a>
      </div>
    </div>
  </sc-if>
  <sc-if value="{{{{signed}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div role="status" style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; gap: 14px">
      <div style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; align-items: center; gap: 14px">
        {mark('check', bg=INK, fg=ON_INK, size=40)}
        <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">Unsubscribing from 9 senders</span><span style="font-size: 13px; color: {MUTED}">I’ll tell you if any of them refuse</span></span>
      </div>
      <div style="display: flex">{primary('NToday.dc.html', 'Back to today', trailing=None)}</div>
    </div>
  </sc-if>'''
    return page('Can’t be undone', body, script=logic(HOLD_VALS + """
    out.all = Boolean(st.all);
    out.notAll = !st.all;
    out.showAll = () => this.setState({ all: true });""", HOLD_METHODS))


# ---------------------------------------------------------------- Live browser

@screen
def NBrowser():
    def review(stars, w1, w2):
        s = ''.join(f'<span style="width: 9px; height: 9px; border-radius: 2px; background: {"#111113" if k < stars else "#DADAD5"}"></span>' for k in range(5))
        return f'''          <div style="padding: 12px; border-radius: 14px; background: #F4F4F1; display: flex; flex-direction: column; gap: 8px">
            <div style="display: flex; gap: 3px">{s}</div>
            <span style="width: {w1}%; height: 7px; border-radius: 4px; background: #CFCFC9"></span>
            <span style="width: {w2}%; height: 7px; border-radius: 4px; background: #DEDED9"></span>
          </div>'''
    body = f'''  <div style="padding: 58px 24px 0; color: {ON_DARK}">
{top_row(round_link('NJob.dc.html', 'back', 'Back to the job'), pill(dot(BLUE_SOFT, live=True) + 'Live'), spacer())}
  </div>
  <div style="margin: 18px 16px 0; display: flex; flex-direction: column; gap: 10px">
    <span style="align-self: center; height: 30px; padding: 0 12px; border-radius: 999px; background: {GLASS}; display: flex; align-items: center; gap: 6px; font-size: 13px; color: {MUTED_DARK}">{icon('lock', 13)}reviews.example.com</span>
    <div role="img" aria-label="Live view of the page the agent is reading" style="position: relative; height: 430px; padding: 18px; box-sizing: border-box; border-radius: 28px; background: #FFFFFF; overflow: hidden; display: flex; flex-direction: column; gap: 12px">
      <span style="width: 55%; height: 14px; border-radius: 7px; background: #111113"></span>
      <div style="display: flex; gap: 6px"><span style="width: 70px; height: 26px; border-radius: 999px; background: #111113"></span><span style="width: 60px; height: 26px; border-radius: 999px; background: #EDEDE9"></span><span style="width: 80px; height: 26px; border-radius: 999px; background: #EDEDE9"></span></div>
{review(5, 88, 64)}
{review(4, 76, 58)}
{review(4, 92, 40)}
{review(3, 70, 52)}
      <span style="position: absolute; left: 196px; top: 132px; width: 56px; height: 56px; border-radius: 999px; background: rgba(51,85,255,0.16); border: 2px solid {BLUE}; box-sizing: border-box"></span>
      <span style="position: absolute; left: 230px; top: 166px; color: {BLUE}">{icon('cursor', 22, 1.5)}</span>
    </div>
    <p style="margin: 8px 8px 0; font-size: 20px; line-height: 1.25; font-weight: 500; letter-spacing: -0.015em; color: {ON_DARK}">Reading reviews of the 4 tools</p>
    <p style="margin: 0 8px; font-size: 14px; color: {MUTED_DARK}">Step 3 of 5 · Compare CRM tools</p>
  </div>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; align-items: center; gap: 10px">
    <p style="margin: 0; font-size: 13px; color: {MUTED_DARK}">Log in or fix something yourself. I’ll wait, then carry on.</p>
    <a href="NControl.dc.html" style="align-self: stretch; height: 56px; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 600">{icon('hand', 19)}Take control</a>
  </div>'''
    return page('Live browser', body, ground=DARK, color=ON_DARK)


# ---------------------------------------------------------------- A filed result

@screen
def NResult():
    def reply(key, letter, text, action):
        return f'''      <li style="display: flex; flex-direction: column; gap: 12px; padding: 16px 0">
        <span style="display: flex; align-items: flex-start; gap: 12px">{initial(letter)}<span style="padding-top: 7px; font-size: 16px; line-height: 1.35; font-weight: 500">{text}</span></span>
        <sc-if value="{{{{not_{key}}}}}" hint-placeholder-val="{{{{ true }}}}"><button type="button" onClick="{{{{start_{key}}}}}" style="align-self: flex-start; margin-left: 48px; height: 36px; padding: 0 14px 0 11px; border: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; gap: 7px; font-family: inherit; font-size: 14px; font-weight: 500; color: {INK}">{icon('pen', 15)}{action}</button></sc-if>
        <sc-if value="{{{{{key}}}}}" hint-placeholder-val="{{{{ false }}}}"><a href="NJob.dc.html" style="align-self: flex-start; margin-left: 48px; height: 36px; padding: 0 14px 0 11px; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 500; color: {MUTED}"><span class="live" style="width: 7px; height: 7px; border-radius: 999px; background: {INK}"></span>Drafting · you’ll sign it first</a></sc-if>
      </li>'''
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'back', 'Back'), '<span style="font-size: 15px; font-weight: 500">Filed · 06:58</span>', round_button('share', 'Share or save as PDF', on='note_share'))}
    <h1 style="{H1}; margin-top: 24px">This week’s investor emails</h1>
    <div style="margin-top: 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">
      {stat('6', 'threads')}
      {stat('2', 'need a reply', left_rule=True)}
      {stat('4', 'for later', left_rule=True)}
    </div>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <section aria-labelledby="reply" style="padding: 14px 18px 2px; {BLOCK}">
      <h2 id="reply" style="{LABEL}">Need a reply before Monday</h2>
      <ul style="margin: 0; padding: 0; list-style: none">
{reply('priya', 'P', 'Priya wants the updated deck by Monday', 'Draft a reply')}
      </ul>
      <ul style="margin: 0; padding: 0; list-style: none; border-top: 1px solid {LINE}">
{reply('daniel', 'D', 'Daniel asks to move the board call to Thursday', 'Find a time and draft')}
      </ul>
    </section>
    <section aria-labelledby="later" style="padding: 16px 18px; {BLOCK}; display: flex; align-items: center; gap: 12px">
      {mark('clock')}
      <div style="display: flex; flex-direction: column; gap: 2px">
        <h2 id="later" style="margin: 0; font-size: 15px; font-weight: 500">4 for later</h2>
        <span style="font-size: 13px; line-height: 1.4; color: {MUTED}">2 portfolio newsletters, a quarterly report and an event invite</span>
      </div>
    </section>
  </div>
{ask_bar('Ask about this, or follow up…', 'NAsk.dc.html', 'NVoice.dc.html')}{undo_bar()}'''
    return page('A filed result', body, script=logic("""    note('share', 'Opens your phone’s share sheet: send it, or save it as a PDF.');
    ['priya', 'daniel'].forEach((k) => {
      out[k] = Boolean(st[k]);
      out['not_' + k] = !st[k];
      out['start_' + k] = () => {
        this.setState({ [k]: true });
        this.flash('Started a job to draft it. It will wait for your signature.');
      };
    });"""))


if __name__ == '__main__':
    write_all()
