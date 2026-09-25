"""Batch 5 (stage 4): shared states and the moments from stage 3 that had no screen.
Part of the build: python3 screens7.py writes every screen."""
from build import (ON_BLUE_MUTED, BLUE_DEEP, ON_INK, ON_BLUE, ON_GREEN, GREEN, PIC_INK, DISABLED, SKELETON, ACTION, ON_ACTION, logic, hideable, act, undo_bar, BLUE, BLUE_SOFT, DARK, DARK_2, DARK_3, DIM_DARK, GLASS, GLOW_TOP, INK, LINE, MUTED, MUTED_DARK,
                   ON_DARK, SURFACE, SURFACE_2, ask_bar, dark_header, dot, icon, page, pill, round_link, screen,
                   spacer, stat, top_row, write_all)
from screens import BLOCK, H1, LABEL, SUB_DARK, initial, mark, primary, secondary
import screens4  # noqa: F401  (registers earlier batches)
from screens2 import bar, block, chevron, jobs_header, row, search_screen
from screens3 import switch, toggle_script
from screens4 import radio_card, radio_script

HIDDEN = 'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap'
SENTENCE = 'margin: 0; font-size: 28px; line-height: 1.2; font-weight: 500; letter-spacing: -0.025em'


def white(href, text):
    return f'<a href="{href}" style="color: {ON_DARK}; white-space: nowrap">{text}</a>'


def today_header(chip_text, chip_dot, date_line, greeting, sentence, live=False):
    """The Today masthead: the V, a status chip, search, jobs and you; then the day in one sentence."""
    cls = ' class="live"' if live else ''
    return f'''  <header style="position: relative; padding: 58px 24px 24px; border-radius: 0 0 32px 32px; background-color: {DARK}; background-image: {GLOW_TOP}; color: {ON_DARK}; display: flex; flex-direction: column">
    <div style="display: flex; align-items: center; gap: 10px">
      <a href="NToday.dc.html" aria-label="Agent V, today" style="width: 40px; height: 40px; border-radius: 13px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center">{icon('vmark', 22, 2.4)}</a>
      <span style="height: 28px; padding: 0 11px; border-radius: 999px; background: {GLASS}; display: flex; align-items: center; gap: 7px; white-space: nowrap; font-size: 13px; color: {ON_DARK}"><span{cls} aria-hidden="true" style="width: 6px; height: 6px; border-radius: 999px; background: {chip_dot}"></span>{chip_text}</span>
      <span style="flex-grow: 1"></span>
      {round_link('NSearch.dc.html', 'search', 'Search')}
      {round_link('NJobs.dc.html', 'grid', 'Jobs')}
      <a href="NYou.dc.html" aria-label="You and settings" style="width: 44px; height: 44px; border-radius: 999px; background: {DARK_3}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 500">A</a>
    </div>
    <span style="margin-top: 20px; font-size: 14px; color: {MUTED_DARK}">{date_line}</span>
    <h1 style="margin: 10px 0 0; font-size: 28px; line-height: 1.2; font-weight: 500; letter-spacing: -0.025em; color: {ON_DARK}">{greeting}</h1>
    {sentence}
  </header>'''


TILES = f'''    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
      <a href="NJob.dc.html" style="height: 150px; padding: 16px 18px; box-sizing: border-box; border-radius: 28px; background: {SURFACE}; display: flex; flex-direction: column; justify-content: space-between">
        <span style="display: flex; align-items: center; justify-content: space-between">
          {mark('globe')}
          <span style="font-size: 13px; color: {MUTED}">Working</span>
        </span>
        <span style="font-size: 17px; line-height: 1.25; font-weight: 500; letter-spacing: -0.01em">Compare CRM tools</span>
        <span style="display: flex; flex-direction: column; gap: 8px">
          <span style="font-size: 13px; color: {MUTED}">Step 3 of 5</span>
          <span role="img" aria-label="Step 3 of 5" style="display: flex; gap: 4px">{''.join(f'<span style="flex-grow: 1; height: 4px; border-radius: 2px; background: {INK if k < 3 else LINE}"></span>' for k in range(5))}</span>
        </span>
      </a>
      <a href="NWatch.dc.html" style="height: 150px; padding: 16px 18px; box-sizing: border-box; border-radius: 28px; background: {DARK_2}; color: {ON_DARK}; display: flex; flex-direction: column; justify-content: space-between">
        <span style="display: flex; align-items: center; justify-content: space-between">
          {mark('eye', bg='rgba(255,255,255,0.1)', fg=ON_DARK)}
          <span style="font-size: 13px; color: {MUTED_DARK}">Watching</span>
        </span>
        <span style="font-size: 17px; line-height: 1.25; font-weight: 500; letter-spacing: -0.01em">MacBook Air</span>
        <span style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-size: 24px; line-height: 1.1; font-weight: 500; letter-spacing: -0.02em">₹94,900</span>
          <span style="font-size: 13px; color: {MUTED_DARK}">Alert under ₹90,000</span>
        </span>
      </a>
    </div>'''


