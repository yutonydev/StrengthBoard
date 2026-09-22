import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  triggerClassName?: string;
}

export function Menu({ label, trigger, items, triggerClassName = 'icon-btn' }: Props) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!listRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setOpenUp(window.innerHeight - r.bottom < items.length * 40 + 24 && r.top > window.innerHeight - r.bottom);
    }
    setOpen((o) => !o);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nodes[(i + 1) % nodes.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nodes[(i - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      nodes[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={`animate-in absolute right-0 z-40 min-w-48 rounded-lg border border-line-strong bg-surface-3 p-1 shadow-pop ${
            openUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separator && <div className="my-1 border-t border-line-strong" role="separator" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={`flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm whitespace-nowrap outline-none hover:bg-surface-4 focus-visible:bg-surface-4 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent sm:h-8 ${
                  item.danger ? 'text-danger' : 'text-fg'
                }`}
              >
                <span className="flex w-4 justify-center text-muted" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
