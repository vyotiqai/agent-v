// End-to-end check of the prototype with the real Design runtime.
// 1. Every artboard on the live pages boots with no page errors.
// 2. Every link is clicked and must land on its target artboard, which must boot too.
// 3. Every button either has a handler or is disabled (static audit in audit.py covers markup).
// 4. Scripted interactions (tests below) check that in-place actions really work.
// Usage: NODE_PATH=$(npm root -g) node e2e.js [--links] [Name ...]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./play');

const canvas = JSON.parse(fs.readFileSync(path.join(__dirname, 'appmap/project/canvas.json'), 'utf8'));
const boards = Object.entries(canvas.boards)
  .filter(([, v]) => ['clean', 'states', 'dark'].includes(v.page))
  .map(([k]) => k);

const args = process.argv.slice(2);
const doLinks = args.includes('--links');
const only = args.filter((a) => !a.startsWith('--'));

async function boot(browser, base, file, errors) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  page.on('pageerror', (e) => errors.push(`${file}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${file}: console: ${m.text()}`); });
  await page.goto(`${base}/${file}`);
  await waitBooted(page);
  return page;
}

async function waitBooted(page) {
  await page.waitForFunction(() => {
    const m = document.querySelector('main');
    return m && m.getBoundingClientRect().height > 0;
  }, null, { timeout: 15000 });
}

const bar = (p) => p.locator('[role=status]').filter({ hasText: /\S/ }).last();
const shown = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible());

