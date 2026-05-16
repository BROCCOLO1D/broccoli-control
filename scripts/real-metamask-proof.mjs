#!/usr/bin/env node
import { writeFile, readFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  chainIdToHex,
  importPrivateKeyIntoMetaMaskPage,
  maskEthereumAddress,
  unlockMetaMaskPage,
  verifyMetaMaskActiveAddress,
} from '@broccolo1d/wallet-browser';
import {
  formatWalletQaFailure,
  verifyWalletQaProofManifest,
  writeWalletQaProofManifest,
} from '@broccolo1d/playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zeroAddress = `0x${'00'.repeat(20)}`;

function isNonZeroAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value ?? '') && value.toLowerCase() !== zeroAddress;
}

function firstNonZeroAddress(...values) {
  return values.find(isNonZeroAddress);
}

function maskAddress(value) {
  return value ? maskEthereumAddress(value) : undefined;
}

async function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  const text = await readFile(path, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function resolveMaybeRelative(value, baseDir) {
  if (!value) return undefined;
  return resolve(baseDir, value);
}

function redactError(error) {
  return formatWalletQaFailure(error).replace(/([A-Za-z]:)?\/?(?:[\w.-]+\/){2,}[\w.-]+/g, '[local-path]');
}

async function bodyText(page) {
  if (!page || page.isClosed()) return '';
  return page.locator('body').innerText({ timeout: 2500 }).catch(() => '');
}

async function clickAny(page, patterns, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    for (const pattern of patterns) {
      const locators = [
        page.getByRole('button', { name: pattern }).first(),
        page.locator('button').filter({ hasText: pattern }).first(),
        page.locator('a').filter({ hasText: pattern }).first(),
        page.getByText(pattern).first(),
      ];
      for (const locator of locators) {
        try {
          await locator.waitFor({ state: 'visible', timeout: 400 });
          await locator.click({ timeout: 700 });
          return;
        } catch (error) {
          try {
            await locator.click({ force: true, timeout: 700 });
            return;
          } catch {}
          last = String(error?.message ?? error).slice(0, 120);
        }
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`MetaMask button not found: ${patterns.map(String).join(', ')} (${last})`);
}

async function checkAll(page) {
  async function anyChecked() {
    for (const cb of await page.locator('input[type="checkbox"]').all()) {
      try { if (await cb.isChecked()) return true; } catch {}
    }
    return false;
  }
  for (const cb of await page.locator('input[type="checkbox"]').all()) {
    try {
      if (await cb.isVisible() && !(await cb.isChecked())) {
        await cb.check({ force: true, timeout: 700 });
        await page.waitForTimeout(300);
      }
      if (await anyChecked()) return;
    } catch {}
  }
  const checkboxLike = [
    page.getByRole('checkbox').first(),
    page.getByLabel(/I agree|terms/i).first(),
    page.locator('label').filter({ hasText: /I agree|terms/i }).first(),
    page.getByText(/I agree to MetaMask/i).first(),
  ];
  for (const locator of checkboxLike) {
    if (await anyChecked()) return;
    try {
      await locator.waitFor({ state: 'visible', timeout: 500 });
      const tagName = await locator.evaluate((node) => node.tagName.toLowerCase()).catch(() => '');
      if (tagName === 'input') await locator.check({ force: true, timeout: 700 });
      else await locator.click({ timeout: 700 });
      await page.waitForTimeout(300);
    } catch {}
  }
}

async function getExtensionId(context) {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  return new URL(worker.url()).host;
}

async function findMetaMaskPage(context, extensionId, route = 'home.html') {
  const prefix = `chrome-extension://${extensionId}/`;
  const candidates = context.pages().filter((page) => !page.isClosed() && page.url().startsWith(prefix));
  let page = candidates.find((candidate) => /notification\.html/.test(candidate.url()))
    ?? candidates.find((candidate) => /home\.html/.test(candidate.url()) && !/onboarding\//.test(candidate.url()))
    ?? candidates[0];
  if (!page) {
    page = await context.newPage();
    await page.goto(`${prefix}${route}`, { waitUntil: 'domcontentloaded' });
  }
  await page.bringToFront().catch(() => {});
  return page;
}

async function unlockIfNeeded(page, password) {
  const text = await bodyText(page);
  const hasPasswordInput = Boolean(await page.locator('[data-testid="unlock-password"], input[type="password"]').count().catch(() => 0));
  const hasUnlockSubmit = Boolean(await page.locator('[data-testid="unlock-submit"], button:has-text("Unlock"), button:has-text("Log in")').count().catch(() => 0));
  if (!hasPasswordInput && !hasUnlockSubmit && !/Forgot password|Log in/i.test(text)) return false;
  if (await page.locator('[data-testid="unlock-password"]').count().catch(() => 0)) {
    await unlockMetaMaskPage(page, { expectedAddress: '', password, timeoutMs: 10_000 });
    return true;
  } else {
    let filled = false;
    for (const input of await page.locator('input[type="password"], input').all()) {
      try {
        if (await input.isVisible()) {
          await input.fill(password);
          filled = true;
          break;
        }
      } catch {}
    }
    if (!filled && !hasUnlockSubmit) return false;
  }
  await clickSelector(page, '[data-testid="unlock-submit"]', 3_000)
    .catch(() => clickAny(page, [/^Unlock$/i, /^Log in$/i, /^Submit$/i], 5_000).catch(async () => page.keyboard.press('Enter')));
  await page.waitForTimeout(2_000);
  const postUnlockText = await bodyText(page);
  if (/Your wallet is ready|Done/i.test(postUnlockText)) {
    await clickSelector(page, '[data-testid="onboarding-complete-done"]', 3_000)
      .catch(() => clickAny(page, [/Done/i, /Open wallet/i], 3_000).catch(() => {}));
    await page.waitForTimeout(2_000);
  }
  return true;
}

async function fillSeed(page) {
  const words = 'test test test test test test test test test test test junk'.split(' ');
  if (await page.locator('[data-testid="import-srp__srp-word-0"]').count().catch(() => 0)) {
    for (let i = 0; i < 12; i += 1) {
      await page.locator(`[data-testid="import-srp__srp-word-${i}"]`).fill(words[i]);
    }
    return;
  }
  const visible = [];
  for (const input of await page.locator('input, textarea').all()) {
    try {
      if (await input.isVisible()) visible.push(input);
    } catch {}
  }
  if (visible.length >= 12) {
    for (let i = 0; i < 12; i += 1) await visible[i].fill(words[i]);
    return;
  }
  if (visible.length > 0) {
    await visible[0].fill(words.join(' '));
    return;
  }
  throw new Error('MetaMask seed phrase input was not visible.');
}

async function clickSelector(page, selector, timeout = 5_000) {
  await page.locator(selector).first().click({ timeout });
}

async function setupMetaMask(context, extensionId, password, privateKey) {
  let page = await findMetaMaskPage(context, extensionId);
  await page.waitForTimeout(4_000);
  let text = await bodyText(page);

  if (/Unlock|Forgot password|Log in/i.test(text)) {
    await unlockIfNeeded(page, password);
    return findMetaMaskPage(context, extensionId);
  }

  // Current MetaMask onboarding renders “Let's get started” as a heading, not an
  // action. The first actionable control is the terms checkbox; clicking broad
  // heading/text matches can open the language list and strand automation.
  if (/Let's get started|Get started/i.test(text)) {
    // Heading-only state; keep the terms checkbox untouched until the import
    // branch explicitly selects it exactly once.
    text = await bodyText(page);
  }

  if (/Import an existing wallet|I have an existing wallet/i.test(text)) {
    await clickSelector(page, '[data-testid="onboarding-terms-checkbox"]', 4_000)
      .catch(() => checkAll(page));
    await clickSelector(page, '[data-testid="onboarding-import-wallet"]', 4_000)
      .catch(() => clickAny(page, [/Import an existing wallet/i, /I have an existing wallet/i]));
    await page.waitForTimeout(1_500);
    text = await bodyText(page);
  } else if (/Create a new wallet/i.test(text)) {
    await checkAll(page);
    await clickAny(page, [/Create a new wallet/i]);
    await page.waitForTimeout(1_500);
    text = await bodyText(page);
  }
  if (/No thanks|Help us improve|MetaMetrics/i.test(text)) {
    await clickSelector(page, '[data-testid="metametrics-no-thanks"]', 4_000)
      .catch(() => clickAny(page, [/No thanks/i]));
    await page.waitForTimeout(1_500);
    text = await bodyText(page);
  }
  if (await page.locator('[data-testid="private-key-box"]').count().catch(() => 0)) {
    await page.locator('[data-testid="private-key-box"]').fill(privateKey);
    await page.locator('[data-testid="create-password-new"]').fill(password);
    await page.locator('[data-testid="create-password-confirm"]').fill(password);
    await checkAll(page);
    await clickSelector(page, '[data-testid="import-wallet-button"]', 6_000)
      .catch(() => clickAny(page, [/Import my wallet/i, /Import/i]));
    await page.waitForTimeout(4_000);
    text = await bodyText(page);
  }
  if (/Continue with Google|Use Secret Recovery Phrase|Continue with Apple/i.test(text)) {
    await clickAny(page, [/Use Secret Recovery Phrase/i, /Import using Secret Recovery Phrase/i]);
    await page.waitForTimeout(1_500);
    text = await bodyText(page);
  } else if (/I have an existing wallet/i.test(text)) {
    await checkAll(page);
    await clickAny(page, [/I have an existing wallet/i]);
    await page.waitForTimeout(1_500);
    text = await bodyText(page);
  }
  if (/Secret Recovery Phrase|Recovery Phrase|Enter your Secret/i.test(text)) {
    await fillSeed(page);
    if (await page.locator('[data-testid="create-password-new"]').count().catch(() => 0)) {
      await page.locator('[data-testid="create-password-new"]').fill(password);
      await page.locator('[data-testid="create-password-confirm"]').fill(password);
      await checkAll(page);
    }
    await clickSelector(page, '[data-testid="import-srp-confirm"]', 3_000)
      .catch(() => clickAny(page, [/Confirm Secret Recovery Phrase/i, /Continue/i, /Next/i]));
    await page.waitForTimeout(2_500);
    text = await bodyText(page);
  }
  if (/password/i.test(text)) {
    const visible = [];
    for (const input of await page.locator('input').all()) {
      try {
        if (await input.isVisible()) visible.push(input);
      } catch {}
    }
    for (let i = 0; i < Math.min(2, visible.length); i += 1) await visible[i].fill(password);
    await checkAll(page);
    await clickAny(page, [/Import my wallet/i, /Create a new wallet/i, /Continue/i, /Next/i, /Import/i, /Create/i]);
    await page.waitForTimeout(4_000);
  }
  for (let i = 0; i < 10; i += 1) {
    page = await findMetaMaskPage(context, extensionId).catch(() => page);
    text = await bodyText(page);
    if (/Your wallet is ready|Open wallet/i.test(text)) {
      await clickSelector(page, '[data-testid="onboarding-complete-done"]', 3_000)
        .catch(() => clickAny(page, [/Open wallet/i, /Done/i], 3_000).catch(() => page.mouse.click(640, 720)));
      await page.waitForTimeout(3_000);
      continue;
    }
    if (/Pin MetaMask|MetaMask install is complete/i.test(text)) {
      await clickSelector(page, '[data-testid="pin-extension-next"]', 2_000)
        .catch(() => clickSelector(page, '[data-testid="pin-extension-done"]', 2_000)
        .catch(() => clickAny(page, [/Next/i, /Done/i], 2_000).catch(() => {})));
      await page.waitForTimeout(1_500);
      continue;
    }
    if (/Got it|Done|Next|Skip|Remind me later|Continue/i.test(text)) {
      await clickAny(page, [/Got it/i, /Done/i, /Next/i, /Skip/i, /Remind me later/i, /Continue/i], 2_000).catch(() => {});
      await page.waitForTimeout(1_000);
    }
  }
  page = await findMetaMaskPage(context, extensionId);
  await unlockIfNeeded(page, password);
  return page;
}

async function importPrivateKeyIfNeeded(page, context, extensionId, privateKey, expectedAccount, password) {
  await unlockIfNeeded(page, password);
  for (let i = 0; i < 8; i += 1) {
    const homeText = (await bodyText(page)).toLowerCase();
    const maskedHome = maskAddress(expectedAccount)?.toLowerCase();
    if (expectedAccount) {
      const lowerExpected = expectedAccount.toLowerCase();
      if (homeText.includes(lowerExpected)) return expectedAccount;
      if (homeText.includes(lowerExpected.slice(0, 6)) && homeText.includes(lowerExpected.slice(-5))) return expectedAccount;
    }
    if (maskedHome && homeText.includes(maskedHome.replace('…', ''))) return expectedAccount;
    await page.waitForTimeout(500);
  }
  const current = (await bodyText(page)).toLowerCase();
  await verifyMetaMaskActiveAddress(page, expectedAccount).then(() => undefined).catch(() => undefined);
  const masked = maskAddress(expectedAccount)?.toLowerCase();
  if (expectedAccount) {
    const lowerExpected = expectedAccount.toLowerCase();
    if (current.includes(lowerExpected)) return expectedAccount;
    if (current.includes(lowerExpected.slice(0, 6)) && current.includes(lowerExpected.slice(-5))) return expectedAccount;
  }
  if (masked && current.includes(masked.replace('…', ''))) return expectedAccount;

  const routes = [
    `chrome-extension://${extensionId}/home.html#/add-wallet-page`,
    `chrome-extension://${extensionId}/home.html#/new-account/import`,
    `chrome-extension://${extensionId}/home.html#new-account/import`,
  ];
  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1_500);
    if (/private key/i.test(await bodyText(page))) break;
  }
  let text = await bodyText(page);
  if (!/private key/i.test(text)) {
    await importPrivateKeyIntoMetaMaskPage(page, { expectedAddress: expectedAccount, privateKey, password, timeoutMs: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(1_500);
    text = await bodyText(page);
  }
  if (!/private key/i.test(text)) {
    await page.goto(`chrome-extension://${extensionId}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    for (const locator of [
      page.locator('[data-testid="account-menu-name"]').first(),
      page.getByText(/OWNER|Account 1/i).first(),
      page.getByRole('button', { name: /OWNER|Account 1/i }).first(),
      page.locator('[data-testid="account-picker"]').first(),
    ]) {
      try { await locator.click({ timeout: 1_500 }); break; } catch {}
    }
    await clickAny(page, [/Add account or hardware wallet/i, /Add account/i], 3_000).catch(() => {});
    await page.waitForTimeout(1_000);
    await clickAny(page, [/Import account/i, /Import private key/i, /Private key/i], 4_000).catch(() => {});
    await page.waitForTimeout(1_500);
    text = await bodyText(page);
  }
  if (!/private key/i.test(text)) {
    throw new Error(`MetaMask import-private-key UI was not reachable. Visible text: ${text.slice(0, 220)}`);
  }
  let filled = false;
  for (const input of await page.locator('input, textarea').all()) {
    try {
      if (await input.isVisible()) {
        await input.fill(privateKey);
        filled = true;
        break;
      }
    } catch {}
  }
  if (!filled) throw new Error('MetaMask private-key field was not visible.');
  await clickAny(page, [/Import/i], 6_000);
  await page.waitForTimeout(4_000);
  await findMetaMaskPage(context, extensionId);
  return expectedAccount;
}

async function approveMetaMaskPrompts(context, extensionId) {
  for (let i = 0; i < 20; i += 1) {
    const page = await findMetaMaskPage(context, extensionId).catch(() => undefined);
    if (!page) break;
    const text = await bodyText(page);
    if (!/Next|Connect|Confirm|Approve|Switch|Select all/i.test(text)) {
      await page.waitForTimeout(800);
      continue;
    }
    await checkAll(page);
    await clickAny(page, [/Select all/i], 1_500).catch(() => {});
    await clickAny(page, [/Next/i, /Connect/i, /Confirm/i, /Approve/i, /Switch/i], 3_000).catch(() => {});
    if (page.isClosed()) break;
    await page.waitForTimeout(1_500).catch(() => {});
  }
}

async function connectDapp(context, extensionId, appOrigin, expectedAccount, expectedChainId, artifactDir) {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(appOrigin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('heading', { name: 'Broccoli Control' }).waitFor({ timeout: 20_000 });

  await page.getByTestId('connect-wallet-button').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="connect-wallet-button"]');
    return button instanceof HTMLButtonElement && !button.disabled && /connect wallet/i.test(button.textContent ?? '');
  }, null, { timeout: 20_000 });
  let connectError;
  const connectRequest = page.getByTestId('connect-wallet-button').click({ timeout: 5_000 }).catch((error) => { connectError = error; });
  await page.waitForTimeout(500);
  await approveMetaMaskPrompts(context, extensionId);
  await Promise.race([connectRequest, page.waitForTimeout(2_000)]).catch(() => undefined);
  await page.bringToFront();
  const connected = await page.waitForFunction((expected) => {
    const value = document.querySelector('[data-testid="connected-account"]')?.textContent?.trim().toLowerCase();
    return value === String(expected).toLowerCase();
  }, expectedAccount, { timeout: 20_000 }).then(() => true).catch(() => false);
  if (!connected) {
    const diagnostics = await page.evaluate(async () => {
      const ethereum = globalThis.ethereum;
      const statusText = document.body?.innerText?.slice(0, 1_000) ?? '';
      if (!ethereum?.request) return { hasEthereum: false, statusText };
      const accounts = await ethereum.request({ method: 'eth_accounts' }).catch((error) => ({ error: String(error?.message ?? error) }));
      const chainId = await ethereum.request({ method: 'eth_chainId' }).catch((error) => ({ error: String(error?.message ?? error) }));
      return { hasEthereum: true, accounts, chainId, statusText };
    }).catch((error) => ({ pageDiagnosticError: String(error?.message ?? error) }));
    const extensionPages = [];
    for (const candidate of context.pages()) {
      if (!candidate.isClosed() && candidate.url().startsWith(`chrome-extension://${extensionId}/`)) {
        const index = extensionPages.length;
        const text = await bodyText(candidate);
        extensionPages.push({ url: candidate.url(), text: text.slice(0, 1_000) });
        await candidate.screenshot({ path: join(artifactDir, `extension-diagnostic-${index}.png`), fullPage: true }).catch(() => {});
      }
    }
    await writeFile(join(artifactDir, 'dapp-connect-diagnostics.public.json'), `${JSON.stringify({
      connectError: connectError ? String(connectError.message ?? connectError) : undefined,
      diagnostics,
      extensionPages,
    }, null, 2)}\n`).catch(() => {});
    throw new Error(`Dapp did not render connected account after MetaMask approval. Provider diagnostics: ${JSON.stringify(diagnostics).slice(0, 800)}`);
  }

  const chainTextBeforeSwitch = (await page.getByTestId('current-chain').innerText()).trim();
  if (Number(chainTextBeforeSwitch) !== Number(expectedChainId)) {
    const switchRequest = page.evaluate(async ({ chainIdHex }) => {
      if (!globalThis.ethereum) return;
      await globalThis.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    }, { chainIdHex: chainIdToHex(expectedChainId) }).catch(() => undefined);
    await approveMetaMaskPrompts(context, extensionId);
    await Promise.race([switchRequest, page.waitForTimeout(2_000)]).catch(() => undefined);
  }
  await page.waitForTimeout(2_000);

  const actualAccount = (await page.getByTestId('connected-account').innerText()).trim();
  const chainText = (await page.getByTestId('current-chain').innerText()).trim();
  const actualChainId = Number(chainText);
  const accountMatches = actualAccount.toLowerCase() === expectedAccount.toLowerCase();
  const chainMatches = actualChainId === Number(expectedChainId);
  if (!accountMatches || !chainMatches) {
    throw new Error(`Connected wallet mismatch: account=${maskAddress(actualAccount)} expected=${maskAddress(expectedAccount)} chain=${actualChainId} expectedChain=${expectedChainId}`);
  }

  const redactedScreenshot = join(artifactDir, 'real-metamask-connected-redacted.png');
  await page.evaluate((masked) => {
    const account = document.querySelector('[data-testid="connected-account"]');
    if (account) account.textContent = masked;
    for (const input of document.querySelectorAll('input')) input.setAttribute('value', '');
  }, maskAddress(actualAccount));
  await page.screenshot({ path: redactedScreenshot, fullPage: true });

  const mm = await findMetaMaskPage(context, extensionId);
  const mmScreenshot = join(artifactDir, 'real-metamask-extension.png');
  await mm.screenshot({ path: mmScreenshot, fullPage: true }).catch(() => undefined);

  return { page, actualAccount, actualChainId, redactedScreenshot, mmScreenshot };
}

export async function runRealMetaMaskProof(options = {}) {
  const envFile = options.envFile ?? process.env.WALLET_QA_ENV_FILE ?? join(repoRoot, '.env');
  const fileEnv = await readEnvFile(envFile);
  const env = { ...fileEnv, ...process.env, ...options.env };
  const envBaseDir = dirname(envFile);
  const expectedAccount = firstNonZeroAddress(options.expectedAccount, env.SEPOLIA_WALLET_ADDRESS, env.NEXT_PUBLIC_DEPLOYER_ADDRESS);
  const privateKey = env.SEPOLIA_WALLET_PRIVATE_KEY;
  const password = env.METAMASK_PASSWORD;
  const extensionDir = resolveMaybeRelative(env.METAMASK_EXTENSION_DIR, envBaseDir);
  const profileDir = resolveMaybeRelative(env.WALLET_PROFILE_DIR ?? '.wallet-artifacts/metamask-profile', envBaseDir);
  const appOrigin = options.appOrigin ?? env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
  const expectedChainId = Number(options.expectedChainId ?? env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);
  const artifactDir = resolve(options.artifactDir ?? join(repoRoot, '.wallet-artifacts', 'real-metamask-proof', new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')));
  const promoteDocs = Boolean(options.promoteDocs ?? env.WALLET_QA_PROMOTE_DOCS === '1');

  await mkdir(artifactDir, { recursive: true });
  const publicSummary = {
    status: 'started',
    artifactDir,
    expectedAccount: maskAddress(expectedAccount),
    expectedChainId,
    extensionDirBasename: extensionDir ? basename(extensionDir) : undefined,
    profileDirBasename: profileDir ? basename(profileDir) : undefined,
  };

  if (!isNonZeroAddress(expectedAccount) || !privateKey || !password || !extensionDir || !existsSync(extensionDir)) {
    const missing = [
      !isNonZeroAddress(expectedAccount) && 'expectedAccount, SEPOLIA_WALLET_ADDRESS, or NEXT_PUBLIC_DEPLOYER_ADDRESS (valid non-zero 0x address)',
      !privateKey && 'SEPOLIA_WALLET_PRIVATE_KEY',
      !password && 'METAMASK_PASSWORD',
      (!extensionDir || !existsSync(extensionDir)) && 'METAMASK_EXTENSION_DIR',
    ].filter(Boolean);
    throw new Error(`Real MetaMask proof missing required local configuration: ${missing.join(', ')}`);
  }

  let context;
  try {
    await mkdir(profileDir, { recursive: true });
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    });
    await context.newPage().then((page) => page.goto('about:blank')).catch(() => {});
    const extensionId = await getExtensionId(context);
    let mm = await findMetaMaskPage(context, extensionId);
    mm = await setupMetaMask(context, extensionId, password, privateKey);
    const proofAccount = await importPrivateKeyIfNeeded(mm, context, extensionId, privateKey, expectedAccount, password);
    const result = await connectDapp(context, extensionId, appOrigin, proofAccount, expectedChainId, artifactDir);

    const manifestPath = await writeWalletQaProofManifest({
      artifactDir,
      status: 'connected',
      origin: appOrigin,
      account: result.actualAccount,
      chainId: result.actualChainId,
      attachments: [
        { label: 'dapp-connected-redacted', path: result.redactedScreenshot, contentType: 'image/png' },
        { label: 'metamask-extension-ui', path: result.mmScreenshot, contentType: 'image/png' },
      ],
      notes: [
        'Generated by scripts/real-metamask-proof.mjs with a headed Chromium MetaMask extension.',
        'Screenshots are local-first; dapp account text is DOM-redacted before the promoted screenshot is captured.',
      ],
    });
    await verifyWalletQaProofManifest(artifactDir);
    const summary = { ...publicSummary, status: 'connected', manifest: basename(manifestPath), account: maskAddress(result.actualAccount), chainId: result.actualChainId };
    await writeFile(join(artifactDir, 'RESULT.public.json'), `${JSON.stringify(summary, null, 2)}\n`);

    if (promoteDocs) {
      const docsDir = join(repoRoot, 'docs/assets/wallet-qa');
      await mkdir(docsDir, { recursive: true });
      const promotedImage = join(docsDir, 'real-metamask-connected-redacted.png');
      const promotedManifest = join(docsDir, 'real-metamask-proof.json');
      await copyFile(result.redactedScreenshot, promotedImage);
      await writeWalletQaProofManifest({
        artifactDir: docsDir,
        manifestName: 'real-metamask-proof.json',
        status: 'connected',
        origin: appOrigin,
        account: result.actualAccount,
        chainId: result.actualChainId,
        attachments: [{ label: 'dapp-connected-redacted', path: promotedImage, contentType: 'image/png' }],
        notes: ['Public-safe derivative from a headed Chromium + MetaMask run; full address is masked in the manifest and screenshot.'],
      });
      await verifyWalletQaProofManifest(docsDir, 'real-metamask-proof.json');
      summary.promoted = [basename(promotedImage), basename(promotedManifest)];
    }

    return summary;
  } catch (error) {
    const failure = redactError(error);
    await writeFile(join(artifactDir, 'ERROR.public.txt'), `${failure}\n`).catch(() => {});
    await writeWalletQaProofManifest({
      artifactDir,
      status: 'failed',
      origin: appOrigin,
      account: expectedAccount,
      chainId: expectedChainId,
      failure,
      notes: ['Real MetaMask proof failed before a verified connection. Raw artifacts remain ignored under .wallet-artifacts.'],
    }).catch(() => {});
    throw new Error(failure);
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRealMetaMaskProof({ promoteDocs: process.argv.includes('--promote-docs') })
    .then((summary) => {
      console.log(JSON.stringify({ ...summary, artifactDir: '[local .wallet-artifacts path]' }, null, 2));
    })
    .catch((error) => {
      console.error(redactError(error));
      process.exitCode = 1;
    });
}
