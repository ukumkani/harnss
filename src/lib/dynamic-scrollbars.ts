const SCROLLING_ATTR = "data-scrolling";
const HIDE_DELAY_MS = 700;

const timers = new WeakMap<Element, number>();

export function installDynamicScrollbars() {
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      target.setAttribute(SCROLLING_ATTR, "true");

      const existingTimer = timers.get(target);
      if (existingTimer != null) {
        window.clearTimeout(existingTimer);
      }

      const timer = window.setTimeout(() => {
        target.removeAttribute(SCROLLING_ATTR);
        timers.delete(target);
      }, HIDE_DELAY_MS);
      timers.set(target, timer);
    },
    true,
  );
}
