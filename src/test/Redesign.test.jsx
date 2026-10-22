import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Presence from '../components/Presence';
import Modal from '../components/Modal';
import FilterBar from '../components/FilterBar';
import EventFormModal from '../components/EventFormModal';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Overlay() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <button onClick={() => setVisible(true)}>Open</button>
      <Presence visible={visible}>
        {visible && (
          <Modal title="Animated" onClose={() => setVisible(false)}>
            <button>Action</button>
          </Modal>
        )}
      </Presence>
    </>
  );
}

it('holds scroll ownership through exit, makes the departing layer inert, and restores focus after exit', () => {
  vi.useFakeTimers();
  render(<Overlay />);
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(document.querySelector('[data-state="closing"]')).toHaveAttribute(
    'inert'
  );
  expect(document.querySelector('.layer-exit-shield')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  act(() => vi.advanceTimersByTime(150));
  expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  expect(document.querySelector('.layer-exit-shield')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  expect(opener).toHaveFocus();
});

it('cancels a pending removal when a surface reopens', () => {
  vi.useFakeTimers();
  const view = render(
    <Presence visible>
      <Modal title="Animated" onClose={() => {}} />
    </Presence>
  );
  view.rerender(<Presence visible={false}>{null}</Presence>);
  act(() => vi.advanceTimersByTime(60));
  view.rerender(
    <Presence visible>
      <Modal title="Animated" onClose={() => {}} />
    </Presence>
  );
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('dialog', { name: 'Animated' })).toBeInTheDocument();
  expect(document.querySelector('[inert]')).toBeNull();
});

it('removes motion retention immediately when reduced motion is requested', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  render(<Overlay />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  act(() => vi.advanceTimersByTime(0));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.style.overflow).toBe('');
});

it('discloses classification and coordinates without making an untouched draft dirty', () => {
  const onClose = vi.fn();
  render(<EventFormModal onClose={onClose} onSave={() => {}} />);
  const summary = screen
    .getByText('Явление и характеристики')
    .closest('summary');
  expect(summary.parentElement).not.toHaveAttribute('open');
  fireEvent.click(summary);
  expect(summary.parentElement).toHaveAttribute('open');
  fireEvent.click(screen.getByText('Координаты и теги'));
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole('dialog', { name: 'Закрыть без сохранения?' })
  ).not.toBeInTheDocument();
});

function Filters() {
  const [category, setCategory] = useState('');
  const [subtype, setSubtype] = useState('');
  const [severity, setSeverity] = useState('');
  return (
    <FilterBar
      searchQuery=""
      setSearchQuery={() => {}}
      categoryFilter={category}
      setCategoryFilter={setCategory}
      subtypeFilter={subtype}
      setSubtypeFilter={setSubtype}
      severityFilter={severity}
      setSeverityFilter={setSeverity}
      sortBy="newest"
      setSortBy={() => {}}
      totalEvents={3}
      totalResults={category ? 1 : 3}
      isFiltered={Boolean(category || subtype || severity)}
      onReset={() => {
        setCategory('');
        setSubtype('');
        setSeverity('');
      }}
    />
  );
}
it('keeps filtering state when its panel closes and offers a visible reset', () => {
  render(<Filters />);
  expect(screen.queryByRole('combobox', { name: 'Группа явлений' })).toBeNull();
  const toggle = screen.getByRole('button', { name: 'Фильтры' });
  fireEvent.click(toggle);
  fireEvent.change(screen.getByRole('combobox', { name: 'Группа явлений' }), {
    target: { value: 'hail' }
  });
  fireEvent.click(toggle);
  expect(screen.queryByRole('combobox', { name: 'Группа явлений' })).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Найдено: 1 из 3');
  expect(screen.getByText('Град', { selector: 'span' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Наблюдений в архиве: 3'
  );
});
