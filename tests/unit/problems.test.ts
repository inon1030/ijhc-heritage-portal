import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/problems/record', () => ({ recordProblem: vi.fn(async () => {}) }));

import { PROBLEM_CODE, describeThrown, pathOnly, problemCode } from '@/lib/problems/code';
import { unexpected } from '@/lib/api';
import { recordProblem } from '@/lib/problems/record';

describe('the problem log (0031)', () => {
  it('makes codes a person can read aloud', () => {
    for (let i = 0; i < 200; i++) expect(problemCode()).toMatch(PROBLEM_CODE);
  });

  it('never keeps what follows the question mark — a receipt link carries its secret there', () => {
    expect(pathOnly('https://x.org/receipt/abc?token=SECRET#top')).toBe('/receipt/abc');
    expect(pathOnly('/upload?x=1')).toBe('/upload');
    expect(pathOnly(null)).toBeNull();
  });

  it('describes anything thrown', () => {
    expect(describeThrown(new Error('boom')).message).toBe('boom');
    expect(describeThrown('plain').message).toBe('plain');
    expect(describeThrown({ a: 1 }).message).toBe('{"a":1}');
  });

  it('gives a server failure a code, in the answer and in the log', async () => {
    const response = unexpected(new Error('db down'), '/api/test');
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error.ref).toMatch(PROBLEM_CODE);
    expect(body.error.message).toContain(`(${body.error.ref})`);
    expect(body.error.message).not.toContain('db down');
    await Promise.resolve();
    expect(recordProblem).toHaveBeenCalledWith(
      expect.objectContaining({ code: body.error.ref, source: 'server', place: '/api/test', message: 'db down' }),
    );
  });
});
