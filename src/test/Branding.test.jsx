import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import StormMark from '../components/StormMark';

it('renders the user raster logo without replacing the accessible brand button name', () => {
  render(<button aria-label="Storm Archive — открыть архив"><StormMark className="additional" /></button>);
  const button = screen.getByRole('button', { name: 'Storm Archive — открыть архив' });
  const image = button.querySelector('img');
  expect(image).toHaveAttribute('src', expect.stringMatching(/^\/branding\/[a-f0-9]{12}\/logo-on-light\.png$/));
  expect(image).toHaveAttribute('width', '576');
  expect(image).toHaveAttribute('height', '576');
  expect(image).toHaveAttribute('alt', '');
  expect(image).toHaveClass('storm-mark', 'additional');
  expect(button.querySelector('svg')).toBeNull();
});

it('switches contrast assets with the application theme, preserving the same image dimensions', () => {
  const view = render(<StormMark theme="dark" />);
  const image = document.querySelector('img.storm-mark');
  const dark = image.getAttribute('src');
  expect(dark).toMatch(/\/logo\.png$/);
  view.rerender(<StormMark theme="light" />);
  expect(image.getAttribute('src')).toBe(dark.replace('logo.png', 'logo-on-light.png'));
  expect(image).toHaveAttribute('width', '576');
  expect(image).toHaveAttribute('height', '576');
});
