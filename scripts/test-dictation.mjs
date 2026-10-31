// Start the backend first, then run `npm run test:dictation`.
// This checks the browser recording -> backend transcription flow with a fake
// MediaRecorder and a mocked /api/transcribe response (not Whisper accuracy).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const origin = process.env.APP_URL || 'http://127.0.0.1:8000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    class FakeRecorder {
      constructor(_stream, options = {}) { this.state = 'inactive'; this.mimeType = options.mimeType || 'audio/webm'; }
      static isTypeSupported() { return true; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob(['fake voice data'], { type: this.mimeType }) });
          this.onstop?.();
        }, 0);
      }
    }
    window.MediaRecorder = FakeRecorder;
  });
  let transcriptionRequest;
  await page.route('**/api/transcribe**', async route => {
    transcriptionRequest = { method: route.request().method(), url: route.request().url(), body: route.request().postData() };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'नमस्ते, किसान योजना की जानकारी चाहिए।', language: 'hi' }) });
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  const input = page.locator('#question-input');
  const mic = page.locator('.voice-button');
  const language = page.locator('.language-picker select');
  await input.fill('पहले से लिखा हुआ');
  await language.selectOption('hi');
  await mic.click();
  await page.getByText('सुन रहे हैं। पूरा होने पर “रोकें और टेक्स्ट देखें” दबाएँ।').waitFor();
  assert.equal(await language.isDisabled(), true);
  await mic.click();
  await page.waitForFunction(() => document.querySelector('#question-input')?.value.includes('किसान योजना'));
  assert.match(transcriptionRequest.url, /language=hi/);
  assert.equal(transcriptionRequest.method, 'POST');
  assert.equal(await language.isEnabled(), true);
  assert.equal(await mic.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Whisper microphone flow passed (backend transcription mocked).');
} finally {
  await browser.close();
}
