import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { serverMessage } from './serverMessage';

/** Build a rejected-write axios error carrying a §4.3 error envelope. */
function envelopeError(status: number, data: unknown): AxiosError {
  const err = new AxiosError('Request failed with status code ' + status);
  err.response = {
    status,
    statusText: '',
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: {} as any,
    data,
  };
  return err;
}

describe('serverMessage', () => {
  it('returns the envelope errorMsg when the response body carries one', () => {
    const err = envelopeError(400, { error: true, errorMsg: 'Slug "home" is reserved.' });
    expect(serverMessage(err, 'Could not save the page.')).toBe('Slug "home" is reserved.');
  });

  it('falls back when a non-axios (network) error carries no envelope', () => {
    expect(serverMessage(new Error('Network Error'), 'Could not save the section.')).toBe(
      'Could not save the section.',
    );
  });

  it('falls back when the axios error has no response body (request never reached the API)', () => {
    const err = new AxiosError('Network Error');
    expect(serverMessage(err, 'Could not save the section.')).toBe('Could not save the section.');
  });

  it('falls back when the envelope has an empty errorMsg', () => {
    const err = envelopeError(500, { error: true, errorMsg: '   ' });
    expect(serverMessage(err, 'fallback text')).toBe('fallback text');
  });

  it('reduces a serialized zod issue array to a readable path: message one-liner', () => {
    const issues = JSON.stringify([
      {
        code: 'too_big',
        maximum: 100,
        type: 'number',
        inclusive: true,
        path: ['sphere_detail', 'radius'],
        message: 'Number must be less than or equal to 100',
      },
    ]);
    const err = envelopeError(400, { error: true, errorMsg: issues });
    expect(serverMessage(err, 'Could not save the section.')).toBe(
      'sphere_detail.radius: Number must be less than or equal to 100',
    );
  });

  it('joins multiple zod issues with a separator rather than dumping the blob', () => {
    const issues = JSON.stringify([
      { path: ['title'], message: 'Required' },
      { path: ['items', 0, 'url'], message: 'Invalid url' },
    ]);
    const err = envelopeError(400, { error: true, errorMsg: issues });
    const out = serverMessage(err, 'fallback');
    expect(out).toBe('title: Required; items.0.url: Invalid url');
    expect(out).not.toContain('{');
  });

  it('handles a prefixed zod array ("Invalid data: [...]") keeping the human prefix', () => {
    const errorMsg =
      'Invalid data: ' + JSON.stringify([{ path: ['sphere_detail'], message: 'Expected object' }]);
    const err = envelopeError(400, { error: true, errorMsg });
    expect(serverMessage(err, 'fallback')).toBe('Invalid data: sphere_detail: Expected object');
  });

  it('handles a ZodError-shaped object with an issues array', () => {
    const errorMsg = JSON.stringify({
      name: 'ZodError',
      issues: [{ path: ['data', 'heading'], message: 'Expected string, received number' }],
    });
    const err = envelopeError(400, { error: true, errorMsg });
    expect(serverMessage(err, 'fallback')).toBe(
      'data.heading: Expected string, received number',
    );
  });

  it('never renders an unreadable JSON blob verbatim — falls back instead', () => {
    // Valid JSON, but not zod-issue shaped (no message fields to extract).
    const err = envelopeError(400, { error: true, errorMsg: '{"foo":{"bar":42}}' });
    const out = serverMessage(err, 'Could not save the section.');
    expect(out).toBe('Could not save the section.');
    expect(out).not.toContain('{');
  });

  it('leaves an ordinary human sentence untouched even when it contains brackets', () => {
    const err = envelopeError(400, { error: true, errorMsg: 'Value must be within [1, 10].' });
    expect(serverMessage(err, 'fallback')).toBe('Value must be within [1, 10].');
  });
});
