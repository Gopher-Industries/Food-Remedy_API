import { spawnSync } from 'node:child_process';
import path from 'node:path';

const script = path.resolve(__dirname, '../scripts/validateReleaseConfig.js');
const production = {
  ...process.env,
  EAS_BUILD_PROFILE: 'production',
  EXPO_PUBLIC_API_BASE_URL: 'https://api.foodremedy.invalid',
  EXPO_PUBLIC_CAPTCHA_ENABLED: 'true',
  EXPO_PUBLIC_HCAPTCHA_SITE_KEY: 'site-fixture-123',
  HCAPTCHA_SECRET_KEY: '',
};

function run(overrides: Record<string, string> = {}, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', env: { ...production, ...overrides },
  });
}

describe('release configuration validation', () => {
  it('does not block development or preview EAS builds', () => {
    const result = run({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_API_BASE_URL: '',
      EXPO_PUBLIC_CAPTCHA_ENABLED: '', EXPO_PUBLIC_HCAPTCHA_SITE_KEY: '' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping production release validation');
  });

  it('validates production client configuration without a server secret', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Configuration fingerprint:');
    expect(result.stdout).not.toContain('HCAPTCHA_SECRET_KEY');
  });

  it.each(['http://api.foodremedy.invalid', 'https://192.168.1.5',
    'https://user:pass@api.foodremedy.invalid'])('rejects an unsafe API URL: %s', url => {
    expect(run({ EXPO_PUBLIC_API_BASE_URL: url }).status).toBe(1);
  });

  it('rejects missing production client values and checks the server secret separately', () => {
    expect(run({ EXPO_PUBLIC_HCAPTCHA_SITE_KEY: '' }).status).toBe(1);
    expect(run({}, ['--server-captcha']).status).toBe(1);
    const server = run({ HCAPTCHA_SECRET_KEY: 'fixture-server-value-123' }, ['--server-captcha']);
    expect(server.status).toBe(0);
    expect(server.stdout).not.toContain('fixture-server-value-123');
  });
});
