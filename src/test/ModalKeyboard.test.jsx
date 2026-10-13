import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Modal from '../components/Modal';

// jsdom has no layout. Model visible elements for the focusability check; real
// stacking, scrolling and focus navigation are covered by the browser script.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () {
    return this.style.display === 'none' ? [] : [{ width: 20, height: 20 }];
  });
});
afterEach(() => vi.restoreAllMocks());

it('wraps Tab and Shift+Tab inside the dialog, skipping disabled and hidden controls', () => {
  render(<Modal title="Test" onClose={() => {}}>
    <button disabled>Disabled</button><button hidden>Hidden</button>
    <button style={{ display: 'none' }}>Not displayed</button><button>Last</button>
  </Modal>);
  const first = screen.getByRole('button', { name: 'Закрыть' });
  const last = screen.getByRole('button', { name: 'Last' });
  fireEvent.keyDown(document.activeElement, { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(first).toHaveFocus();
});

it('contains focus even if it was moved to the background', () => {
  render(<><button>Background</button><Modal title="Test" onClose={() => {}}><button>Last</button></Modal></>);
  screen.getByRole('button', { name: 'Background' }).focus();
  fireEvent.keyDown(document.activeElement, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
});

it('restores the last dialog control if history or another script moves focus outside', () => {
  render(<><button>Background</button><Modal title="Test" onClose={() => {}}><input aria-label="Draft" /></Modal></>);
  const input = screen.getByLabelText('Draft');
  input.focus();
  screen.getByRole('button', { name: 'Background' }).focus();
  expect(input).toHaveFocus();
});

it('keeps focus on the dialog when every control is disabled', () => {
  render(<Modal title="Test" onClose={() => {}} />);
  screen.getByRole('button').disabled = true;
  fireEvent.keyDown(document.activeElement, { key: 'Tab' });
  expect(screen.getByRole('dialog')).toHaveFocus();
});

it('handles Escape before background keyboard listeners', () => {
  const dismiss = vi.fn();
  const background = vi.fn();
  document.addEventListener('keydown', background);
  try {
    render(<Modal title="Test" onClose={dismiss} />);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(background).not.toHaveBeenCalled();
  } finally { document.removeEventListener('keydown', background); }
});

it('traps only the top dialog and restores focus and scroll lock in order', () => {
  function Layers() {
    const [outer, setOuter] = useState(false);
    const [inner, setInner] = useState(false);
    return <>
      <button onClick={() => setOuter(true)}>Open outer</button>
      {outer && <Modal title="Outer" labelledBy="outer-title" onClose={() => setOuter(false)}>
        <button onClick={() => setInner(true)}>Open inner</button>
      </Modal>}
      {inner && <Modal title="Inner" labelledBy="inner-title" onClose={() => setInner(false)}><button>Inner last</button></Modal>}
    </>;
  }
  render(<Layers />);
  const opener = screen.getByRole('button', { name: 'Open outer' });
  opener.focus(); fireEvent.click(opener);
  const nestedOpener = screen.getByRole('button', { name: 'Open inner' });
  nestedOpener.focus(); fireEvent.click(nestedOpener);
  expect(screen.getByRole('dialog', { name: 'Inner' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Inner last' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument();
  expect(nestedOpener).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(document.body.style.overflow).toBe('');
});
