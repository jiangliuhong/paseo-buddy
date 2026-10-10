import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Fast full-name preview only when the single-line label is truncated. */
export function NameTooltip({ text, kind }: { text: string; kind: "b" | "small" }) {
  const Tag = kind;
  const label = useRef<HTMLElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [truncated, setTruncated] = useState(false);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const id = useId();
  const cancelTimer = () => clearTimeout(timer.current);
  const hide = () => { cancelTimer(); setVisible(false); };

  useLayoutEffect(() => {
    const element = label.current;
    if (!element) return;
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    hide();
    return cancelTimer;
  }, [text]);

  useLayoutEffect(() => {
    if (!visible || !label.current || !tooltip.current) return;
    const anchor = label.current.getBoundingClientRect();
    const box = tooltip.current.getBoundingClientRect();
    const below = anchor.bottom + 6;
    const top = below + box.height <= window.innerHeight - 8 ? below : anchor.top - box.height - 6;
    setPosition({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - box.height - 8)),
    });
  }, [visible, text]);

  useEffect(() => {
    if (!visible) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && tooltip.current?.contains(event.target)) return;
      hide();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", hide);
    };
  }, [visible]);

  function enter() {
    cancelTimer();
    if (truncated) timer.current = setTimeout(() => setVisible(true), 120);
  }
  function leave() {
    cancelTimer();
    // Allow the pointer to cross the small gap into a long, scrollable preview.
    timer.current = setTimeout(() => setVisible(false), 100);
  }

  return <>
    <Tag ref={label} tabIndex={truncated ? 0 : undefined} aria-describedby={visible ? id : undefined}
      onMouseEnter={enter} onMouseLeave={leave}
      onFocus={() => { cancelTimer(); if (truncated) setVisible(true); }} onBlur={hide}>
      {text}
    </Tag>
    {visible && createPortal(<div id={id} ref={tooltip} role="tooltip" className="name-tooltip"
      style={position} onMouseEnter={cancelTimer} onMouseLeave={leave}>
      {text}
    </div>, document.body)}
  </>;
}