def needs_block(title, sub, href, extra, count='1 of 3', lead='pen'):
    """The blue Needs you block on Today (blue = needs you, D27/D35)."""
    return f'''    <section aria-labelledby="needs" style="padding: 20px; border-radius: 28px; background: {BLUE}; color: {ON_BLUE}; display: flex; flex-direction: column">
      <div style="display: flex; align-items: center; gap: 10px">
        <span aria-hidden="true" style="width: 36px; height: 36px; border-radius: 999px; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center">{icon(lead, 18)}</span>
        <h2 id="needs" style="margin: 0; font-size: 14px; font-weight: 500; color: {ON_BLUE_MUTED}">Needs you{' · ' + count if count else ''}</h2>
        <span style="flex-grow: 1"></span>
        <a href="{href}" aria-label="Open: {title}" style="width: 44px; height: 44px; border-radius: 999px; background: #FFFFFF; color: {PIC_INK}; display: flex; align-items: center; justify-content: center">{icon('up_right')}</a>
      </div>
      <p style="margin: 14px 0 0; font-size: 24px; line-height: 1.2; font-weight: 500; letter-spacing: -0.02em">{title}</p>
      <p style="margin: 6px 0 0; font-size: 14px; line-height: 1.4; color: {ON_BLUE_MUTED}">{sub}</p>{extra}
    </section>'''


def line_row(lead, small, title, trail, href=None, pad_right=6):
    """A single rounded row, as the idea row on Today."""
    tag, attr = ('a', f' href="{href}"') if href else ('div', '')
    return f'''    <{tag}{attr} style="height: 56px; padding: 0 {pad_right}px 0 12px; border-radius: 22px; background: {SURFACE}; display: flex; align-items: center; gap: 12px">
      {mark(lead, size=34)}
      <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 12px; color: {MUTED}">{small}</span><span style="font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{title}</span></span>
      {trail}
    </{tag}>'''


def small_button(text, href=None, bg=SURFACE_2, fg=INK):
    style = (f'height: 36px; padding: 0 14px; flex-shrink: 0; border: 0; border-radius: 999px; background: {bg}; color: {fg}; '
             f'display: flex; align-items: center; font-family: inherit; font-size: 14px; font-weight: 500')
    if href:
        return f'<a href="{href}" style="{style}">{text}</a>'
    return f'<button type="button" style="{style}">{text}</button>'


def x_button(label, on):
    return (f'<button type="button" aria-label="{label}" onClick="{{{{{on}}}}}" style="width: 44px; height: 44px; flex-shrink: 0; border: 0; border-radius: 999px; '
            f'background: transparent; color: {MUTED}; display: flex; align-items: center; justify-content: center">{icon("x", 16)}</button>')


# ---------------------------------------------------------------- Today

def needs_chip(href, ic, text):
    return (f'<a href="{href}" style="height: 34px; padding: 0 12px 0 10px; border-radius: 999px; background: {BLUE_DEEP}; '
            f'display: flex; align-items: center; gap: 7px; white-space: nowrap; font-size: 13px; font-weight: 500">{icon(ic, 15)}{text}</a>')


