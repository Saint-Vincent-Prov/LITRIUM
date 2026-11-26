import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./primitives";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useFocusTrap(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    const first = node.querySelector<HTMLElement>("[autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const a = items[0];
      const b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      node.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useFocusTrap(onClose);
  const titleId = useId();
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label="Fermer" onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useFocusTrap(onClose);
  const titleId = useId();
  return createPortal(
    <div className="overlay overlay--drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label="Fermer" onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
