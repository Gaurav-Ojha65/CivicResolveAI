import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IntakeSafeguardInspector } from '../../src/features/grievances/components/IntakeSafeguardInspector';

describe('intake guidance', () => {
  it('uses the draft word count without inventing a prediction or quality score', () => {
    const view = render(<IntakeSafeguardInspector wordCount={0} hasPii={false} />);
    expect(screen.getByText(/draft length · 0 words/i)).toBeVisible();
    view.rerender(<IntakeSafeguardInspector wordCount={1} hasPii={false}/>);
    expect(screen.getByText(/draft length · 1 word$/i)).toBeVisible();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('describes what the browser checks and explains when human review applies', () => {
    const view = render(<IntakeSafeguardInspector wordCount={20} hasPii={false} />);
    expect(screen.getByText(/browser checks for common phone/i)).toBeVisible();
    expect(screen.getByText(/Flagged cases go to a reviewer/)).toBeVisible();
    view.rerender(<IntakeSafeguardInspector wordCount={20} hasPii />);
    expect(screen.getByText(/a number matches/i)).toBeVisible();
  });
});