@screen
def NToday():
    sentence = (f'<p style="{SENTENCE}; color: {DIM_DARK}">{white("NSign.dc.html", "3 things")} need you, '
                f'{white("NJobs.dc.html", "2 jobs")} are running and {white("NResult.dc.html", "5 were filed")} overnight.</p>')
    chips = (f'\n      <div style="margin-top: 16px; display: flex; gap: 8px">\n        '
             f'{needs_chip("NQuestion.dc.html", "question", "Seats question")}\n        {needs_chip("NUndo.dc.html", "alert", "9 newsletters")}\n      </div>')
    idea = line_row('memory', 'An idea · 1 of 3', 'Cancel 2 subscriptions you don’t use',
                    f'<span aria-hidden="true" style="color: {MUTED}; display: flex">{icon("chevron", 18)}</span>', href='NIdea.dc.html', pad_right=10)
    body = today_header('On duty', ON_DARK, 'Thursday, 25 September', 'Good morning, Ajay.', sentence) + f'''

  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{needs_block('Reply to Sam about Friday', 'Sends an email as you', 'NSign.dc.html', chips)}
{TILES}
{idea}
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Today', body)


# ---------------------------------------------------------------- Today before a key works (D46)

@screen
def NTodayNoKey():
    sentence = f'<p style="{SENTENCE}; color: {DIM_DARK}">Connect your AI and I’ll start on the {white("NJobs.dc.html", "1 job")} you handed off.</p>'
    waiting = [row(None, mark('clock'), 'Watch the MacBook Air price', 'Starts by itself once your AI works', first=True)]
    meanwhile = [row('NLinkAccounts.dc.html', mark('mail'), 'Connect your email and calendar', 'Optional · for your morning briefing',
                     trail=chevron(), first=True)]
    body = today_header('Not connected', MUTED_DARK, 'Thursday, 25 September', 'Welcome, Ajay.', sentence) + f'''

  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{needs_block('Connect your AI to start', 'About two minutes. You pay your provider directly, on your own key.', 'NConnect.dc.html', '', count=None, lead='key')}
{block('Waiting for your AI', waiting)}
{block('While you’re here', meanwhile)}
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Today, before your AI is connected', body)


# ---------------------------------------------------------------- Today, loading (nothing stored on this phone yet)

@screen
def NTodayLoading():
    def bars(*spec):
        return ''.join(f'<span style="display: block; width: {w}%; height: {h}px; border-radius: {h // 2}px; background: {c}"></span>'
                       for w, h, c in spec)
    sentence = (f'<div class="live" aria-hidden="true" style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px">'
                f'{bars((100, 24, DARK_3), (64, 24, DARK_3))}</div>')
    tile = (f'<div style="height: 150px; padding: 18px; box-sizing: border-box; border-radius: 28px; background: {SURFACE}; '
            f'display: flex; flex-direction: column; justify-content: space-between">'
            f'<span style="width: 36px; height: 36px; border-radius: 999px; background: {SKELETON}"></span>'
            f'<span style="display: flex; flex-direction: column; gap: 8px">{bars((80, 12, SKELETON), (50, 12, SKELETON))}</span></div>')
    body = today_header('Updating', MUTED_DARK, 'Thursday, 25 September', 'Good morning, Ajay.', sentence, live=True) + f'''

  <div role="status" style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <span style="{HIDDEN}">Loading your day</span>
    <div class="live" aria-hidden="true" style="height: 168px; padding: 20px; box-sizing: border-box; border-radius: 28px; background: {SURFACE}; display: flex; flex-direction: column; justify-content: space-between">
      <span style="display: flex; align-items: center; gap: 10px"><span style="width: 36px; height: 36px; border-radius: 999px; background: {SKELETON}"></span><span style="width: 90px; height: 12px; border-radius: 6px; background: {SKELETON}"></span></span>
      <span style="display: flex; flex-direction: column; gap: 10px">{bars((78, 18, SKELETON), (46, 12, SKELETON))}</span>
    </div>
    <div class="live" aria-hidden="true" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">{tile}{tile}</div>
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Today, loading', body)


# ---------------------------------------------------------------- Today, all clear

@screen
def NTodayClear():
    sentence = (f'<p style="{SENTENCE}; color: {DIM_DARK}">Nothing needs you. {white("NJobs.dc.html", "2 jobs")} are running '
                f'and {white("NResult.dc.html", "5 were filed")} overnight.</p>')
    coming = [
        row(None, mark('mail'), 'Morning briefing', 'Tomorrow at 7:30', first=True),
        row('NWatch.dc.html', mark('eye'), 'MacBook Air price', 'Next check at 10:00'),
    ]
    body = today_header('On duty', ON_DARK, 'Thursday, 25 September', 'Good morning, Ajay.', sentence) + f'''

  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <section aria-labelledby="clear" style="padding: 18px 18px 4px; {BLOCK}">
      <div style="display: flex; align-items: center; gap: 12px">
        {mark('check', bg=INK, fg=ON_INK, size=40)}
        <span style="display: flex; flex-direction: column; gap: 2px"><h2 id="clear" style="margin: 0; font-size: 20px; font-weight: 500; letter-spacing: -0.015em">All clear</h2><span style="font-size: 13px; color: {MUTED}">I’ll tell you when something needs you</span></span>
      </div>
      <h3 style="{LABEL}; margin-top: 18px">Coming up</h3>
{chr(10).join(coming)}
    </section>
{TILES}
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Today, all clear', body)


