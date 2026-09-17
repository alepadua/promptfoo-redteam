import { spawn } from 'child_process';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROFILE_DIR = path.join(__dirname, '.rovo-profile');

// Fila global (Mutex) para garantir execução estritamente sequencial
let lockQueue = Promise.resolve();

export default class RovoPlaywrightProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'atlassian-rovo-playwright';
    const config = options.config || {};
    this.timeout = config.timeout || 60000;
    this.tenantUrl = config.tenantUrl || process.env.ATLASSIAN_URL || 'https://alexandrepadua91.atlassian.net';
    this.profileDir = config.profileDir || DEFAULT_PROFILE_DIR;
    this.cdpPort = config.cdpPort || 9222;

    // Seletores configuráveis com fallbacks inteligentes para o Atlassian Rovo
    this.selectors = {
      // Gatilho para abrir o chat do Rovo se estiver fechado
      rovoTrigger: config.rovoTrigger || [
        '[data-testid="rovo-chat-trigger"]',
        'button[aria-label*="Rovo"]',
        'button[aria-label*="Atlassian Intelligence"]',
        '[data-testid="atlassian-intelligence-trigger"]',
        'button:has-text("Rovo")',
        'button:has-text("Ask Rovo")'
      ].join(', '),

      // Caixa de texto do Rovo (pode ser textarea ou div contenteditable do Atlassian editor)
      input: config.inputSelector || [
        'textarea[data-testid*="rovo"]',
        'textarea[placeholder*="Rovo"]',
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="Perguntar"]',
        '[data-testid="rovo-chat-input"]',
        '[data-testid="ai-chat-input"]',
        'div[contenteditable="true"][data-testid*="rovo"]',
        'div[contenteditable="true"][role="textbox"]',
        'textarea'
      ].join(', '),

      // Botão de envio
      submit: config.submitSelector || [
        'button[data-testid*="send"]',
        'button[data-testid*="submit"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="Enviar"]',
        'button[type="submit"]'
      ].join(', '),

      // Container de resposta do Rovo
      response: config.responseSelector || [
        '[data-testid*="rovo-message"]',
        '[data-testid*="agent-message"]',
        '[data-testid*="ai-message"]',
        '[data-testid*="chat-message-response"]',
        '.rovo-chat-message-response',
        '[role="log"] [data-testid*="message"]',
        '[data-testid="chat-message"]'
      ].join(', '),

      // Botão de novo chat / limpar histórico
      newChat: config.newChatSelector || [
        'button[data-testid*="new-chat"]',
        'button[aria-label*="New chat"]',
        'button[aria-label*="Novo chat"]',
        'button[aria-label*="Clear"]',
        'button:has-text("New chat")'
      ].join(', ')
    };
  }

  id() {
    return this.providerId;
  }

  async ensureChrome() {
    try {
      const res = await fetch(`http://localhost:${this.cdpPort}/json/version`);
      if (res.ok) return;
    } catch (_) {}

    spawn('/usr/bin/google-chrome', [
      `--remote-debugging-port=${this.cdpPort}`,
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      this.tenantUrl
    ], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const res = await fetch(`http://localhost:${this.cdpPort}/json/version`);
        if (res.ok) return;
      } catch (_) {}
    }
  }

  async callApi(prompt, context) {
    return new Promise((resolve) => {
      lockQueue = lockQueue
        .then(() => this.executeTest(prompt, context))
        .then(resolve)
        .catch(err => resolve({ error: `Erro na execução Rovo: ${err.message}` }));
    });
  }

  async executeTest(prompt, context) {
    let browser;
    try {
      await this.ensureChrome();

      browser = await chromium.connectOverCDP(`http://localhost:${this.cdpPort}`);
      const browserContext = browser.contexts()[0];
      const pages = browserContext.pages();

      // Encontra a aba do Atlassian ou navega até o tenant
      let page = pages.find(p => p.url().includes('atlassian.net') || p.url().includes('atlassian.com'));
      if (!page) {
        page = await browserContext.newPage();
        await page.goto(this.tenantUrl, { waitUntil: 'domcontentloaded' });
      }

      await page.bringToFront();

      // 1. Abrir chat do Rovo se ainda não estiver aberto na tela
      try {
        const inputVisible = await page.locator(this.selectors.input).first().isVisible();
        if (!inputVisible) {
          const trigger = page.locator(this.selectors.rovoTrigger).first();
          if (await trigger.isVisible()) {
            await trigger.click();
            await page.waitForTimeout(1000);
          }
        }
      } catch (_) {}

      // 2. Iniciar novo chat limpo para o teste (se botão estiver disponível)
      try {
        const newChatBtn = page.locator(this.selectors.newChat).first();
        if (await newChatBtn.isVisible()) {
          await newChatBtn.click();
          await page.waitForTimeout(1000);
        }
      } catch (_) {}

      // 3. Localizar a caixa de entrada
      const inputElement = page.locator(this.selectors.input).first();
      await inputElement.waitFor({ state: 'visible', timeout: 25000 });

      // 4. Preenchimento seguro (compatível com textarea e div contenteditable do Jira/Confluence)
      await inputElement.click();
      await page.waitForTimeout(200);

      const isContentEditable = await inputElement.evaluate(el => el.isContentEditable);
      if (isContentEditable) {
        await inputElement.evaluate((el, text) => {
          el.innerText = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, prompt);
      } else {
        await inputElement.fill(prompt);
      }
      await page.waitForTimeout(600);

      // Quantidade de mensagens antes do envio
      const countBefore = await page.locator(this.selectors.response).count();

      // 5. Enviar a mensagem
      const submitBtn = page.locator(this.selectors.submit).first();
      if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
        await submitBtn.click();
      } else {
        await inputElement.press('Enter');
      }

      // 6. Aguardar estabilização da resposta
      const startTime = Date.now();
      let lastText = '';
      let stableCount = 0;
      let finalAnswer = '';

      while (Date.now() - startTime < this.timeout) {
        await page.waitForTimeout(1000);

        const currentCount = await page.locator(this.selectors.response).count();
        if (currentCount > countBefore) {
          const lastMsg = page.locator(this.selectors.response).last();
          const text = await lastMsg.evaluate((element) => {
            const clone = element.cloneNode(true);
            // Remove botões de feedback, links de fontes, elementos de acessibilidade
            clone
              .querySelectorAll('button, [aria-hidden="true"], .sr-only, [data-testid*="citation"]')
              .forEach(node => node.remove());

            return (clone.textContent || '')
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
            ? `Resposta do Rovo não estabilizou em ${this.timeout}ms. Último texto: ${lastText.slice(0, 200)}`
            : `Nenhuma resposta foi detectada do Rovo em ${this.timeout}ms.`
        );
      }

      return { output: finalAnswer };

    } catch (err) {
      return {
        error: `Erro no provedor Atlassian Rovo: ${err.message}`
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
