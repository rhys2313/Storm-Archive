import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import StormMark from '../components/StormMark';

it('renders the user raster logo without replacing the accessible brand button name', () => {
  render(<button aria-label="Storm Archive — открыть архив"><StormMark className="additional" /></button>);
  const button = screen.getByRole('button', { name: 'Storm Archive — открыть архив' });
  const image = button.querySelector('img');
  expect(image).toHaveAttribute('src', expect.stringMatching(/^\/branding\/[a-f0-9]{12}\/logo\.png$/));
  expect(image).toHaveAttribute('width', '288');
  expect(image).toHaveAttribute('height', '288');
  expect(image).toHaveAttribute('alt', '');
  expect(image).toHaveClass('storm-mark', 'additional');
  expect(button.querySelector('svg')).toBeNull();
});
