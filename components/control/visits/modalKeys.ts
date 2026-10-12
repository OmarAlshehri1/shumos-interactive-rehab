import type { KeyboardEvent } from "react";
/** Keep keyboard users inside an open clinical dialog and make cancellation explicit. */
export function modalKeys(
  event: KeyboardEvent<HTMLElement>,
  close: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button,a[href],input,select,textarea,summary,[tabindex]",
    ),
  ).filter(
    (e) =>
      e.tabIndex >= 0 &&
      !e.hasAttribute("disabled") &&
      e.getClientRects().length > 0,
  );
  const first = controls[0],
    last = controls[controls.length - 1];
  if (!first) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
