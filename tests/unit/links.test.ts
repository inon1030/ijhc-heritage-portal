import { describe, expect, it } from 'vitest';
import { isPrivateAddress, isVideoHost, parseTarget } from '@/lib/links/policy';

/**
 * The address guard.
 *
 * This is the only place in the archive where the *server* makes a request to
 * somewhere a stranger chose, and the server sits inside a network a visitor
 * does not. It can reach the cloud metadata endpoint, localhost, and any
 * private subnet the platform is on. Getting this wrong does not produce a bad
 * record — it produces an exfiltrated credential.
 *
 * So the cases here are the ones an attacker would actually try, not the ones
 * that are convenient to write.
 */

describe('what counts as the public internet', () => {
  it('lets a public address through', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '142.250.185.78', '93.184.216.34']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it('refuses loopback', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('127.13.2.9')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
  });

  it('refuses the cloud metadata endpoint', () => {
    // 169.254.169.254 is where AWS, GCP and Azure all serve instance
    // credentials to anything that asks from inside. It is the single address
    // this whole function exists for.
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
  });

  it('refuses every private range', () => {
    for (const ip of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.1', '192.168.1.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('allows the public addresses that merely look private', () => {
    // 172.15 and 172.32 are outside the private block; a range check written
    // as "starts with 172" would wrongly refuse real sites.
    expect(isPrivateAddress('172.15.0.1')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('192.169.1.1')).toBe(false);
  });

  it('refuses carrier-grade NAT, this-network, multicast and reserved', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
    expect(isPrivateAddress('255.255.255.255')).toBe(true);
  });

  it('refuses IPv6 unique-local and link-local', () => {
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });

  it('refuses anything it cannot parse', () => {
    // Failing closed. An address this cannot read is one it cannot vouch for.
    for (const junk of ['', 'not-an-ip', '10.0.0', '1.2.3.4.5', '999.1.1.1']) {
      expect(isPrivateAddress(junk)).toBe(true);
    }
  });
});

describe('what counts as a readable address', () => {
  it('accepts an ordinary web address', () => {
    const result = parseTarget('https://www.tabletmag.com/sections/history/articles/sassoon');
    expect('url' in result).toBe(true);
  });

  it('refuses a scheme that is not the web', () => {
    // file: would read the server's own disk; gopher: and friends are how a
    // fetch gets pointed at a protocol nobody thought about.
    for (const raw of ['file:///etc/passwd', 'gopher://x/1', 'ftp://x/y', 'javascript:alert(1)']) {
      const result = parseTarget(raw);
      expect('rejection' in result && result.rejection.code).toBe('bad_url');
    }
  });

  it('refuses credentials in the address', () => {
    // Otherwise the server is being asked to authenticate somewhere on a
    // stranger's behalf and hand the result back as an archive record.
    const result = parseTarget('https://user:secret@example.org/page');
    expect('rejection' in result && result.rejection.code).toBe('bad_url');
  });

  it('refuses what is not an address at all', () => {
    for (const raw of ['', '   ', 'just some words']) {
      expect('rejection' in parseTarget(raw)).toBe(true);
    }
  });
});

describe('videos are recognised, not watched', () => {
  it('knows the YouTube hosts', () => {
    for (const raw of [
      'https://www.youtube.com/watch?v=abc',
      'https://youtu.be/abc',
      'https://m.youtube.com/watch?v=abc',
    ]) {
      const result = parseTarget(raw);
      expect('url' in result && isVideoHost(result.url)).toBe(true);
    }
  });

  it('does not mistake a lookalike host for YouTube', () => {
    // youtube.com.evil.test would otherwise be handed to the oEmbed path and
    // treated as a trusted description of a video.
    const result = parseTarget('https://youtube.com.evil.test/watch?v=abc');
    expect('url' in result && isVideoHost(result.url)).toBe(false);
  });
});
