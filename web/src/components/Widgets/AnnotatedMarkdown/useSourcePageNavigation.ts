import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';

const MIN_ZOOM = 100;
const MAX_ZOOM = 400;

/** Keep image gestures inside the preview's scroll area, including captured drags. */
export function useSourcePageNavigation(scroll: RefObject<HTMLDivElement | null>, zoom: number,
  setZoom: (value: number) => void, enabled: boolean, document: string) {
  const current = useRef({zoom, setZoom}); current.current = {zoom, setZoom};
  const anchor = useRef<{image: HTMLElement; x: number; y: number; clientX: number; clientY: number} | null>(null);
  const cancelPan = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const container = scroll.current, point = anchor.current;
    anchor.current = null;
    if (container && point && container.contains(point.image)) {
      const box = point.image.getBoundingClientRect();
      container.scrollLeft += box.left + box.width * point.x - point.clientX;
      container.scrollTop += box.top + box.height * point.y - point.clientY;
    }
    if (zoom <= MIN_ZOOM) {
      cancelPan.current();
      if (container) container.scrollLeft = 0;
    }
  }, [zoom, scroll]);

  useEffect(() => {
    const container = scroll.current;
    if (!enabled || !container) return;
    let pan: {pointerId: number; x: number; y: number; left: number; top: number} | null = null;
    const imageAt = (target: EventTarget | null) => {
      const image = target instanceof Element ? target.closest<HTMLElement>('.source-page-image') : null;
      return image && container.contains(image) ? image : null;
    };
    const stopPan = () => {
      const id = pan?.pointerId;
      pan = null;
      container.classList.remove('source-pages-panning');
      if (id !== undefined && container.hasPointerCapture(id)) container.releasePointerCapture(id);
    };
    cancelPan.current = stopPan;
    const wheel = (event: WheelEvent) => {
      const image = imageAt(event.target);
      if (!event.ctrlKey || !image || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
      // React delegates wheel handlers passively; a native non-passive listener
      // is required to prevent the browser's Ctrl+wheel zoom.
      event.preventDefault();event.stopPropagation();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
        Math.round(current.current.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * .002))));
      if (next === current.current.zoom) return;
      stopPan();
      const box = image.getBoundingClientRect();
      if (box.width && box.height) anchor.current = {image,
        x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height,
        clientX: event.clientX, clientY: event.clientY};
      current.current.zoom = next;
      current.current.setZoom(next);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || current.current.zoom <= MIN_ZOOM || !imageAt(event.target)) return;
      event.preventDefault();
      pan = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop};
      container.setPointerCapture(event.pointerId);
      container.classList.add('source-pages-panning');
    };
    const move = (event: PointerEvent) => {
      if (!pan || pan.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) {stopPan();return;}
      event.preventDefault();
      container.scrollLeft = pan.left - (event.clientX - pan.x);
      container.scrollTop = pan.top - (event.clientY - pan.y);
    };
    const end = (event: PointerEvent) => {if (pan?.pointerId === event.pointerId) stopPan();};
    container.addEventListener('wheel', wheel, {passive: false});
    container.addEventListener('pointerdown', down);
    container.addEventListener('pointermove', move);
    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', end);
    container.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', stopPan);
    return () => {
      stopPan();anchor.current = null;
      container.removeEventListener('wheel', wheel);
      container.removeEventListener('pointerdown', down);
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerup', end);
      container.removeEventListener('pointercancel', end);
      container.removeEventListener('lostpointercapture', end);
      window.removeEventListener('blur', stopPan);
    };
  }, [enabled, document, scroll]);
}
