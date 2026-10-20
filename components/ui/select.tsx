"use client";

import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

type Props = Omit<ComponentPropsWithoutRef<"select">, "multiple" | "size">;
type Choice = { value: string; label: ReactNode; text: string; disabled: boolean };
function textOf(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : String(child)).join("");
}
function choicesOf(children: ReactNode): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type === Fragment) return choicesOf(child.props.children);
    return [{ value: String(child.props.value ?? textOf(child.props.children)), label: child.props.children,
      text: textOf(child.props.children), disabled: !!child.props.disabled }];
  });
}

/** One keyboard-accessible dropdown for consistent hover and selected states. */
export function Select({ children, value, defaultValue, className = "", disabled, id, onChange, ...props }: Props) {
  const generated = useId();
  const controlId = id ?? `select-${generated}`;
  const options = choicesOf(children);
  const [localValue, setLocalValue] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selectedValue = String(value ?? localValue);
  const selected = options.findIndex(option => option.value === selectedValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const search = useRef({ value: "", at: 0 });

  const updatePosition = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const above = below < Math.min(200, options.length * 38 + 8) && rect.top > below;
    const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 16);
    setPosition({ position: "fixed", left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, minWidth: 0,
      top: above ? "auto" : rect.bottom, bottom: above ? window.innerHeight - rect.top : "auto",
      maxHeight: Math.max(80, Math.min(300, (above ? rect.top : below) - 12)) });
  }, [options.length]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    const onScroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) updatePosition(); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("resize", updatePosition); document.removeEventListener("scroll", onScroll, true); };
  }, [open, updatePosition]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open && keyboardActive) menu.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, active, keyboardActive]);
  const show = (fromKeyboard = false) => {
    if (disabled) return;
    updatePosition();
    setKeyboardActive(fromKeyboard);
    setActive(selected >= 0 && !options[selected]?.disabled ? selected : options.findIndex(option => !option.disabled));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled || disabled || !native.current) return;
    // Keep form behavior and the existing typed onChange API through a real select event.
    if (option.value !== selectedValue) {
      native.current.value = option.value;
      native.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
    trigger.current?.focus();
  };
  const move = (direction: number) => {
    let index = active;
    for (let count = 0; count < options.length; count++) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) { setActive(index); break; }
    }
  };
  return <span className="omni-select" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <select {...props} hidden aria-hidden="true" tabIndex={-1} ref={native} disabled={disabled} value={selectedValue}
      onChange={event => { if (value === undefined) setLocalValue(event.target.value); onChange?.(event); }}>{children}</select>
    <button type="button" id={controlId} ref={trigger} disabled={disabled} title={props.title}
      className={`omni-select-trigger ${className}`} role="combobox" aria-haspopup="listbox" aria-expanded={open}
      aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} aria-describedby={props["aria-describedby"]}
      aria-invalid={props["aria-invalid"]} aria-required={props.required}
      aria-controls={`${controlId}-options`} aria-activedescendant={open && active >= 0 ? `${controlId}-option-${active}` : undefined}
      onClick={() => open ? setOpen(false) : show()}
      onKeyDown={event => {
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape"].includes(event.key)) {
          event.preventDefault();
          setKeyboardActive(true);
          if (event.key === "Escape") { setOpen(false); return; }
          if (event.key === "Enter" || event.key === " ") { if (open) choose(active); else show(true); return; }
          if (!open) { show(true); return; }
          if (event.key === "Home") setActive(options.findIndex(option => !option.disabled));
          else if (event.key === "End") setActive(options.findLastIndex(option => !option.disabled));
          else move(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Tab") setOpen(false);
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const now = Date.now();
          search.current = { value: (now - search.current.at < 800 ? search.current.value : "") + event.key.toLowerCase(), at: now };
          const index = options.findIndex(option => !option.disabled && option.text.toLowerCase().startsWith(search.current.value));
          if (!open) show(true);
          setKeyboardActive(true);
          if (index >= 0) setActive(index);
        }
      }}>
      <span>{options[selected]?.label ?? "Choose an option"}</span><ChevronDown size={15} aria-hidden />
    </button>
    {open ? createPortal(<span id={`${controlId}-options`} role="listbox" aria-label={props["aria-label"] ?? "Options"} className="omni-select-menu" ref={menu} style={position}>
      {options.map((option, index) => <span key={option.value} id={`${controlId}-option-${index}`} role="option"
        aria-selected={index === selected} aria-disabled={option.disabled || undefined} data-option-index={index}
        data-active={keyboardActive && index === active} className="omni-select-option"
        onPointerMove={() => { setKeyboardActive(false); if (!option.disabled) setActive(index); }}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>{option.label}</span>)}
    </span>, document.body) : null}
  </span>;
}