# ---------------------------------------------------------------- Today, offline (D53, D58)

@screen
def NTodayOffline():
    sentence = (f'<p style="{SENTENCE}; color: {DIM_DARK}">{white("NSignOffline.dc.html", "3 things")} need you, '
                f'{white("NJobs.dc.html", "2 jobs")} are running and {white("NResult.dc.html", "5 were filed")} overnight.</p>')
    note = (f'\n      <p style="margin: 14px 0 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: {ON_BLUE_MUTED}">'
            f'{icon("offline", 16)}You can read them now. Signing waits until you’re online.</p>')
    body = today_header('Offline', MUTED_DARK, 'Thursday, 25 September · as of 09:12', 'Good morning, Ajay.', sentence) + f'''

  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{needs_block('Reply to Sam about Friday', 'Sends an email as you', 'NSignOffline.dc.html', note)}
{TILES}
{hideable(line_row('clock', 'Waiting to send · goes when you’re online', 'Book a table for Friday at 8', x_button('Don’t send this', 'hide_wait')), 'wait')}
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}{undo_bar()}'''
    return page('Today, offline', body, script=logic("    hide('wait', 'Won’t send “Book a table for Friday at 8”.');"))


# ---------------------------------------------------------------- For your signature, offline (D53)

@screen
def NSignOffline():
    body = dark_header(f'''{top_row(round_link('NTodayOffline.dc.html', 'x', 'Close'), pill(dot(BLUE_SOFT) + 'Needs you · 1 of 3'), spacer())}
    <div style="margin-top: 26px; display: flex; align-items: center; gap: 14px">
      {initial('SR', bg=DARK_3, fg=ON_DARK, size=52, fs=17)}
      <span style="display: flex; flex-direction: column; gap: 3px">
        <span style="font-size: 24px; line-height: 1.15; font-weight: 500; letter-spacing: -0.02em">Reply to Sam Rivera</span>
        <span style="font-size: 14px; color: {MUTED_DARK}">Re: Friday review</span>
      </span>
    </div>
    <div style="margin-top: 20px; display: flex; flex-wrap: wrap; gap: 8px">
      {pill(icon('offline', 15) + 'Offline')}
      {pill(icon('clock', 15) + 'Waits until 08:40 tomorrow')}
    </div>''') + f'''
  <article aria-label="The email" style="margin: 12px 12px 0; padding: 22px 22px 16px; {BLOCK}; display: flex; flex-direction: column; gap: 14px">
    <p style="margin: 0; font-size: 18px; line-height: 1.55; white-space: pre-line">Hi Sam,

Friday at 3 works for me. I’ll bring the Q3 numbers.

Ajay</p>
    <button type="button" disabled="{{{{ true }}}}" style="align-self: flex-start; height: 40px; margin-left: -4px; padding: 0 14px 0 10px; border: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; gap: 7px; font-family: inherit; font-size: 14px; font-weight: 500; color: {MUTED}">{icon('edit', 16)}Edit</button>
  </article>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
    <button type="button" disabled="{{{{ true }}}}" aria-describedby="why" style="height: 60px; border: 0; border-radius: 999px; background: {DISABLED}; display: flex; align-items: center; justify-content: center; gap: 9px; font-family: inherit; font-size: 16px; font-weight: 600; color: {MUTED}">{icon('offline', 20)}Signing needs a connection</button>
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 8px">
      <span id="why" style="font-size: 13px; line-height: 1.35; color: {MUTED}">So you always sign what’s current. It stays here until you’re back.</span>
      <a href="NTodayOffline.dc.html" style="height: 44px; flex-shrink: 0; display: flex; align-items: center; font-size: 15px; font-weight: 500">Later</a>
    </div>
  </div>'''
    return page('For your signature, offline', body)


# ---------------------------------------------------------------- Jobs, first time (empty)

