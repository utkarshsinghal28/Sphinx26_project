// Optional browser smoke tests: start the app on port 8000, then run `npm run test:e2e`.
// Voice is stubbed here to test UI wiring, not speech accuracy or device support.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const origin = process.env.APP_URL || 'http://127.0.0.1:8000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const wait = async (condition, message) => { if (!(await condition)) throw new Error(message); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    class FakeRecognition {
      start() {
        this.onstart?.();
        setTimeout(() => { const interim = [{ transcript: 'What government schemes' }]; interim.isFinal = false; this.onresult?.({ results: [interim] }); window.__heardInterim = true; }, 20);
      }
      stop() { const final = [{ transcript: 'What government schemes can farmers explore?' }]; final.isFinal = true; this.onresult?.({ results: [final] }); this.onend?.(); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = FakeRecognition;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-IN', name: 'Test voice' }], cancel() {}, speak(utterance) { window.__spoken = utterance.text; utterance.onend?.(); } } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByText('Backend connected').waitFor();
  await wait(page.locator('h1').first().isVisible(), 'Home hero not visible');
  await wait(page.getByText('Answers are prewritten examples—not live AI or verified advice.').isVisible(), 'Demo disclosure missing');

  // Dictation stays hidden while listening, then fills an editable draft on stop.
  await page.getByRole('button', { name: 'Speak your question' }).click();
  await page.waitForFunction(() => window.__heardInterim === true);
  assert.equal(await page.locator('#question-input').inputValue(), '');
  assert.equal(await page.locator('.language-picker select').isDisabled(), true);
  await page.getByRole('button', { name: 'Stop & show text' }).click();
  await page.waitForFunction(() => document.querySelector('#question-input')?.value.includes('government schemes'));
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.locator('.answer-card').first().waitFor();
  assert.match(await page.locator('.answer-text').first().innerText(), /sample response/i);
  assert.match(await page.locator('.answer-link-list').first().innerText(), /myScheme/);
  await page.getByRole('button', { name: 'Read answer aloud' }).click();
  await page.waitForFunction(() => window.__spoken?.includes('myScheme'));
  await page.getByRole('button', { name: 'Save answer' }).click();
  await page.locator('.side-nav a[href="#saved"]').click();
  await page.locator('.saved-answer-card').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.saved-answer-card').waitFor();
  assert.match(await page.locator('.saved-question').innerText(), /government schemes/i);
  await page.getByRole('button', { name: 'Remove saved answer' }).click();
  await page.getByText('Nothing saved just yet.').waitFor();

  await page.locator('.side-nav a[href="#explore"]').click();
  await page.locator('.resource-card').first().waitFor();
  assert.equal(await page.locator('.resource-card').count(), 4);
  await page.locator('.topic-large').nth(1).getByRole('button', { name: 'Try a question' }).click();
  assert.match(await page.locator('#question-input').inputValue(), /crops/i);
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByText(/Krishi Vigyan Kendra/).first().waitFor();

  // All offered UI languages are selectable and the API responds in that language.
  const cases = [
    ['hi', 'आप क्या जानना चाहेंगे?', 'नमूना जवाब'],
    ['mr', 'तुम्हाला काय जाणून घ्यायचे आहे?', 'नमुना उत्तर'],
    ['ta', 'நீங்கள் என்ன தெரிந்துகொள்ள விரும்புகிறீர்கள்?', 'மாதிரி பதில்'],
  ];
  for (const [locale, heading, marker] of cases) {
    await page.locator('.language-picker select').selectOption(locale);
    await page.locator('.new-chat-button').first().click();
    await page.getByText(heading, { exact: true }).waitFor();
    await page.locator('.topic-card').first().click();
    await page.locator('.send-button').click();
    await page.locator('.answer-card').last().getByText(marker, { exact: true }).waitFor();
  }
  await page.locator('.language-picker select').selectOption('en');
  await page.locator('.side-nav a[href="#about"]').click();
  await page.getByText('What works in phase 1').waitFor();
  await page.getByRole('button', { name: 'Install app' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();

  // Offline: the installed shell should open, but it must report an unavailable backend.
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('The backend is not connected. Questions will not send until it is available.').waitFor();
  await context.setOffline(false);
  await context.close();

  // Mobile layout, navigation and access to earlier conversations.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(origin, { waitUntil: 'networkidle' });
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Horizontal overflow on mobile');
  await phone.locator('.topic-card').first().click();
  await phone.locator('.send-button').click();
  await phone.locator('.answer-card').first().waitFor();
  await phone.locator('.mobile-history').click();
  await phone.getByRole('dialog').locator('.history-modal-item').first().waitFor();
  await phone.getByRole('dialog').getByRole('button', { name: 'New conversation' }).click();
  await phone.locator('.mobile-history').click();
  await phone.getByRole('dialog').locator('.history-modal-item').first().click();
  await phone.locator('.answer-card').first().waitFor();
  await phone.locator('.mobile-nav a[href="#saved"]').click();
  await phone.getByText('Nothing saved just yet.').waitFor();
  await phone.locator('.mobile-nav a[href="#about"]').click();
  await phone.getByText('What works in phase 1').waitFor();
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Browser smoke tests passed: chat, voice UI, saves, navigation, 4 languages, PWA offline shell and mobile history.');
} finally { await browser.close(); }
