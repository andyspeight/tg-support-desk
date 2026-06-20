"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_EVENT = "tg-theme-change";

// External store over the DOM attribute. The no-flash script in the root layout
// sets data-theme before paint; this reads it (avoiding setState-in-effect) and
// re-renders when our own toggle dispatches the change event.
function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}
function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => false);

  function toggle() {
    const next = !dark;
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("tg-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("tg-theme", "light");
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-2 hover:bg-surface-2"
    >
      {dark ? (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
