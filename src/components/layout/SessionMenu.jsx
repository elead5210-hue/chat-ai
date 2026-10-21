import React, { useEffect, useRef, useState } from "react";

/**
 * Header "Session" dropdown.
 *
 * Props:
 *   onNewSession - () => void. Called when the user confirms starting a new
 *                  session (wired to resetSession in App.jsx).
 */
export default function SessionMenu({ onNewSession }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleNewSession() {
    setOpen(false);
    onNewSession?.();
  }

  return (
    <div className="session-menu" ref={containerRef}>
      <button
        type="button"
        className="secondary session-menu-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Session ▾
      </button>

      {open && (
        <ul className="session-menu-list" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="secondary session-menu-item"
              onClick={handleNewSession}
            >
              New session
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}