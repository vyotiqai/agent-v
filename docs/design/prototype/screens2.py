"""Batch 2: find your work and the added scope (D36-D43). Part of the build: python3 screens7.py writes every screen."""
import json

from build import (BLUE_TEXT, RED_TEXT, ON_BLUE_MUTED, CONTROL_OFF, ON_BLUE, ON_INK, SCRIM, LINE_STRONG, PIC_INK, PIC_MUTED, logic, hideable, act, undo_bar, BLUE, BLUE_SOFT, DARK, DARK_2, GLASS, INK, LINE, MUTED, MUTED_DARK, ON_DARK, RED, SURFACE,
                   SURFACE_2, ask_bar, dark_header, icon, page, pill, round_button, round_link, screen, spacer, stat,
                   top_row, write_all)
from screens import BLOCK, H1, LABEL, SUB_DARK, initial, mark, primary, secondary

MONO = "'Geist Mono', ui-monospace, monospace"


def row(href, lead, title, sub=None, trail='', first=False, sub_color=MUTED):
    rule = '' if first else f'border-top: 1px solid {LINE}; '
    sub_html = ''
    if sub:
        sub_html = (f'<span style="font-size: 13px; color: {sub_color}; white-space: nowrap; overflow: hidden; '
                    f'text-overflow: ellipsis">{sub}</span>')
    tag = 'a' if href else 'div'
    href_attr = f' href="{href}"' if href else ''
    return (f'      <{tag}{href_attr} style="{rule}display: flex; align-items: center; gap: 12px; min-height: 62px; '
            f'padding: 10px 0; box-sizing: border-box">\n'
            f'        {lead}\n'
            f'        <span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">'
            f'<span style="font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{title}</span>'
            f'{sub_html}</span>\n'
            f'        {trail}\n'
            f'      </{tag}>')


def chevron():
    return f'<span style="color: {MUTED}; display: flex">{icon("chevron", 18)}</span>'


def block(label, rows, pad='12px 18px 4px'):
    head = f'<h2 style="{LABEL}; margin-bottom: 2px">{label}</h2>' if label else ''
    return (f'    <section style="padding: {pad}; {BLOCK}">\n      {head}\n' + '\n'.join(rows) + '\n    </section>')


def tabs(active, items):
    out = []
    for name, href in items:
        on = name == active
        cur = ' aria-current="page"' if on else ''
        out.append(f'<a href="{href}"{cur} style="height: 36px; padding: 0 15px; border-radius: 999px; '
                   f'background: {ON_DARK if on else GLASS}; color: {DARK if on else ON_DARK}; display: flex; '
                   f'align-items: center; font-size: 14px; font-weight: 500">{name}</a>')
    return f'<nav aria-label="Jobs sections" style="margin-top: 18px; display: flex; gap: 6px">{"".join(out)}</nav>'


JOB_TABS = [('Active', 'NJobs.dc.html'), ('Goals', 'NGoals.dc.html'), ('Done', 'NJobsDone.dc.html'),
            ('Computer', 'NComputer.dc.html')]


def bar(pct, color=INK, track=LINE, h=4):
    return (f'<span role="img" aria-label="{pct}%" style="display: block; height: {h}px; border-radius: 999px; '
            f'background: {track}; overflow: hidden"><span style="display: block; width: {pct}%; height: 100%; '
            f'border-radius: 999px; background: {color}"></span></span>')


def jobs_header(active, extra=''):
    return dark_header(
        top_row(round_link('NToday.dc.html', 'back', 'Back to today'),
                '<span style="font-size: 15px; font-weight: 500">Jobs</span>',
                round_link('NSearch.dc.html', 'search', 'Search'))
        + '\n    ' + tabs(active, JOB_TABS) + extra, bottom_pad=22)


# ---------------------------------------------------------------- Jobs: Active

@screen
def NJobs():
    needs = [
        row('NSign.dc.html', mark('pen', bg=BLUE, fg=ON_BLUE), 'Reply to Sam about Friday', 'Signature',
            first=True, sub_color=BLUE_TEXT),
        row('NQuestion.dc.html', mark('question', bg=BLUE, fg=ON_BLUE), 'How many seats should I price?',
            'Question', sub_color=BLUE_TEXT),
        row('NUndo.dc.html', mark('trash', bg=BLUE, fg=ON_BLUE), 'Unsubscribe from 9 newsletters',
            'Can’t be undone', sub_color=RED_TEXT),
    ]
    working = [
        row('NJob.dc.html', mark('globe'), 'Compare CRM tools', 'Step 3 of 5 · 1 follow-up queued',
            trail=chevron(), first=True),
        row('NComputer.dc.html', mark('sheet'), 'Clean up the Q3 numbers', 'On the computer · step 2 of 4',
            trail=chevron()),
    ]
    repeating = [
        row('NBriefing.dc.html', mark('mail'), 'Morning briefing', 'Weekdays at 7:30', trail=chevron(), first=True),
        row('NWatch.dc.html', mark('eye'), 'MacBook Air price', 'Hourly · alert under ₹90,000', trail=chevron()),
    ]
    body = jobs_header('Active') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{block('Needs you', needs)}
{block('Working', working)}
{block('Repeating', repeating)}
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Jobs', body)