@screen
def NJobsEmpty():
    tries = [
        row('NAsk.dc.html', mark('mail'), 'Brief me on my inbox', 'Every weekday · reads only', trail=chevron(), first=True),
        row('NAsk.dc.html', mark('eye'), 'Watch the MacBook Air price', 'Tells you when it drops', trail=chevron()),
        row('NAsk.dc.html', mark('globe'), 'Find 3 dentists open on Saturday', 'Research', trail=chevron()),
    ]
    body = jobs_header('Active') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <section style="padding: 22px 20px; {BLOCK}; display: flex; flex-direction: column; gap: 6px">
      {mark('grid', size=44)}
      <h2 style="margin: 12px 0 0; font-size: 22px; line-height: 1.2; font-weight: 500; letter-spacing: -0.02em">No jobs yet</h2>
      <p style="margin: 0; font-size: 15px; line-height: 1.45; color: {MUTED}">What you hand off shows here: what needs you, what’s working and what repeats.</p>
    </section>
{block('Try one', tries)}
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Jobs, first time', body)


# ---------------------------------------------------------------- Search, part of it failed (inline error)

@screen
def NSearchError():
    body, script = search_screen(failed=True)
    return page('Search, partly failed', body, script=script)


# ---------------------------------------------------------------- Needs you: take control (D49)

