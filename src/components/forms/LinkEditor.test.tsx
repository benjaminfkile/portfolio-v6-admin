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

  it('rejects a non-http(s) url and accepts an https one', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ type: 'repo', label: 'API', url: 'javascript:alert(1)' }]} />);

    expect(screen.getByText('Enter an http(s) URL')).toBeInTheDocument();

    const urlInput = screen.getByLabelText('URL');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://good.example.com');
    expect(screen.queryByText('Enter an http(s) URL')).not.toBeInTheDocument();
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
});
