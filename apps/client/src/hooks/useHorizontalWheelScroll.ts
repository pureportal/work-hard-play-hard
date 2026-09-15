import { useCallback, type RefObject } from "react";

export function useHorizontalWheelScroll(ref?: RefObject<HTMLElement | null>) {
  return useCallback((element: HTMLElement | null) => {
    if (ref) ref.current = element;
    if (!element) return;

    const scroll = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.shiftKey || event.deltaX !== 0 || event.deltaY === 0) return;
      if (element.scrollWidth <= element.clientWidth || element.scrollHeight > element.clientHeight + 1) return;

      const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? element.clientWidth
        : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const previous = element.scrollLeft;
      element.scrollLeft += event.deltaY * unit;
      if (element.scrollLeft !== previous) event.preventDefault();
    };

    element.addEventListener("wheel", scroll, { passive: false });
    return () => {
      element.removeEventListener("wheel", scroll);
      if (ref) ref.current = null;
    };
  }, [ref]);
}