// Scripted interactions: name -> async (page, expect) using visible text and roles, as a person would.
const tests = {
  async NJobMenu(p, ok) {
    await p.getByRole('button', { name: 'Pause' }).click();
    ok(await shown(p.getByRole('button', { name: 'Resume' })), 'Pause turns into Resume');
    ok((await bar(p).innerText()).includes('Paused'), 'pausing says so');
    await p.getByRole('button', { name: 'Rename' }).click();
    await p.getByLabel('Name').fill('CRM shortlist');
    await p.getByRole('button', { name: 'Save' }).click();
    ok(await shown(p.getByText('CRM shortlist')), 'Rename changes the name');
    await p.getByRole('button', { name: 'Repeat…' }).click();
    await p.getByRole('button', { name: 'Every weekday at 9:00' }).click();
    ok((await bar(p).innerText()).includes('every weekday'), 'Repeat sets how often');
    await p.getByRole('button', { name: 'Stop' }).click();
    ok(await shown(p.getByText('Stop this job?')), 'Stop asks first');
    await p.getByRole('button', { name: 'Cancel' }).click();
    await p.getByRole('button', { name: 'Archive' }).click();
    ok(await shown(p.getByRole('button', { name: 'Restore' })), 'Archive can be restored');
    await p.getByRole('button', { name: 'Undo' }).click();
    ok(await shown(p.getByRole('button', { name: 'Archive' })), 'Undo un-archives');
    await p.getByRole('button', { name: 'Delete' }).click();
    ok(await shown(p.getByText('Delete this job and its files?')), 'Delete asks first');
  },
  async NGoalMenu(p, ok) {
    await p.getByRole('button', { name: 'Change the target or date' }).click();
    await p.getByLabel('By').fill('30 April');
    await p.getByRole('button', { name: 'Save' }).click();
    ok((await bar(p).innerText()).includes('Target updated'), 'the goal target can be changed');
  },
  async NComputer(p, ok) {
    await p.getByRole('button', { name: /crm-comparison\.xlsx/ }).click();
    ok(await shown(p.getByRole('dialog', { name: 'crm-comparison.xlsx' })), 'a file opens in a preview');
    ok(await shown(p.getByText('Nimbus CRM')), 'the preview shows the file');
    await p.getByRole('button', { name: 'Close' }).click();
    ok(!(await shown(p.getByRole('dialog'))), 'the preview closes');
    await p.getByRole('button', { name: 'Show more' }).click();
    ok(await shown(p.getByText('python clean.py q3-raw.xlsx')), 'older commands show');
  },
  async NSearch(p, ok) {
    await p.getByRole('button', { name: 'Jobs', exact: true }).click();
    ok(!(await shown(p.getByText('prefers morning calls'))), 'the Jobs filter hides memories');
    await p.getByRole('button', { name: 'Files' }).click();
    ok(await shown(p.getByText('No files match “Maya”')), 'Files with no match says so');
    await p.getByRole('button', { name: 'Search everything' }).click();
    await p.getByRole('button', { name: 'Forget' }).click();
    ok(!(await shown(p.getByText('prefers morning calls'))), 'Forget removes the memory');
    await p.getByRole('button', { name: 'Undo' }).click();
    ok(await shown(p.getByText('prefers morning calls')), 'Undo brings the memory back');
  },
  async NSearchError(p, ok) {
    await p.getByRole('button', { name: 'Try again' }).click();
    ok(await shown(p.getByRole('button', { name: 'Searching…' })), 'Try again shows it is searching');
    await p.waitForTimeout(1500);
    ok(await shown(p.getByText('prefers morning calls')) && !(await shown(p.getByText('didn’t load'))), 'after trying again the results show');
  },
  async NReplay(p, ok) {
    await p.getByRole('button', { name: 'Next step' }).click();
    ok(await shown(p.getByText('Step 3 of 4 · 09:26')) && await shown(p.getByText('To Maya Chen')), 'Next shows the next step and its picture');
    await p.getByRole('button', { name: 'Previous step' }).click();
    await p.getByRole('button', { name: 'Previous step' }).click();
    ok(await shown(p.getByText('Step 1 of 4 · 09:10')), 'Previous goes back');
    await p.getByRole('button', { name: 'Play' }).click();
    await p.waitForTimeout(2600);
    ok(await shown(p.getByText('Step 2 of 4 · 09:12')), 'Play moves through the steps');
    await p.getByRole('button', { name: 'Pause' }).click();
  },
  async NSpending(p, ok) {
    await p.getByRole('button', { name: 'Share or save as PDF' }).click();
    ok(await shown(bar(p)), 'share says what opens');
  },
  async NAI(p, ok) {
    await p.getByRole('button', { name: 'Change limit' }).click();
    await p.getByRole('button', { name: '$50' }).click();
    ok(await shown(p.getByText('this month, of your $50 limit')) && await shown(p.getByText('6%')), 'a new limit updates the numbers');
  },
  async NAccounts(p, ok) {
    await p.getByRole('button', { name: 'Connect', exact: true }).first().click();
    await p.waitForTimeout(1200);
    ok(await shown(p.getByText('ajay@outlook.com')), 'Connect connects the account');
    await p.getByRole('button', { name: 'Disconnect Gmail' }).click();
    ok(await shown(p.getByText('Disconnect Gmail?')), 'Disconnect asks first');
    await p.getByRole('button', { name: 'Disconnect', exact: true }).click();
    ok(!(await shown(p.getByText('What Gmail access allows'))), 'Gmail is disconnected');
    await p.getByRole('button', { name: 'Undo' }).click();
    ok(await shown(p.getByText('What Gmail access allows')), 'Undo reconnects Gmail');
  },
  async NLinkAccounts(p, ok) {
    await p.getByRole('button', { name: 'Connect', exact: true }).first().click();
    await p.waitForTimeout(1200);
    ok(await shown(p.getByText('ajay@outlook.com')), 'Connect connects the account');
  },
  async NLogins(p, ok) {
    await p.getByRole('button', { name: 'Remove' }).first().click();
    ok(!(await shown(p.getByText('hubspot.com', { exact: true }))), 'Remove removes the saved login');
    await p.getByRole('button', { name: 'Undo' }).click();
    ok(await shown(p.getByText('hubspot.com', { exact: true })), 'Undo restores it');
  },
  async NRules(p, ok) {
    await p.getByRole('button', { name: 'Undo' }).first().click();
    ok(!(await shown(p.getByText('Accept team meetings'))), 'undoing a learned exception removes it');
  },
  async NMemory(p, ok) {
    await p.getByRole('button', { name: 'Forget' }).first().click();
    ok(!(await shown(p.getByText('Maya prefers morning calls'))), 'Forget removes the memory');
    await p.getByRole('switch', { name: 'Learn from my work' }).click({ force: true });
    ok(!(await p.getByRole('switch', { name: 'Learn from my work' }).isChecked()), 'the switch turns learning off');
  },
  async NPrivacy(p, ok) {
    await p.getByRole('button', { name: /Export everything/ }).click();
    ok(await shown(p.getByText('Preparing… I’ll email a link to ajay@gmail.com')), 'export starts');
    await p.getByRole('button', { name: 'Sign out' }).click();
    ok(await shown(p.getByText('Sign out on this phone?')), 'Sign out asks first');
  },
  async NProfile(p, ok) {
    await p.getByRole('button', { name: 'Change photo' }).click();
    ok(await shown(bar(p)), 'Change photo says what opens');
  },
  async NSignIn(p, ok) {
    await p.getByRole('button', { name: 'Send a new code' }).click();
    ok(await shown(p.getByRole('button', { name: /Send a new code in 3\d s|Send a new code in 29 s/ })), 'a new code can be sent again only after 30 s');
  },
  async NTodayOffline(p, ok) {
    await p.getByRole('button', { name: 'Don’t send this' }).click();
    ok(!(await shown(p.getByText('Book a table for Friday at 8'))), 'a waiting hand-off can be cancelled');
  },
  async NKeyDeclined(p, ok) {
    await p.getByRole('button', { name: /Add credit at Anthropic/ }).click();
    ok((await bar(p).innerText()).includes('console.anthropic.com'), 'Add credit says where it opens');
    await p.getByRole('button', { name: 'Test the key again' }).click();
    await p.waitForTimeout(1500);
    ok(await shown(p.getByText('Your key works again')), 'testing the key again shows the result');
  },
  async NJobsDone(p, ok) {
    await p.getByRole('button', { name: 'Restore' }).click();
    ok(!(await shown(p.getByText('Q2 board pack'))), 'Restore moves the job back to Active');
  },
  async NHelp(p, ok) {
    await p.getByRole('button', { name: /How signing works/ }).click();
    ok(await shown(p.getByRole('dialog', { name: 'How signing works' })), 'a guide opens');
    await p.getByRole('button', { name: 'Close' }).click();
    await p.getByRole('button', { name: 'Terms' }).click();
    ok(await shown(bar(p)), 'Terms says where it opens');
  },
  async NReport(p, ok) {
    ok(await p.getByRole('button', { name: 'Send' }).isDisabled(), 'Send is off until something is written');
    await p.locator('textarea').fill('It said the booking page was down, but it works for me.');
    await p.getByRole('button', { name: 'Send' }).click();
    ok(await shown(p.getByText('Thanks. It’s sent.')), 'sending confirms');
  },
  async NVoiceOff(p, ok) {
    await p.getByRole('button', { name: /Open Settings/ }).click();
    ok(await shown(bar(p)), 'Open Settings says where it goes');
  },
  async NAsk(p, ok) {
    await p.getByRole('button', { name: /Find three venues/ }).click();
    ok((await p.locator('textarea').inputValue()) === 'Find three venues for the team offsite', 'a suggestion fills in the request');
    await p.getByRole('button', { name: 'Attach a photo, file or link' }).click();
    await p.getByRole('button', { name: 'File', exact: true }).click();
    ok(await shown(p.getByText('File · pricing.pdf')), 'attaching adds the file');
    await p.getByRole('button', { name: 'Remove File · pricing.pdf' }).click();
    ok(!(await shown(p.getByText('File · pricing.pdf'))), 'an attachment can be removed');
    await p.locator('textarea').fill('');
    ok(await p.getByRole('button', { name: 'Hand it off' }).isDisabled(), 'Send is off with nothing to hand off');
  },
  async NDeleteAccount(p, ok) {
    const hold = p.getByRole('button', { name: /Hold, then confirm/ });
    const box = await hold.boundingBox();
    await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down(); await p.waitForTimeout(1100); await p.mouse.up();
    ok(await shown(p.getByText('Your account is being deleted')), 'holding confirms the deletion');
  },
  async NControlAsk(p, ok) {
    const sw = p.getByRole('switch', { name: 'Stay signed in for next time' });
    await sw.click({ force: true });
    ok(!(await sw.isChecked()), 'Stay signed in can be turned off');
  },
  async NLimit(p, ok) {
    await p.getByText('Raise by $20').click();
    ok(await p.locator('input[type=radio]').nth(1).isChecked(), 'a limit can be chosen');
  },
  async NJob(p, ok) {
    await p.getByRole('button', { name: 'Remove from the queue' }).click();
    ok(!(await shown(p.getByText('“Include HubSpot too”'))), 'removing a queued follow-up hides it');
    ok(await shown(bar(p)), 'the Undo bar says what happened');
    await p.getByRole('button', { name: 'Undo' }).click();
    ok(await shown(p.getByText('“Include HubSpot too”')), 'Undo brings it back');
  },
  async NUndo(p, ok) {
    await p.getByRole('button', { name: 'See all 9' }).click();
    ok(await p.locator('ul[aria-label=Senders] li').count() === 9, 'See all lists all 9 senders');
  },
  async NResult(p, ok) {
    await p.getByRole('button', { name: 'Draft a reply' }).click();
    ok(await shown(p.getByText('Drafting · you’ll sign it first')), 'a next step starts a drafting job');
    await p.getByRole('button', { name: 'Share or save as PDF' }).click();
    ok((await bar(p).innerText()).includes('share sheet'), 'share says what opens');
  },
  async NSign(p, ok) {
    await p.getByRole('button', { name: 'Edit' }).click();
    ok(await shown(p.locator('textarea')), 'Edit opens the text for editing');
    await p.locator('textarea').fill('Hi Sam,\n\nFriday at 3 works. See you then.\n\nAjay');
    await p.getByRole('button', { name: 'Done' }).click();
    ok((await p.locator('article').innerText()).includes('See you then'), 'the edited text is what will be sent');
    const hold = p.getByRole('button', { name: /Hold to sign/ });
    const box = await hold.boundingBox();
    await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down(); await p.waitForTimeout(1100); await p.mouse.up();
    ok(await shown(p.getByText('Signed and sent')), 'holding signs');
  },
};

