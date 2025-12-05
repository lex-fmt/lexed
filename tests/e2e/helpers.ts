import { _electron as electron, type Page } from '@playwright/test';

export async function launchApp(extraArgs: string[] = []) {
  const app = await electron.launch({
    args: ['.', ...extraArgs],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      LEX_DISABLE_SINGLE_INSTANCE_LOCK: '1',
      VITE_DEV_SERVER_URL: process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173',
    },
  });
  app.process().stdout?.on('data', (data) => console.log(`Electron stdout: ${data}`));
  app.process().stderr?.on('data', (data) => console.log(`Electron stderr: ${data}`));
  return app;
}

type LexTestWindow = Window & {
  lexTest?: {
    openFixture: (fixtureName: string) => Promise<{ path: string; content: string }>;
  };
};

export async function openFixture(page: Page, fixtureName: string) {
  await page.waitForFunction(
    () => Boolean((window as LexTestWindow).lexTest),
    null,
    { timeout: 5000 }
  );
  return await page.evaluate(async (name) => {
    const scopedWindow = window as LexTestWindow;
    if (!scopedWindow.lexTest) {
      throw new Error('lexTest helpers not available');
    }
    return scopedWindow.lexTest.openFixture(name);
  }, fixtureName);
}
