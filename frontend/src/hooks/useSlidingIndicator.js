import { useLayoutEffect } from "react";

// One indicator element travels under the active item of a tab row or segmented
// control, instead of each item painting its own background. The hook measures
// the item marked data-active="true" and hands its box to CSS as custom
// properties; the CSS (.has-indicator) does the moving. The first placement is
// instant (no slide in from the left on page load), later ones transition.
export default function useSlidingIndicator(ref, activeKey) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const place = () => {
      const active = el.querySelector(':scope > [data-active="true"]');
      if (!active) {
        el.style.setProperty("--ind-o", "0");
        return;
      }
      el.style.setProperty("--ind-x", `${active.offsetLeft}px`);
      el.style.setProperty("--ind-y", `${active.offsetTop}px`);
      el.style.setProperty("--ind-w", `${active.offsetWidth}px`);
      el.style.setProperty("--ind-h", `${active.offsetHeight}px`);
      el.style.setProperty("--ind-o", "1");
    };
    place();
    const frame = requestAnimationFrame(() => { el.dataset.indReady = ""; });
    const ro = new ResizeObserver(place);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [ref, activeKey]);
}