(async () => {
  const server = await serve();
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  const failures = [];
  let checks = 0;
  const list = only.length ? boards.filter((b) => only.includes(b.replace('.dc.html', ''))) : boards;
  for (const file of list) {
    const name = file.replace('.dc.html', '');
    const page = await boot(browser, base, file, errors);
    // Buttons with neither a handler nor a disabled state do nothing: not allowed.
    const dead = await page.$$eval('main button', (bs) => bs.filter((b) => !b.disabled && !Object.keys(b).some((k) => k.startsWith('__reactProps') && Object.keys(b[k]).some((h) => /^on[A-Z]/.test(h)))).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()));
    for (const d of dead) failures.push(`${name}: button "${d}" does nothing`);
    const test = tests[name] || tests[name.replace(/Dark$/, '')];
    if (test) {
      const ok = (cond, what) => { checks++; if (!cond) failures.push(`${name}: ${what}`); };
      try { await test(page, ok); } catch (e) { failures.push(`${name}: ${e.message.split('\n')[0]}`); }
    }
    await page.close();
    if (doLinks) {
      const probe = await boot(browser, base, file, errors);
      const hrefs = await probe.$$eval('main a[href]', (as) => as.map((a) => a.getAttribute('href')));
      await probe.close();
      for (let i = 0; i < hrefs.length; i++) {
        const p = await boot(browser, base, file, errors);
        const a = p.locator('main a[href]').nth(i);
        checks++;
        try {
          if (!(await a.isVisible())) { await p.close(); continue; }
          await Promise.all([p.waitForURL(`**/${hrefs[i]}`, { timeout: 5000 }), a.click()]);
          await waitBooted(p);
          if (name.endsWith('Dark') && !hrefs[i].endsWith('Dark.dc.html')) failures.push(`${name}: link ${i} leaves the dark screens (${hrefs[i]})`);
          const theme = await p.$eval('main', (m) => m.getAttribute('data-theme'));
          if (theme !== (name.endsWith('Dark') ? 'dark' : 'light')) failures.push(`${name}: link ${i} lands on a ${theme} screen`);
        } catch (e) {
          failures.push(`${name}: link ${i} to ${hrefs[i]} failed: ${e.message.split('\n')[0]}`);
        }
        await p.close();
      }
    }
  }
  await browser.close();
  server.close();
  const real = errors.filter((e) => !/ERR_CERT|fonts/.test(e));
  console.log(`${list.length} artboards, ${checks} checks`);
  for (const f of failures) console.log('FAIL', f);
  for (const e of real) console.log('ERROR', e);
  process.exit(failures.length || real.length ? 1 : 0);
})();
