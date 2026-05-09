import { test, expect } from '@broccolo1d/playwright';

test('renders the Broccoli Control wallet QA fixture surface', async ({ page, walletArtifacts }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Broccoli Control' })).toBeVisible();
  await expect(page.getByTestId('connect-wallet-button')).toBeVisible();
  await expect(page.getByTestId('current-chain')).toContainText('11155111');
  await expect(page.getByTestId('token-address')).toContainText(/^0x[a-fA-F0-9]{40}$/);
  await expect(page.getByTestId('transfer-token-button')).toBeDisabled();

  const screenshot = await walletArtifacts.screenshot('broccoli-control-home');
  const manifest = await walletArtifacts.writeManifest('broccoli-control-home', {
    status: 'verified-ui-ready',
    app: 'broccoli-control',
    package: '@broccolo1d/playwright',
    screenshot: screenshot.split('/').pop(),
  });

  expect(manifest).toContain('broccoli-control-home.json');
});