# ---------------------------------------------------------------- Goals

def goal_card(href, title, sub, pct, amount, dark=False):
    if dark:
        bg, fg, mu, tr, mk_bg = DARK_2, ON_DARK, MUTED_DARK, 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.1)'
    else:
        bg, fg, mu, tr, mk_bg = SURFACE, INK, MUTED, LINE, SURFACE_2
    return f'''    <a href="{href}" style="padding: 20px; border-radius: 28px; background: {bg}; color: {fg}; display: flex; flex-direction: column; gap: 14px">
      <span style="display: flex; align-items: center; justify-content: space-between">
        {mark('flag', bg=mk_bg, fg=fg)}
        <span style="font-size: 13px; color: {mu}">{sub}</span>
      </span>
      <span style="font-size: 20px; line-height: 1.25; font-weight: 500; letter-spacing: -0.015em">{title}</span>
      <span style="display: flex; align-items: baseline; justify-content: space-between"><span style="font-size: 28px; font-weight: 500; letter-spacing: -0.03em">{pct}%</span><span style="font-size: 13px; color: {mu}">{amount}</span></span>
      {bar(pct, color=fg, track=tr, h=6)}
    </a>'''


@screen
def NGoals():
    body = jobs_header('Goals') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{goal_card('NGoal.dc.html', 'Save ₹1,50,000 by March', '3 milestones · 2 jobs', 41, '₹62,000 saved', dark=True)}
{goal_card('NGoal.dc.html', 'Hire a sales lead by November', '4 milestones · 3 jobs', 25, '1 of 4 milestones')}
    <a href="NAsk.dc.html" style="height: 60px; border-radius: 22px; border: 1.5px dashed {LINE_STRONG}; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 500; color: {MUTED}">{icon('plus', 18)}New goal</a>
  </div>
{ask_bar('Hand something off…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Goals', body)


@screen
def NGoal():
    ring_now = (f'<span aria-label="In progress" style="width: 36px; height: 36px; flex-shrink: 0; border-radius: 999px; '
                f'border: 2px solid {INK}; box-sizing: border-box; display: flex; align-items: center; justify-content: center">'
                f'<span class="live" style="width: 10px; height: 10px; border-radius: 999px; background: {INK}"></span></span>')
    ring_next = ('<span aria-label="Not started" style="width: 36px; height: 36px; flex-shrink: 0; border-radius: 999px; '
                 f'border: 1.5px dashed {CONTROL_OFF}; box-sizing: border-box"></span>')
    rows = [
        row('NSpending.dc.html', mark('check', bg=INK, fg=ON_INK, label='Done'), 'Know where the money goes',
            'Spending summary filed 22 Sep', trail=chevron(), first=True),
        row('NIdea.dc.html', ring_now, 'Cut ₹8,000 a month', '₹1,340 found so far · 1 idea waiting', trail=chevron()),
        row(None, ring_next, 'Buy the MacBook Air under ₹90,000', 'Watching the price hourly'),
    ]
    body = dark_header(f'''{top_row(round_link('NGoals.dc.html', 'back', 'Back to goals'), pill(icon('flag', 14) + 'Goal · by 31 March'), round_link('NGoalMenu.dc.html', 'more', 'Rename, change the target or date, archive or delete'))}
    <h1 style="{H1}; margin-top: 22px">Save ₹1,50,000 by March</h1>
    <div style="margin-top: 20px; display: flex; align-items: flex-end; justify-content: space-between">
      <span style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 44px; line-height: 1; font-weight: 500; letter-spacing: -0.035em">₹62,000</span><span style="font-size: 13px; color: {MUTED_DARK}">saved of ₹1,50,000 · from your statements</span></span>
      <span style="font-size: 20px; font-weight: 500; color: {MUTED_DARK}">41%</span>
    </div>
    <div style="margin-top: 14px">{bar(41, color=ON_DARK, track='rgba(255,255,255,0.14)', h=6)}</div>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{block('Milestones', rows)}
    <a href="NIdea.dc.html" style="padding: 18px; border-radius: 28px; background: {BLUE}; color: {ON_BLUE}; display: flex; align-items: center; gap: 14px">
      {mark('memory', bg='rgba(255,255,255,0.18)', fg=ON_BLUE)}
      <span style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; color: {ON_BLUE_MUTED}">Idea for this goal</span><span style="font-size: 16px; font-weight: 500">Cancel 2 subscriptions you don’t use</span></span>
      {icon('chevron', 18)}
    </a>
  </div>
{ask_bar('Ask about this goal…', 'NAsk.dc.html', 'NVoice.dc.html')}'''
    return page('Goal', body)


# ---------------------------------------------------------------- Ideas

def idea_card(href, ic, title, why, source):
    return f'''    <a href="{href}" style="padding: 18px; border-radius: 28px; background: {SURFACE}; display: flex; flex-direction: column; gap: 10px">
      <span style="display: flex; align-items: center; gap: 12px">{mark(ic)}<span style="flex-grow: 1; font-size: 13px; color: {MUTED}">{source}</span>{chevron()}</span>
      <span style="font-size: 18px; line-height: 1.25; font-weight: 500; letter-spacing: -0.01em">{title}</span>
      <span style="font-size: 14px; line-height: 1.4; color: {MUTED}">{why}</span>
    </a>'''


@screen
def NIdeas():
    body = dark_header(f'''{top_row(round_link('NToday.dc.html', 'back', 'Back to today'), '<span style="font-size: 15px; font-weight: 500">Ideas</span>', spacer())}
    <h1 style="{H1}; margin-top: 22px">3 things I think are worth doing</h1>
    <p style="{SUB_DARK}; margin-top: 8px">Nothing happens until you say so.</p>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{idea_card('NIdea.dc.html', 'repeat', 'Cancel 2 subscriptions you don’t use', 'Saves ₹1,340 a month toward your March goal.', 'From your September statement')}
{idea_card('NIdea.dc.html', 'calendar', 'Prepare for Friday’s review with Sam', 'Sam asked for the Q3 numbers; I can put them on one page.', 'From your calendar and email')}
{idea_card('NIdea.dc.html', 'file', 'Renew your passport', 'It expires in 5 months; renewals take up to 8 weeks.', 'From a scan in your files')}
    <a href="NIdeas.dc.html" style="height: 48px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; color: {MUTED}">5 set aside</a>
  </div>'''
    return page('Ideas', body)


@screen
def NIdea():
    evidence = [
        row(None, mark('file'), 'Charged ₹640 and ₹700 each month', 'Your August and September statements', first=True),
        row(None, mark('mail'), 'Neither used since June', 'No sign-in emails in your inbox'),
        row('NGoal.dc.html', mark('flag'), 'Counts toward Save ₹1,50,000', 'Your goal', trail=chevron()),
    ]
    body = dark_header(f'''{top_row(round_link('NIdeas.dc.html', 'back', 'Back to ideas'), pill(icon('memory', 14) + 'Idea'), spacer())}
    <h1 style="{H1}; margin-top: 24px">Cancel 2 subscriptions you don’t use</h1>
    <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 6px">
      <span style="font-size: 44px; line-height: 1; font-weight: 500; letter-spacing: -0.035em">₹1,340</span>
      <span style="font-size: 13px; color: {MUTED_DARK}">saved every month</span>
    </div>''') + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
{block('Why I think so', evidence)}
    <p style="margin: 6px 16px 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: {MUTED}">{icon('pen', 15)}Each cancellation will need your signature.</p>
  </div>

  <div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; gap: 8px">
    {secondary('NIdeas.dc.html', 'Not now')}
    {primary('NPlan.dc.html', 'Do it')}
  </div>'''
    return page('An idea', body)


# ---------------------------------------------------------------- The agent's computer

FILES = {
    'crm': ('sheet', 'crm-comparison.xlsx', '48 KB · edited 09:21', 'Compare CRM tools', 'NJob.dc.html',
            [('Tool', 'Per seat', 'Rating'), ('Nimbus CRM', '$15', '4.4'), ('Pipewell', '$22', '4.2'),
             ('Clientbase', '$25', '4.0'), ('Dealbook', '$29', '4.5')]),
    'reviews': ('file', 'reviews-5-20.csv', '212 KB · edited 09:18', 'Compare CRM tools', 'NJob.dc.html',
                [('tool', 'stars', 'date'), ('Nimbus CRM', '5', '2026-09-20'), ('Pipewell', '4', '2026-09-19'),
                 ('Dealbook', '5', '2026-09-19'), ('Clientbase', '3', '2026-09-18')]),
    'q3': ('sheet', 'q3-numbers-clean.xlsx', '96 KB · edited 08:40', 'Clean up the Q3 numbers', 'NJobs.dc.html',
           [('Month', 'Revenue', 'Costs'), ('July', '₹12.4L', '₹8.1L'), ('August', '₹13.1L', '₹8.4L'),
            ('September', '₹13.9L', '₹8.6L'), ('Total', '₹39.4L', '₹25.1L')]),
}


def file_sheet(key):
    ic, name, meta, job, job_href, table = FILES[key]
    cells = []
    for r, cols in enumerate(table):
        for c, v in enumerate(cols):
            weight = 600 if r == 0 else 400
            align = 'left' if c == 0 else 'right'
            cells.append(f'<span style="padding: 9px 10px; border-top: {"0" if r == 0 else "1px solid " + LINE}; font-family: {MONO}; '
                         f'font-size: 12.5px; font-weight: {weight}; text-align: {align}; white-space: nowrap">{v}</span>')
    return f'''  <sc-if value="{{{{p_{key}}}}}" hint-placeholder-val="{{{{ false }}}}">
    <div aria-hidden="true" onClick="{{{{closePanel}}}}" style="position: absolute; inset: 0; background: {SCRIM}"></div>
    <section role="dialog" aria-label="{name}" style="position: absolute; left: 8px; right: 8px; bottom: 8px; padding: 10px 20px 14px; border-radius: 32px; background: {SURFACE}; display: flex; flex-direction: column; gap: 14px">
      <span aria-hidden="true" style="align-self: center; width: 40px; height: 5px; border-radius: 3px; background: {LINE_STRONG}"></span>
      <div style="display: flex; align-items: center; gap: 12px">{mark(ic)}<span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 500">{name}</span><span style="font-size: 13px; color: {MUTED}">{meta}</span></span></div>
      <div role="table" aria-label="Preview of {name}" style="border: 1px solid {LINE}; border-radius: 16px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden">{''.join(cells)}</div>
      <a href="{job_href}" style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: {MUTED}">{icon('link', 15)}Made by the job “{job}”</a>
      <div style="display: flex; gap: 8px">
        <button type="button" onClick="{{{{note_share}}}}" style="flex-grow: 1; height: 52px; border: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; font-size: 16px; font-weight: 600; color: {INK}">{icon('share', 18)}Share</button>
        <button type="button" onClick="{{{{closePanel}}}}" style="flex-grow: 1; height: 52px; border: 0; border-radius: 999px; background: {INK}; font-family: inherit; font-size: 16px; font-weight: 600; color: {ON_INK}">Close</button>
      </div>
    </section>
  </sc-if>'''


@screen
def NComputer():
    def file_row(key, first=False):
        ic, name, meta = FILES[key][:3]
        rule = '' if first else f'border-top: 1px solid {LINE}; '
        return (f'      <button type="button" onClick="{{{{open_{key}}}}}" style="width: 100%; {rule}padding: 10px 0; border-left: 0; border-right: 0; border-bottom: 0; '
                f'{"border-top: 0; " if first else ""}background: transparent; display: flex; align-items: center; gap: 12px; min-height: 62px; '
                f'text-align: left; font-family: inherit; color: {INK}">{mark(ic)}<span style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">'
                f'<span style="font-size: 15px; font-weight: 500">{name}</span><span style="font-size: 13px; color: {MUTED}">{meta}</span></span>{chevron()}</button>')
    files = [file_row('crm', first=True), file_row('reviews'), file_row('q3')]
    lines = [(True, 'python compare.py reviews-5-20.csv'), (False, '4 tools under $30 a seat'),
             (True, 'python chart.py --out crm.png'), (False, 'saved crm.png')]
    older = [(True, 'python fetch_reviews.py --since 2026-05-20'), (False, '212 reviews saved to reviews-5-20.csv'),
             (True, 'python clean.py q3-raw.xlsx'), (False, '3 duplicate rows removed, 2 dates fixed'),
             (True, 'python totals.py q3-numbers-clean.xlsx'), (False, 'revenue ₹39.4L, costs ₹25.1L')]

    def term(ls):
        out = []
        for cmd, text in ls:
            if cmd:
                out.append(f'<span style="display: block"><span style="color: {BLUE_SOFT}">$</span> {text}</span>')
            else:
                out.append(f'<span style="display: block; color: {MUTED_DARK}">  {text}</span>')
        return ''.join(out)
    extra = f'''
    <div style="margin-top: 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">
      {stat('12', 'files')}
      {stat('0.4', 'GB of 1 GB', left_rule=True)}
      {stat('38', 'commands', left_rule=True)}
    </div>'''
    body = jobs_header('Computer', extra) + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
    <section style="padding: 12px 18px 4px; {BLOCK}">
      <h2 style="{LABEL}; margin-bottom: 2px">Files</h2>
{chr(10).join(files)}
    </section>
    <section aria-labelledby="cmds" style="padding: 16px 18px 18px; border-radius: 28px; background: {DARK_2}; color: {ON_DARK}">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px"><h2 id="cmds" style="margin: 0; font-size: 13px; font-weight: 500; color: {MUTED_DARK}">Commands it ran · newest first</h2><button type="button" onClick="{{{{flipMore}}}}" style="height: 32px; padding: 0 4px; border: 0; background: transparent; font-family: inherit; font-size: 13px; font-weight: 500; color: {ON_DARK}">{{{{moreLabel}}}}</button></div>
      <pre style="margin: 0; max-height: 190px; overflow-y: auto; font-family: {MONO}; font-size: 12.5px; line-height: 1.7; white-space: pre-wrap">{term(lines)}<sc-if value="{{{{more}}}}" hint-placeholder-val="{{{{ false }}}}">{term(older)}</sc-if></pre>
    </section>
  </div>
{file_sheet('crm')}
{file_sheet('reviews')}
{file_sheet('q3')}{undo_bar(16)}'''
    return page('The agent’s computer', body, script=logic("""    panels(['crm', 'reviews', 'q3']);
    note('share', 'Opens your phone’s share sheet for this file.');
    out.more = Boolean(st.more);
    out.moreLabel = st.more ? 'Show less' : 'Show more';
    out.flipMore = () => this.setState({ more: !st.more });"""))


# ---------------------------------------------------------------- Search

SEARCH_FILTERS = ['All', 'Jobs', 'Files', 'Remembered']


def search_screen(failed=False):
    chips = ''.join(
        f'<button type="button" onClick="{{{{f{i}.pick}}}}" aria-pressed="{{{{f{i}.pressed}}}}" style="height: 34px; padding: 0 14px; border: 0; border-radius: 999px; '
        f'background: {{{{f{i}.bg}}}}; color: {{{{f{i}.fg}}}}; font-family: inherit; font-size: 14px; font-weight: 500">{c}</button>'
        for i, c in enumerate(SEARCH_FILTERS))
    b = '<b style="font-weight: 600">Maya</b>'
    jobs = [
        row('NPlan.dc.html', mark('calendar'), f'Schedule a call with {b}', 'Waiting for her to accept',
            trail=chevron(), first=True),
        row('NReplay.dc.html', mark('mail'), f'Introduce {b} to the design team', 'Done · 12 Sep', trail=chevron()),
    ]
    mem = [hideable(row(None, mark('memory'), f'{b} prefers morning calls', 'Learned from 3 of your emails',
                        trail=act('Forget', 'hide_maya'), first=True), 'maya')]
    head = f'''<div style="display: flex; align-items: center; gap: 12px">
      <label for="q" style="flex-grow: 1; height: 48px; padding: 0 16px; border-radius: 999px; background: {DARK_2}; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px; color: {MUTED_DARK}">{icon('search', 18)}<input id="q" type="search" value="Maya" aria-label="Search jobs, files and what I remember" style="flex-grow: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-family: inherit; font-size: 16px; color: {ON_DARK}"></label>
      <a href="NToday.dc.html" style="height: 44px; display: flex; align-items: center; font-size: 15px; font-weight: 500">Cancel</a>
    </div>
    <div role="group" aria-label="Filters" style="margin-top: 16px; display: flex; gap: 6px">{chips}</div>'''
    none_files = f'''    <section style="padding: 20px 18px; {BLOCK}; display: flex; flex-direction: column; gap: 10px">
      <span style="font-size: 15px; font-weight: 500">No files match “Maya”</span>
      <span style="font-size: 13px; color: {MUTED}">Files are searched by name and what’s inside them.</span>
      <button type="button" onClick="{{{{f0.pick}}}}" style="align-self: flex-start; height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: {SURFACE_2}; font-family: inherit; font-size: 14px; font-weight: 500; color: {INK}">Search everything</button>
    </section>'''
    error = f'''    <section role="alert" style="padding: 18px; {BLOCK}; display: flex; flex-direction: column; gap: 14px">
      <div style="display: flex; align-items: flex-start; gap: 12px">
        {mark('alert')}
        <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 15px; font-weight: 500">Files and memory didn’t load</span><span style="font-size: 13px; line-height: 1.4; color: {MUTED}">The search took too long. Jobs above are complete.</span></span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding-left: 48px">
        <button type="button" onClick="{{{{retry}}}}" disabled="{{{{retrying}}}}" style="height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: {SURFACE_2}; display: flex; align-items: center; gap: 8px; font-family: inherit; font-size: 14px; font-weight: 500; color: {INK}"><sc-if value="{{{{retrying}}}}" hint-placeholder-val="{{{{ false }}}}"><span class="live" style="width: 7px; height: 7px; border-radius: 999px; background: {INK}"></span></sc-if>{{{{retryLabel}}}}</button>
        <span style="font-size: 12px; color: {MUTED}">Ref. S-4F2A</span>
      </div>
    </section>'''
    if failed:
        rest = f'''  <sc-if value="{{{{failedNow}}}}" hint-placeholder-val="{{{{ true }}}}">
    <sc-if value="{{{{notJobsOnly}}}}" hint-placeholder-val="{{{{ true }}}}">
{error}
    </sc-if>
  </sc-if>
  <sc-if value="{{{{loaded}}}}" hint-placeholder-val="{{{{ false }}}}">
    <sc-if value="{{{{showMem}}}}" hint-placeholder-val="{{{{ true }}}}">
{block('Remembered', mem)}
    </sc-if>
    <sc-if value="{{{{showFiles}}}}" hint-placeholder-val="{{{{ false }}}}">
{none_files}
    </sc-if>
  </sc-if>'''
    else:
        rest = f'''  <sc-if value="{{{{showMem}}}}" hint-placeholder-val="{{{{ true }}}}">
{block('Remembered', mem)}
  </sc-if>
  <sc-if value="{{{{showFiles}}}}" hint-placeholder-val="{{{{ false }}}}">
{none_files}
  </sc-if>'''
    body = dark_header(head, bottom_pad=22, glow=False) + f'''
  <div style="padding: 12px 12px 0; display: flex; flex-direction: column; gap: 8px">
  <sc-if value="{{{{showJobs}}}}" hint-placeholder-val="{{{{ true }}}}">
{block('Jobs', jobs)}
  </sc-if>
{rest}
  </div>{undo_bar(28)}'''
    vals = """    const f = st.filter ?? 0;
    ['All', 'Jobs', 'Files', 'Remembered'].forEach((name, i) => {
      out['f' + i] = {
        bg: f === i ? 'var(--on-night)' : 'var(--glass)',
        fg: f === i ? 'var(--night)' : 'var(--on-night)',
        pressed: f === i ? 'true' : 'false',
        pick: () => this.setState({ filter: i }),
      };
    });
    out.showJobs = f === 0 || f === 1;
    out.showMem = f === 0 || f === 3;
    out.showFiles = f === 2;
    out.notJobsOnly = f !== 1;
    hide('maya', 'Forgot: Maya prefers morning calls.');
    // A failed part of the search: Try again searches again and, when it works, shows what it found.
    out.loaded = !%s || st.retry === 'done';
    out.failedNow = !out.loaded;
    out.retrying = st.retry === 'loading';
    out.retryLabel = out.retrying ? 'Searching…' : 'Try again';
    out.retry = () => {
      this.setState({ retry: 'loading' });
      clearTimeout(this.wait);
      this.wait = setTimeout(() => this.setState({ retry: 'done' }), 1200);
    };""" % ('true' if failed else 'false')
    return body, logic(vals)


@screen
def NSearch():
    body, script = search_screen()
    return page('Search', body, script=script)


# ---------------------------------------------------------------- Replay

REPLAY = [
    ('09:10', 'Checked your calendar for next week', 'Mornings are mostly free; afternoons are busy.', 'cal'),
    ('09:12', 'Picked three free mornings: Monday, Wednesday and Friday', 'Maya prefers mornings, so I skipped the afternoons.', 'cal'),
    ('09:26', 'You signed the invite, and I sent it to Maya', 'Sent from ajay@gmail.com right after your signature.', 'mail'),
    ('09:26', 'Waiting for Maya to accept', 'I’ll tell you when she does, or find new times if she can’t.', 'wait'),
]


@screen
def NReplay():
    def day(name, cells):
        out = []
        for c in cells:
            if c == 'pick':
                out.append(f'<span style="height: 22px; border-radius: 6px; background: {{{{pickBg}}}}; box-shadow: {{{{pickRing}}}}"></span>')
            else:
                out.append(f'<span style="height: 22px; border-radius: 6px; background: {"#D6D6D1" if c else "#F2F2EF"}"></span>')
        return (f'<div style="display: flex; flex-direction: column; gap: 5px"><span style="font-size: 11px; '
                f'color: {PIC_MUTED}; text-align: center">{name}</span>{"".join(out)}</div>')
    week = ''.join(day(n, c) for n, c in [('Mon', [1, 0, 'pick', 1, 1]), ('Tue', [0, 1, 1, 0, 1]),
                                          ('Wed', ['pick', 0, 1, 1, 0]), ('Thu', [1, 1, 0, 1, 1]),
                                          ('Fri', [0, 'pick', 1, 0, 0])])
    steps = ''.join(f'<span style="flex-grow: 1; height: 4px; border-radius: 2px; background: {{{{seg{i}}}}}"></span>' for i in range(4))
    picture = f'''  <div style="margin: 14px 16px 0; height: 216px; padding: 18px; box-sizing: border-box; border-radius: 28px; background: #FFFFFF; color: {PIC_INK}; display: flex; flex-direction: column; gap: 14px">
    <sc-if value="{{{{picCal}}}}" hint-placeholder-val="{{{{ true }}}}">
      <span role="img" aria-label="Your calendar for next week" style="display: flex; flex-direction: column; gap: 14px"><span style="font-size: 14px; font-weight: 500">Next week · mornings</span>
      <span style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px">{week}</span></span>
    </sc-if>
    <sc-if value="{{{{picMail}}}}" hint-placeholder-val="{{{{ false }}}}">
      <span role="img" aria-label="The invite that was sent" style="display: flex; flex-direction: column; gap: 10px">
        <span style="display: flex; align-items: center; gap: 10px">{initial('M', bg='#F0F0ED', fg=PIC_INK, size=36)}<span style="display: flex; flex-direction: column"><span style="font-size: 14px; font-weight: 500">To Maya Chen</span><span style="font-size: 12px; color: {PIC_MUTED}">From ajay@gmail.com · 09:26</span></span></span>
        <span style="font-size: 15px; font-weight: 500">Invitation: call, Monday 10:00</span>
        <span style="font-size: 13px; line-height: 1.45; color: {PIC_MUTED}">Also free: Wednesday 9:30 or Friday 10:30. Pick whichever suits you.</span>
      </span>
    </sc-if>
    <sc-if value="{{{{picWait}}}}" hint-placeholder-val="{{{{ false }}}}">
      <span role="img" aria-label="Waiting for a reply" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: {PIC_MUTED}">{icon('clock', 40, 1.5)}<span style="font-size: 14px">No reply from Maya yet</span></span>
    </sc-if>
  </div>'''
    body = f'''  <div style="padding: 58px 24px 0">
{top_row(round_link('NJobsDone.dc.html', 'x', 'Close replay'), pill(icon('repeat', 14) + 'Replay'), spacer())}
  </div>
  <p style="margin: 18px 24px 0; font-size: 15px; font-weight: 500; color: {MUTED_DARK}">Schedule a call with Maya</p>
{picture}
  <div aria-live="polite" style="margin: 24px 24px 0; display: flex; flex-direction: column; gap: 8px">
    <span style="font-size: 13px; color: {MUTED_DARK}">{{{{where}}}}</span>
    <p style="margin: 0; font-size: 22px; line-height: 1.25; font-weight: 500; letter-spacing: -0.02em">{{{{title}}}}</p>
    <p style="margin: 0; font-size: 14px; line-height: 1.45; color: {MUTED_DARK}">{{{{sub}}}}</p>
  </div>
  <div style="position: absolute; left: 24px; right: 24px; bottom: 36px; display: flex; flex-direction: column; gap: 24px">
    <div role="img" aria-label="{{{{where}}}}" style="display: flex; gap: 4px">{steps}</div>
    <div style="display: flex; align-items: center; justify-content: center; gap: 28px">
      <button type="button" aria-label="Previous step" onClick="{{{{prev}}}}" disabled="{{{{atStart}}}}" style="width: 52px; height: 52px; border: 0; border-radius: 999px; background: {GLASS}; color: {ON_DARK}; opacity: {{{{prevOpacity}}}}; display: flex; align-items: center; justify-content: center">{icon('prev')}</button>
      <button type="button" aria-label="{{{{playLabel}}}}" onClick="{{{{toggle}}}}" style="width: 68px; height: 68px; border: 0; border-radius: 999px; background: {ON_DARK}; color: {DARK}; display: flex; align-items: center; justify-content: center"><sc-if value="{{{{notPlaying}}}}" hint-placeholder-val="{{{{ true }}}}">{icon('play')}</sc-if><sc-if value="{{{{playing}}}}" hint-placeholder-val="{{{{ false }}}}"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg></sc-if></button>
      <button type="button" aria-label="Next step" onClick="{{{{next}}}}" disabled="{{{{atEnd}}}}" style="width: 52px; height: 52px; border: 0; border-radius: 999px; background: {GLASS}; color: {ON_DARK}; opacity: {{{{nextOpacity}}}}; display: flex; align-items: center; justify-content: center">{icon('next')}</button>
    </div>
  </div>'''
    steps_js = json.dumps([list(x) for x in REPLAY], ensure_ascii=False)
    vals = f"""    const STEPS = {steps_js};
    const i = st.step ?? 1;
    const [time, title, sub, pic] = STEPS[i];
    out.where = 'Step ' + (i + 1) + ' of ' + STEPS.length + ' · ' + time;
    out.title = title;
    out.sub = sub;
    out.picCal = pic === 'cal';
    out.picMail = pic === 'mail';
    out.picWait = pic === 'wait';
    out.pickBg = i >= 1 ? '#FFFFFF' : '#F2F2EF';
    out.pickRing = i >= 1 ? 'inset 0 0 0 2px #3355FF' : 'none';
    for (let k = 0; k < STEPS.length; k++) out['seg' + k] = k <= i ? 'var(--on-night)' : 'rgba(255,255,255,0.18)';
    out.atStart = i === 0;
    out.atEnd = i === STEPS.length - 1;
    out.prevOpacity = out.atStart ? 0.4 : 1;
    out.nextOpacity = out.atEnd ? 0.4 : 1;
    out.playing = Boolean(st.playing);
    out.notPlaying = !st.playing;
    out.playLabel = st.playing ? 'Pause' : 'Play';
    const go = (n) => this.setState({{ step: Math.max(0, Math.min(STEPS.length - 1, n)) }});
    out.prev = () => {{ this.stopPlay(); go(i - 1); }};
    out.next = () => {{ this.stopPlay(); go(i + 1); }};
    out.toggle = () => (st.playing ? this.stopPlay() : this.play(STEPS.length));"""
    methods = """
  play(n) {
    const st = this.state || {};
    const from = (st.step ?? 1) >= n - 1 ? 0 : (st.step ?? 1);
    this.setState({ playing: true, step: from });
    clearInterval(this.tick);
    this.tick = setInterval(() => {
      const s = (this.state || {}).step ?? 0;
      if (s >= n - 1) this.stopPlay();
      else this.setState({ step: s + 1 });
    }, 2200);
  }
  stopPlay() {
    clearInterval(this.tick);
    this.setState({ playing: false });
  }"""
    return page('Replay', body, ground=DARK, color=ON_DARK, script=logic(vals, methods))


# ---------------------------------------------------------------- Spending summary

@screen
def NSpending():
    cats = [('Rent', 32000), ('Food and dining', 14800), ('Shopping', 11200), ('Other', 10880),
            ('Travel', 8900), ('Subscriptions', 6450)]
    top = cats[0][1]
    rows = []
    for name, v in cats:
        rows.append(f'''        <li style="display: flex; flex-direction: column; gap: 6px">
          <span style="display: flex; justify-content: space-between; font-size: 14px"><span>{name}</span><span style="font-weight: 500">₹{v:,}</span></span>
          <span style="display: block; height: 8px; border-radius: 4px; background: {SURFACE_2}"><span style="display: block; width: {round(v / top * 100)}%; height: 100%; border-radius: 4px; background: {INK}"></span></span>
        </li>''')
    body = dark_header(f'''{top_row(round_link('NGoal.dc.html', 'back', 'Back'), '<span style="font-size: 15px; font-weight: 500">Filed · 22 Sep</span>', round_button('share', 'Share or save as PDF', on='note_share'))}
    <h1 style="{H1}; margin-top: 22px">Where your money went in September</h1>
    <div style="margin-top: 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">
      {stat('₹84k', 'spent')}
      {stat('14', 'recurring', left_rule=True)}
      {stat('₹1.3k', 'unused', left_rule=True)}
    </div>''') + f'''
  <div style="padding: 12px 12px 0">
    <section aria-labelledby="cats" style="padding: 16px 18px 20px; {BLOCK}">
      <h2 id="cats" style="{LABEL}; margin-bottom: 14px">By category</h2>
      <ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 14px">
{chr(10).join(rows)}
      </ul>
    </section>
  </div>
{ask_bar('Ask about this, or follow up…', 'NAsk.dc.html', 'NVoice.dc.html')}{undo_bar()}'''
    return page('Spending summary', body, script=logic("    note('share', 'Opens your phone’s share sheet: send it, or save it as a PDF.');"))


if __name__ == '__main__':
    write_all()
