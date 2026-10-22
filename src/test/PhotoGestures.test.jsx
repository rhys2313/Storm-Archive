import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PhotoLightbox from '../components/PhotoLightbox';
import { LayerClosingContext } from '../hooks/useLayerClosing';

const point = (x, y) => ({ clientX: x, clientY: y });
function viewer(closing = false) {
  const onNavigate = vi.fn();
  const view = render(
    <LayerClosingContext.Provider value={closing}>
      <PhotoLightbox
        items={[0, 1, 2].map((id) => ({
          photo: { id, url: 'photo.jpg' },
          title: 'Наблюдение'
        }))}
        index={1}
        onNavigate={onNavigate}
        onClose={() => {}}
      />
    </LayerClosingContext.Provider>
  );
  return {
    onNavigate,
    stage: view.container.querySelector('.lightbox-stage'),
    footer: view.container.querySelector('.lightbox-footer')
  };
}

it.each([
  [230, 0],
  [50, 2]
])(
  'owns a horizontal photo gesture ending at %s and cancels its browser default',
  (endX, next) => {
    const { stage, onNavigate } = viewer();
    fireEvent.touchStart(stage, { touches: [point(140, 300)] });
    const allowed = fireEvent.touchEnd(stage, {
      touches: [],
      changedTouches: [point(endX, 310)],
      cancelable: true
    });
    expect(onNavigate).toHaveBeenCalledWith(next);
    expect(allowed).toBe(false);
  }
);

it('leaves a vertical gesture available to the browser', () => {
  const { stage, onNavigate } = viewer();
  fireEvent.touchStart(stage, { touches: [point(100, 200)] });
  expect(
    fireEvent.touchEnd(stage, {
      touches: [],
      changedTouches: [point(120, 380)],
      cancelable: true
    })
  ).toBe(true);
  expect(onNavigate).not.toHaveBeenCalled();
});

it('does not reuse a cancelled gesture', () => {
  const { stage, onNavigate } = viewer();
  fireEvent.touchStart(stage, { touches: [point(100, 200)] });
  fireEvent.touchCancel(stage);
  fireEvent.touchEnd(stage, { touches: [], changedTouches: [point(240, 210)] });
  expect(onNavigate).not.toHaveBeenCalled();
});

it('does not turn a two-finger zoom into photo navigation', () => {
  const { stage, onNavigate } = viewer();
  fireEvent.touchStart(stage, { touches: [point(100, 200)] });
  fireEvent.touchStart(stage, { touches: [point(100, 200), point(200, 200)] });
  fireEvent.touchEnd(stage, {
    touches: [point(200, 200)],
    changedTouches: [point(20, 210)]
  });
  fireEvent.touchEnd(stage, { touches: [], changedTouches: [point(300, 210)] });
  expect(onNavigate).not.toHaveBeenCalled();
});

it('does not navigate when the metadata area is swiped', () => {
  const { footer, onNavigate } = viewer();
  fireEvent.touchStart(footer, { touches: [point(100, 600)] });
  fireEvent.touchEnd(footer, {
    touches: [],
    changedTouches: [point(240, 610)]
  });
  expect(onNavigate).not.toHaveBeenCalled();
});

it('ignores a gesture delivered while the viewer is closing', () => {
  const { stage, onNavigate } = viewer(true);
  fireEvent.touchStart(stage, { touches: [point(100, 200)] });
  fireEvent.touchEnd(stage, { touches: [], changedTouches: [point(240, 210)] });
  expect(onNavigate).not.toHaveBeenCalled();
});
