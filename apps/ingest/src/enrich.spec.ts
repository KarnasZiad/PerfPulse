import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { countryOf, describeClient, isBot, normalizePath } from './enrich.js';

describe('describeClient', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0',
      { browser: 'Edge', os: 'Windows', device: 'desktop' },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      { browser: 'Safari', os: 'iOS', device: 'mobile' },
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
      { browser: 'Chrome', os: 'iOS', device: 'tablet' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Safari/537.36',
      { browser: 'Samsung Internet', os: 'Android', device: 'tablet' },
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
      { browser: 'Firefox', os: 'macOS', device: 'desktop' },
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 OPR/112.0',
      { browser: 'Opera', os: 'ChromeOS', device: 'desktop' },
    ],
    ['Mozilla/5.0 (X11; Linux x86_64) Gecko', { browser: 'Other', os: 'Linux', device: 'desktop' }],
    ['', { browser: 'Other', os: 'Other', device: 'desktop' }],
  ])('%s', (userAgent, expected) => {
    expect(describeClient(userAgent)).toEqual(expected);
  });

  it('recognizes crawlers and synthetic monitoring', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(
      true,
    );
    expect(isBot('Mozilla/5.0 Chrome-Lighthouse')).toBe(true);
    expect(isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36')).toBe(false);
  });
});

describe('normalizePath', () => {
  it.each([
    ['/orders/18342', '/orders/:id'],
    ['/users/3f2a1c9e-8b4d-4e2f-9a7c-1d2e3f4a5b6c/settings', '/users/:id/settings'],
    ['/files/9f86d081884c7d659a2feaa0c55ad015', '/files/:id'],
    ['/reset/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', '/reset/:id'],
    [
      '/produits/tapis-berbere-artisanal-de-marrakech',
      '/produits/tapis-berbere-artisanal-de-marrakech',
    ],
    ['/search?q=email@example.com#top', '/search'],
    ['/', '/'],
    ['/2026/10/annonce', '/:id/:id/annonce'],
  ])('%s → %s', (path, expected) => {
    expect(normalizePath(path)).toBe(expected);
  });

  it('stays fast on hostile segments', () => {
    const started = performance.now();
    normalizePath(`/${'a'.repeat(510)}`);
    normalizePath(`/${'a1'.repeat(255)}!`);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('countryOf', () => {
  it('accepts ISO country codes only', () => {
    expect(countryOf('MA')).toBe('MA');
    expect(countryOf('XX')).toBeNull();
    expect(countryOf('ma')).toBeNull();
    expect(countryOf(['MA', 'FR'])).toBeNull();
    expect(countryOf(undefined)).toBeNull();
  });
});

describe('loadConfig', () => {
  const env = {
    DATABASE_URL: 'postgresql://perfpulse@localhost/perfpulse',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('applies defaults', () => {
    expect(loadConfig(env)).toMatchObject({
      PORT: 4100,
      RATE_LIMIT_PER_MINUTE: 600,
      STREAM_MAX_LENGTH: 1_000_000,
    });
  });

  it('names the invalid variables', () => {
    expect(() => loadConfig({ ...env, REDIS_URL: 'http://localhost' })).toThrow(/REDIS_URL/);
    expect(() => loadConfig({ ...env, COUNTRY_HEADER: 'CF IPCountry' })).toThrow(/COUNTRY_HEADER/);
  });
});
