// Start the app, then run `npm run test:dictation`.
// A controllable fake checks the browser-speech state machine, not real STT accuracy.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const origin = process.env.APP_URL || 'http://127.0.0.1:8000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__starts = 0;
    window.__stops = 0;
    class FakeRecognition {
      constructor() { window.__recognizer = this; this.active = false; }
      start() {
        window.__starts += 1;
        setTimeout(() => { this.active = true; this.onstart?.(); }, 35);
      }
      stop() {
        window.__stops += 1;
        if (!this.active) throw new Error('InvalidStateError');
        this.active = false;
        setTimeout(() => this.onend?.(), 25);
      }
      abort() { this.active = false; setTimeout(() => this.onend?.(), 0); }
      emit(rows) {
        const results = rows.map(({ text, final }) => { const result = [{ transcript: text }]; result.isFinal = final; return result; });
        this.onresult?.({ results });
      }
      unexpectedEnd() { this.active = false; this.onend?.(); }
      fail(code) { this.onerror?.({ error: code }); this.active = false; this.onend?.(); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  const input = page.locator('#question-input');
  const mic = page.locator('.voice-button');
  const send = page.locator('.send-button');
  const lang = page.locator('.language-picker select');

  // The transcript is buffered until stop, including through an unexpected end.
  await input.fill('Existing text.');
  await mic.click();
  await page.getByText('Listening. Tap “Stop & show text” when you’re done.').waitFor();
  assert.deepEqual(await page.evaluate(() => ({ continuous: __recognizer.continuous, interim: __recognizer.interimResults, lang: __recognizer.lang })), { continuous: true, interim: true, lang: 'en-IN' });
  assert.equal(await lang.isDisabled(), true);
  assert.equal(await send.isDisabled(), true);
  await page.evaluate(() => __recognizer.emit([{ text: 'What government', final: true }, { text: 'schemes', final: false }]));
  await page.evaluate(() => __recognizer.emit([{ text: 'What government schemes can', final: true }, { text: 'farmers explore?', final: false }]));
  assert.equal(await input.inputValue(), 'Existing text.');
  await page.evaluate(() => __recognizer.unexpectedEnd());
  await page.waitForFunction(() => window.__starts === 2 && window.__recognizer.active);
  assert.equal(await input.inputValue(), 'Existing text.');
  await page.evaluate(() => __recognizer.emit([{ text: 'in my district', final: true }]));
  await mic.click();
  await page.waitForFunction(() => document.querySelector('#question-input')?.value.includes('in my district'));
  assert.equal(await input.inputValue(), 'Existing text. What government schemes can farmers explore? in my district');
  assert.equal(await lang.isEnabled(), true);
  assert.equal(await send.isEnabled(), true);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__starts), 2, 'Recognition restarted after the user stopped');

  // Silence is recoverable; stopping while waiting to reconnect cancels the retry.
  await input.fill('');
  await mic.click();
  await page.waitForFunction(() => window.__recognizer.active);
  const beforeSilence = await page.evaluate(() => window.__starts);
  await page.evaluate(() => __recognizer.fail('no-speech'));
  await page.getByText('Reconnecting to browser speech…').waitFor();
  await mic.click();
  await page.getByText('No speech was recognised. Try again or type your question.').waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__starts), beforeSilence, 'A stopped session restarted after silence');

  // Fatal permission errors stop the session instead of retrying forever.
  await mic.click();
  await page.waitForFunction(() => window.__recognizer.active);
  const beforeDenial = await page.evaluate(() => window.__starts);
  await page.evaluate(() => __recognizer.fail('not-allowed'));
  await page.getByText('Microphone permission was denied. Allow it in your browser settings, or type instead.').waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__starts), beforeDenial);
  assert.equal(await mic.getAttribute('aria-pressed'), 'false');

  // If recognition fails after hearing words, preserve those words visibly.
  await input.fill('');
  await mic.click();
  await page.waitForFunction(() => window.__recognizer.active);
  await page.evaluate(() => __recognizer.emit([{ text: 'My partial question', final: true }]));
  await page.evaluate(() => __recognizer.fail('network'));
  await page.getByText('The voice service lost its connection. Any recognised words have been added; try again or type.').waitFor();
  assert.equal(await input.inputValue(), 'My partial question');

  // Starting and immediately stopping still completes without getting stuck.
  await input.fill('');
  await mic.click();
  await mic.click();
  await page.waitForFunction(() => document.querySelector('.voice-button')?.getAttribute('aria-pressed') === 'false');
  assert.equal(await mic.isEnabled(), true);

  // Long transcripts are retained, not silently truncated; send requires editing.
  await input.fill('');
  await mic.click();
  await page.waitForFunction(() => window.__recognizer.active);
  await page.evaluate(() => __recognizer.emit([{ text: 'x'.repeat(2100), final: true }]));
  await mic.click();
  await page.locator('.composer-limit').waitFor();
  assert.equal((await input.inputValue()).length, 2100);
  assert.equal(await send.isDisabled(), true);
  await input.fill('x'.repeat(2000));
  assert.equal(await send.isEnabled(), true);

  // Leaving Ask stops the mic; recognised text is preserved when returning.
  await input.fill('');
  await mic.click();
  await page.waitForFunction(() => window.__recognizer.active);
  await page.evaluate(() => __recognizer.emit([{ text: 'Keep this question', final: true }]));
  await page.locator('.side-nav a[href="#explore"]').click();
  await page.locator('.resource-card').first().waitFor();
  await page.locator('.side-nav a[href="#ask"]').click();
  await page.waitForFunction(() => document.querySelector('#question-input')?.value === 'Keep this question');
  assert.equal(await mic.getAttribute('aria-pressed'), 'false');

  // The selected UI language is passed to the browser recognizer.
  await input.fill('');
  await lang.selectOption('hi');
  await mic.click();
  await page.waitForFunction(() => window.__recognizer.active);
  assert.equal(await page.evaluate(() => window.__recognizer.lang), 'hi-IN');
  await mic.click();
  await page.waitForFunction(() => document.querySelector('.voice-button')?.getAttribute('aria-pressed') === 'false');
  assert.deepEqual(errors, []);
  await context.close();

  // The stop button must remain visible and tappable above the fixed mobile nav.
  for (const width of [320, 390]) {
    const phone = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    const phonePage = await phone.newPage();
    await phonePage.addInitScript(() => { class Fake { start() { this.onstart?.(); } stop() { this.onend?.(); } abort() {} } window.SpeechRecognition = Fake; });
    await phonePage.goto(origin, { waitUntil: 'networkidle' });
    await phonePage.locator('.voice-button').click();
    const stopIsTappable = await phonePage.evaluate(() => {
      const button = document.querySelector('.voice-button').getBoundingClientRect();
      const target = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
      return Boolean(target?.closest('.voice-button'));
    });
    assert.equal(stopIsTappable, true, `The stop button is covered at ${width}px`);
    await phone.close();
  }

  const unsupported = await browser.newContext();
  const unsupportedPage = await unsupported.newPage();
  await unsupportedPage.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await unsupportedPage.goto(origin, { waitUntil: 'networkidle' });
  await unsupportedPage.locator('.voice-button').click();
  await unsupportedPage.getByText('Voice input isn’t available in this browser. You can type instead.').waitFor();
  assert.equal(await unsupportedPage.locator('.voice-button').getAttribute('aria-pressed'), 'false');
  await unsupported.close();
  console.log('Dictation tests passed: tap-to-stop, deferred text, automatic restart, silence, errors, navigation, long input and language.');
} finally { await browser.close(); }
