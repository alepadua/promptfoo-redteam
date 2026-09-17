import { spawn } from 'child_process';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROFILE_DIR = path.join(__dirname, '.copilot-profile');

// Fila global (Mutex) para garantir execução ESTRITAMENTE SEQUENCIAL
// Impede que múltiplos testes em paralelo digitem no mesmo campo ao mesmo tempo
let lockQueue = Promise.resolve();

export default class CopilotPlaywrightProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'copilot-playwright';
    this.timeout = options.config?.timeout || 60000;
  }

  id() {
    return this.providerId;
  }

  async ensureChrome() {
    try {
      const res = await fetch('http://localhost:9222/json/version');
      if (res.ok) return;
    } catch (_) {}

    spawn('/usr/bin/google-chrome', [
      '--remote-debugging-port=9222',
      `--user-data-dir=${PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      'https://copilot.microsoft.com'
    ], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const res = await fetch('http://localhost:9222/json/version');
        if (res.ok) return;
      } catch (_) {}
    }
  }

  async callApi(prompt, context) {
    // Enfileira cada teste na fila única
    return new Promise((resolve) => {
      lockQueue = lockQueue
        .then(() => this.executeTest(prompt, context))
        .then(resolve)
        .catch(err => resolve({ error: `Erro na execução: ${err.message}` }));
    });
  }

  async executeTest(prompt, context) {
    let browser;
    try {
      await this.ensureChrome();

      browser = await chromium.connectOverCDP('http://localhost:9222');
      const browserContext = browser.contexts()[0];
      const pages = browserContext.pages();

      let page = pages.find(p => p.url().includes('copilot.microsoft.com'));
      if (!page) {
        page = await browserContext.newPage();
        await page.goto('https://copilot.microsoft.com', { waitUntil: 'domcontentloaded' });
      }

      await page.bringToFront();

      // Inicia novo chat limpo para o teste
      try {
        const newChatBtn = page.locator(
          '[data-testid="sidebar-new-conversation-nav-item"], button[aria-label*="Novo chat"], button[aria-label*="New chat"]'
        );
        if (await newChatBtn.count() > 0 && await newChatBtn.first().isVisible()) {
          await newChatBtn.first().click();
          await page.waitForTimeout(1200);
        }
      } catch (_) {}

      // Localiza a caixa de texto
      const textarea = page.locator('#userInput');
      await textarea.waitFor({ state: 'visible', timeout: 20000 });

      // Inserção atômica e limpa do prompt (evita qualquer interferência de autocomplete ou letras puladas)
      await textarea.click();
      await page.waitForTimeout(200);
      await textarea.fill(prompt);
      await page.waitForTimeout(600);

      const countBefore = await page.locator('[data-testid="ai-message-body"]').count();

      // Envia a mensagem
      const submitBtn = page.locator('button[aria-label*="Enviar"], button[aria-label*="Submit"], [data-testid*="submit"]');
      if (await submitBtn.count() > 0 && await submitBtn.first().isVisible() && await submitBtn.first().isEnabled()) {
        await submitBtn.first().click();
      } else {
        await textarea.press('Enter');
      }

      // Aguarda resposta
      const startTime = Date.now();
      let lastText = '';
      let stableCount = 0;
      let finalAnswer = '';

      while (Date.now() - startTime < this.timeout) {
        await page.waitForTimeout(1000);

        const currentCount = await page.locator('[data-testid="ai-message-body"]').count();
        if (currentCount > countBefore) {
          const lastMsg = page.locator('[data-testid="ai-message-body"]').last();
          const text = await lastMsg.evaluate((element) => {
            const answerClone = element.cloneNode(true);

            // Copilot includes inline citation buttons, hidden accessibility text,
            // and source cards inside ai-message-body. Remove those UI-only nodes
            // so the provider returns the model answer instead of page furniture.
            answerClone
              .querySelectorAll('button, a, [aria-hidden="true"], .sr-only')
              .forEach((node) => node.remove());

            return (answerClone.textContent || '')
              .replace(/\u200b/g, '')
              .replace(/[ \t]+/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          });

          if (text && text === lastText && text.trim().length > 0) {
            stableCount++;
            if (stableCount >= 3) {
              finalAnswer = text;
              break;
            }
          } else {
            stableCount = 0;
            lastText = text || '';
          }
        }
      }

      if (!finalAnswer) {
        throw new Error(
          lastText
            ? `Resposta não estabilizou em ${this.timeout}ms. Último texto: ${lastText.slice(0, 200)}`
            : `Nenhuma resposta foi detectada em ${this.timeout}ms.`
        );
      }

      return { output: finalAnswer };

    } catch (err) {
      return {
        error: `Erro no provedor Copilot: ${err.message}`
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