@screen
def NControlAsk():
    steps = [('1', 'Take control of my browser'), ('2', 'Sign in, and type any code they send'), ('3', 'Tap “Done, carry on”')]
    rows = []
    for i, (n, text) in enumerate(steps):
        rule = '' if i == 0 else f'border-top: 1px solid {LINE}; '
        rows.append(f'''      <li style="{rule}display: flex; align-items: center; gap: 14px; height: 54px"><span style="width: 32px; height: 32px; flex-shrink: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500">{n}</span><span style="font-size: 15px; font-weight: 500">{text}</span></li>''')
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill(dot(BLUE_SOFT) + 'Needs you · 1 of 2'), spacer())}
    <a href="NJob.dc.html" style="margin-top: 24px; align-self: flex-start; display: flex; align-items: center; gap: 8px; font-size: 13px; color: {MUTED_DARK}">{icon('globe', 15)}Order printer ink</a>
    <h1 style="{H1}; margin-top: 10px">Sign in to InkDepot so I can carry on</h1>
    <p style="{SUB_DARK}; margin-top: 8px">The site wants your password. You type it; I don’t see it or keep it.</p>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <ol aria-label="What happens" style="margin: 0; padding: 4px 18px; list-style: none; {BLOCK}">
{chr(10).join(rows)}
    </ol>
    <label style="padding: 14px 18px; {BLOCK}; display: flex; align-items: center; gap: 12px">
      {mark('lock')}
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 15px; font-weight: 500">Stay signed in for next time</span><span style="font-size: 13px; color: {MUTED}">Kept in Saved logins</span></span>
      {switch('stay', 'Stay signed in for next time')}
    </label>
  </div>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
    <div style="display: flex">{primary('NControl.dc.html', icon('hand', 19) + 'Take control', trailing=None)}</div>
    <div style="display: flex; justify-content: space-between; padding: 0 8px">
      <a href="NToday.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500">Later</a>
      <a href="NJob.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500; color: {MUTED}">Skip this site</a>
    </div>
  </div>'''
    return page('Needs you: take control', body, script=toggle_script({'stay': True}))


# ---------------------------------------------------------------- You're in control (D49)

@screen
def NControl():
    def field(label, value, focused=False):
        border = f'2px solid {PIC_INK}' if focused else '1px solid #D6D6D1'
        caret = f'<span class="live" style="width: 2px; height: 20px; margin-left: 2px; background: {PIC_INK}"></span>' if focused else ''
        return f'''        <span style="display: flex; flex-direction: column; gap: 6px">
          <span style="font-size: 13px; color: #55555A">{label}</span>
          <span style="height: 46px; padding: 0 14px; box-sizing: border-box; border-radius: 10px; border: {border}; display: flex; align-items: center; font-size: 16px; color: {PIC_INK}">{value}{caret}</span>
        </span>'''
    body = f'''  <div style="padding: 58px 24px 0; color: {ON_DARK}">
{top_row(spacer(), pill(dot(BLUE_SOFT, live=True) + 'You’re in control', bg='rgba(51,85,255,0.22)', fg='#C9D3FF'), spacer())}
  </div>
  <div style="margin: 18px 16px 0; display: flex; flex-direction: column; gap: 10px">
    <span style="align-self: center; height: 30px; padding: 0 12px; border-radius: 999px; background: {GLASS}; display: flex; align-items: center; gap: 6px; font-size: 13px; color: {MUTED_DARK}">{icon('lock', 13)}inkdepot.example</span>
    <div aria-label="The site, controlled by you" style="height: 410px; padding: 24px 22px; box-sizing: border-box; border-radius: 28px; background: #FFFFFF; box-shadow: 0 0 0 3px {BLUE}; color: {PIC_INK}; display: flex; flex-direction: column; gap: 16px">
      <span style="font-size: 17px; font-weight: 600; letter-spacing: -0.01em">InkDepot</span>
      <span style="margin-top: 6px; font-size: 24px; font-weight: 600; letter-spacing: -0.02em">Sign in</span>
{field('Email', 'ajay@gmail.com')}
{field('Password', '<span style="letter-spacing: 3px">••••••••</span>', focused=True)}
      <span style="height: 46px; border-radius: 10px; background: #2B2B2F; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600">Continue</span>
      <span style="align-self: center; font-size: 13px; color: #55555A">Forgot password?</span>
    </div>
    <p style="margin: 6px 8px 0; display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 1.4; color: {MUTED_DARK}">{icon('lock', 15)}I’m not watching or recording while you’re in control.</p>
    <p style="margin: 0 8px; display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 1.4; color: {MUTED_DARK}">{icon('clock', 15)}After 10 minutes without a tap, it comes back to me.</p>
  </div>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 24px; display: flex; flex-direction: column; gap: 6px">
    <a href="NBrowser.dc.html" style="height: 56px; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 600">{icon('check', 19, 2)}Done, carry on</a>
    <a href="NJob.dc.html" style="align-self: center; height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500; color: {MUTED_DARK}">Skip this site</a>
  </div>'''
    return page('You’re in control', body, ground=DARK, color=ON_DARK)


# ---------------------------------------------------------------- Couldn't finish (D50)

@screen
def NCouldnt():
    got = [
        row(None, mark('globe'), '2 places with a table at 8 pm', 'Bastian, Bandra · Ekaa, Fort', first=True),
        row(None, mark('clock'), 'Olive’s phone line', 'Opens at 11:00 · +91 22 5555 0142'),
    ]
    nxt = [
        row('NPlan.dc.html', mark('repeat'), 'Try another way', 'Book Bastian or Ekaa instead', trail=chevron(), first=True),
        row('NAsk.dc.html', mark('edit'), 'Tell me more', 'Another day or time, or something else', trail=chevron()),
        row('NJobs.dc.html', mark('x'), 'Drop it', 'Kept under Done · Couldn’t finish', trail=chevron()),
    ]
    body = dark_header(f'''{top_row(round_link('NJobs.dc.html', 'back', 'Back'), pill(icon('alert', 15) + 'Couldn’t finish'), round_link('NJobMenu.dc.html', 'more', 'Rename, archive or delete'))}
    <h1 style="{H1}; margin-top: 22px">Book a table at Olive for Friday</h1>
    <p style="{SUB_DARK}; margin-top: 8px">Their booking page was down all evening. I tried 3 times; the last was at 21:40.</p>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{block('What I did get', got)}
{block('What next', nxt)}
  </div>'''
    return page('Couldn’t finish', body)


# ---------------------------------------------------------------- Key declined (J9)

@screen
def NKeyDeclined():
    fixes = [
        f'''      <button type="button" onClick="{{{{note_credit}}}}" style="width: 100%; padding: 10px 0; border: 0; background: transparent; display: flex; align-items: center; gap: 12px; min-height: 62px; text-align: left; font-family: inherit; color: {INK}">{mark('up_right')}<span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 15px; font-weight: 500">Add credit at Anthropic</span><span style="font-size: 13px; color: {MUTED}">Opens your Anthropic account</span></span>{chevron()}</button>''',
        row('NKey.dc.html', mark('key'), 'Replace the key', 'Paste a new one; I test it first', trail=chevron()),
        row('NConnect.dc.html', mark('sparkle'), 'Use another provider', 'OpenAI, Google or any other', trail=chevron()),
    ]
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill(dot(BLUE_SOFT) + 'Needs you · 1 of 1'), spacer())}
    <h1 style="{H1}; margin-top: 26px">Your Anthropic key was declined</h1>
    <p style="{SUB_DARK}; margin-top: 8px">Anthropic says there’s no credit left. Your jobs are paused and carry on by themselves once a key works.</p>
    <div style="margin-top: 22px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">
      {stat('3', 'jobs paused')}
      {stat('14:05', 'when it stopped', left_rule=True)}
    </div>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{block('Fix it', fixes)}
  </div>

  <sc-if value="{{{{notWorking}}}}" hint-placeholder-val="{{{{ true }}}}">
    <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex">
      <button type="button" onClick="{{{{test}}}}" disabled="{{{{testing}}}}" style="flex-grow: 1; height: 56px; border: 0; border-radius: 999px; background: {ACTION}; color: {ON_ACTION}; display: flex; align-items: center; justify-content: center; gap: 10px; font-family: inherit; font-size: 16px; font-weight: 600"><sc-if value="{{{{testing}}}}" hint-placeholder-val="{{{{ false }}}}"><span class="live" style="width: 8px; height: 8px; border-radius: 999px; background: {ON_ACTION}"></span></sc-if>{{{{testLabel}}}}</button>
    </div>
  </sc-if>
  <sc-if value="{{{{working}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div role="status" style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; flex-direction: column; gap: 14px">
      <div style="padding: 16px 18px; border-radius: 24px; background: {SURFACE}; display: flex; align-items: center; gap: 14px">
        {mark('check', bg=GREEN, fg=ON_GREEN, size=40)}
        <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">Your key works again</span><span style="font-size: 13px; color: {MUTED}">3 jobs are carrying on where they stopped</span></span>
      </div>
      <div style="display: flex">{primary('NToday.dc.html', 'Back to today', trailing=None)}</div>
    </div>
  </sc-if>{undo_bar(100)}'''
    return page('Key declined', body, script=logic("""    note('credit', 'Opens console.anthropic.com in your browser, on the billing page.');
    // Test the key again: a real call to the provider; here it comes back working after a moment.
    out.testing = st.test === 'testing';
    out.working = st.test === 'ok';
    out.notWorking = !out.working;
    out.testLabel = out.testing ? 'Testing your key…' : 'Test the key again';
    out.test = () => {
      this.setState({ test: 'testing' });
      clearTimeout(this.wait);
      this.wait = setTimeout(() => this.setState({ test: 'ok' }), 1200);
    };"""))


# ---------------------------------------------------------------- Monthly limit reached (D52)

@screen
def NLimit():
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'x', 'Close'), pill(dot(BLUE_SOFT) + 'Needs you · 1 of 1'), spacer())}
    <h1 style="{H1}; margin-top: 26px">You’ve reached this month’s limit</h1>
    <p style="{SUB_DARK}; margin-top: 8px">2 jobs are paused, so nothing more is spent on your key without you.</p>
    <div style="margin-top: 22px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">
      {stat('$20', 'of your $20 limit')}
      {stat('6 days', 'until 1 October', left_rule=True)}
    </div>
    <div style="margin-top: 16px">{bar(100, color=ON_DARK, track='rgba(255,255,255,0.14)', h=6)}</div>''') + f'''
  <fieldset style="margin: 12px 12px 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px">
    <legend style="{HIDDEN}">New limit for September</legend>
{radio_card('o0', f'<span style="width: 56px; font-size: 24px; font-weight: 500; letter-spacing: -0.03em">$30</span>', 'Raise by $10', 'For the rest of September', 'limit')}
{radio_card('o1', f'<span style="width: 56px; font-size: 24px; font-weight: 500; letter-spacing: -0.03em">$40</span>', 'Raise by $20', 'For the rest of September', 'limit')}
{radio_card('o2', f'<span style="width: 56px; display: flex; color: {MUTED}">{icon("edit", 22)}</span>', 'Another amount', 'You choose', 'limit')}
  </fieldset>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; gap: 8px">
    {secondary('NToday.dc.html', 'Wait')}
    {primary('NToday.dc.html', 'Raise the limit', trailing=None)}
  </div>'''
    return page('Monthly limit reached', body, script=radio_script({'sel': (0, ['o0', 'o1', 'o2'])}))


if __name__ == '__main__':
    write_all()
