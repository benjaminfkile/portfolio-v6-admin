import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinkEditor from './LinkEditor';
import type { Link } from '../../types/content';

function Harness({ initial = [] as Link[] }: { initial?: Link[] }) {
  const [links, setLinks] = useState<Link[]>(initial);
  return (
    <>
      <LinkEditor value={links} onChange={setLinks} />
      <output data-testid="json">{JSON.stringify(links)}</output>
    </>
  );
}

const VALIDATION_MESSAGE = 'Enter a URL, email, or phone number';

describe('LinkEditor', () => {
  it('shows an empty state and adds a blank link row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('No links yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add link/i }));
    expect(screen.getByTestId('link-row')).toBeInTheDocument();
  });

  it('flags a required, empty label', () => {
    render(<Harness initial={[{ type: 'repo', label: '', url: 'https://x.com' }]} />);
    expect(screen.getByText('Label is required')).toBeInTheDocument();
  });

  it('rejects a non-allowlisted url scheme and accepts an https one', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ type: 'repo', label: 'API', url: 'javascript:alert(1)' }]} />);

    expect(screen.getByText(VALIDATION_MESSAGE)).toBeInTheDocument();

    const urlInput = screen.getByLabelText('URL');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://good.example.com');
    expect(screen.queryByText(VALIDATION_MESSAGE)).not.toBeInTheDocument();
  });

  it('edits a label through onChange', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ type: 'repo', label: '', url: 'https://x.com' }]} />);

    // The Label field is `required`, so its <label> text is "Label *" — match loosely.
    await user.type(screen.getByLabelText(/^Label/), 'Gateway');
    expect(JSON.parse(screen.getByTestId('json').textContent!)[0].label).toBe('Gateway');
  });

  it('removes a link row', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { type: 'repo', label: 'One', url: 'https://one.com' },
          { type: 'prod', label: 'Two', url: 'https://two.com' },
        ]}
      />,
    );
    expect(screen.getAllByTestId('link-row')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /remove link 1/i }));
    const rows = screen.getAllByTestId('link-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByLabelText(/^Label/)).toHaveValue('Two');
  });

  it('auto-prefixes a bare email with mailto: on blur', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ type: 'other', label: 'Contact', url: '' }]} />);

    const urlInput = screen.getByLabelText('URL');
    await user.type(urlInput, 'ben@example.com');
    // No validation error while typing — validateLink normalizes before checking.
    expect(screen.queryByText(VALIDATION_MESSAGE)).not.toBeInTheDocument();

    await user.tab(); // blur the field
    expect(JSON.parse(screen.getByTestId('json').textContent!)[0].url).toBe(
      'mailto:ben@example.com',
    );
  });

  it('auto-prefixes a bare phone with tel: and a dialable form on blur', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ type: 'other', label: 'Call', url: '' }]} />);

    const urlInput = screen.getByLabelText('URL');
    await user.type(urlInput, '(406) 555-1234');
    await user.tab();
    expect(JSON.parse(screen.getByTestId('json').textContent!)[0].url).toBe('tel:4065551234');
  });

  it('preserves a leading + and strips display characters from a phone', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ type: 'other', label: 'Call', url: '' }]} />);

    const urlInput = screen.getByLabelText('URL');
    await user.type(urlInput, '+1 (406) 555-1234');
    await user.tab();
    expect(JSON.parse(screen.getByTestId('json').textContent!)[0].url).toBe('tel:+14065551234');
  });

  it('leaves an explicit mailto:/tel:/https URL untouched on blur', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { type: 'other', label: 'Mail', url: 'mailto:already@set.com' },
          { type: 'other', label: 'Call', url: 'tel:+15551234' },
          { type: 'repo', label: 'Web', url: 'https://example.com' },
        ]}
      />,
    );

    for (const input of screen.getAllByLabelText('URL')) {
      await user.click(input);
      await user.tab();
    }

    const stored = JSON.parse(screen.getByTestId('json').textContent!);
    expect(stored.map((l: Link) => l.url)).toEqual([
      'mailto:already@set.com',
      'tel:+15551234',
      'https://example.com',
    ]);
  });

  it('still flags javascript: after blur (no auto-prefix rescue)', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ type: 'other', label: 'Bad', url: '' }]} />);

    const urlInput = screen.getByLabelText('URL');
    await user.type(urlInput, 'javascript:alert(1)');
    await user.tab();
    expect(JSON.parse(screen.getByTestId('json').textContent!)[0].url).toBe('javascript:alert(1)');
    expect(screen.getByText(VALIDATION_MESSAGE)).toBeInTheDocument();
  });
});
