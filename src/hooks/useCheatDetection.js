import { useEffect, useRef } from "react";
import { recordCheatEvent } from "../lib/quizApi";

export default function useCheatDetection(attemptId, enabled = true) {
  const lastEventTimes = useRef({});

  useEffect(() => {
    if (!attemptId || !enabled) return undefined;

    let armed = false;
    let hadFullscreen = Boolean(document.fullscreenElement);
    const armTimer = window.setTimeout(() => {
      armed = true;
      hadFullscreen = Boolean(document.fullscreenElement);
    }, 1200);

    function report(type) {
      if (!armed) return;
      const now = Date.now();
      if (now - (lastEventTimes.current[type] || 0) < 1200) return;
      lastEventTimes.current[type] = now;
      recordCheatEvent(attemptId, type).catch(() => {
        // Deliberately silent: activity flags must not interrupt the student.
      });
    }

    function handleVisibility() {
      if (document.hidden) report("tab_hidden");
    }

    function handleBlur() {
      if (!document.hidden) report("window_blur");
    }

    function handleFullscreen() {
      if (document.fullscreenElement) {
        hadFullscreen = true;
      } else if (hadFullscreen) {
        report("fullscreen_exit");
      }
    }

    function handleCopy(event) {
      report("copy_attempt");
      event.preventDefault();
    }

    function handlePaste(event) {
      report("paste_attempt");
      event.preventDefault();
    }

    function handleContextMenu(event) {
      report("context_menu");
      event.preventDefault();
    }

    function handleKeyDown(event) {
      const blockedShortcut =
        (event.ctrlKey || event.metaKey) && ["c", "v", "p", "u"].includes(event.key.toLowerCase());

      if (blockedShortcut) {
        report("keyboard_shortcut");
        event.preventDefault();
      }
    }

    function handleBackButton() {
      report("back_button");
      window.history.pushState({ quizLocked: true }, "", window.location.href);
    }

    const navigationEntry = performance.getEntriesByType?.("navigation")?.[0];
    if (navigationEntry?.type === "reload" && sessionStorage.getItem("activeQuizStarted") === "true") {
      window.setTimeout(() => report("page_reload"), 1400);
    }

    window.history.pushState({ quizLocked: true }, "", window.location.href);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFullscreen);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreen);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [attemptId, enabled]);
}
