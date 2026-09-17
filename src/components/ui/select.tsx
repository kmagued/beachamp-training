"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type OptionHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Mirrors the shape of a native change event so call sites can keep reading `e.target.value`. */
export interface SelectChangeEvent {
  target: { value: string; name?: string };
}

interface SelectProps {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  size?: "md" | "sm";
  /** Classes for the trigger button */
  className?: string;
  "aria-label"?: string;
  /** `<option>` elements, exactly as with a native `<select>` */
  children?: ReactNode;
}

interface ParsedOption {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  hidden: boolean;
}

const MENU_MAX_HEIGHT = 240;
const VIEWPORT_MARGIN = 8;
// Fixed at the origin while hidden, so the first measurement is the menu's natural width
const UNPOSITIONED_MENU: CSSProperties = { position: "fixed", top: 0, left: 0, visibility: "hidden" };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function parseOptions(children: ReactNode, out: ParsedOption[] = []): ParsedOption[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      parseOptions((child.props as { children?: ReactNode }).children, out);
      return;
    }
    if (child.type !== "option") return;
    const props = child.props as OptionHTMLAttributes<HTMLOptionElement>;
    const text = textOf(props.children);
    out.push({
      // A native <option> without a value attribute submits its text
      value: props.value != null ? String(props.value) : text,
      label: props.children ?? text,
      text,
      disabled: !!props.disabled,
      hidden: !!props.hidden,
    });
  });
  return out;
}

export function Select({
  value,
  defaultValue,
  onChange,
  onClick,
  name,
  id,
  required,
  disabled,
  size = "md",
  className,
  "aria-label": ariaLabel,
  children,
}: SelectProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ buffer: "", timer: 0 });
  const centerOnReveal = useRef(false);

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue != null ? String(defaultValue) : "");
  const currentValue = isControlled ? String(value) : internalValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>(UNPOSITIONED_MENU);

  const options = useMemo(() => parseOptions(children), [children]);
  // Like a native select, an unmatched value falls back to the first usable option
  const selectedIndex = useMemo(() => {
    const exact = options.findIndex((o) => o.value === currentValue);
    return exact !== -1 ? exact : options.findIndex((o) => !o.disabled);
  }, [options, currentValue]);
  const selected = selectedIndex === -1 ? null : options[selectedIndex];

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  function openMenu() {
    if (disabled) return;
    setMenuStyle(UNPOSITIONED_MENU);
    setActiveIndex(selectedIndex);
    centerOnReveal.current = true;
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    close();
    if (option.value === currentValue) return;
    if (!isControlled) setInternalValue(option.value);
    onChange?.({ target: { value: option.value, name } });
  }

  function step(from: number, direction: 1 | -1) {
    const origin = from < 0 && direction === -1 ? options.length : from;
    for (let i = 1; i <= options.length; i++) {
      const next = (origin + direction * i + options.length) % options.length;
      if (!options[next].disabled && !options[next].hidden) return next;
    }
    return from;
  }

  function handleTypeahead(char: string) {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.buffer += char.toLowerCase();
    state.timer = window.setTimeout(() => { state.buffer = ""; }, 500);

    // Repeating one letter cycles through matches; a longer prefix refines the current one
    const start = state.buffer.length === 1 ? activeIndex + 1 : Math.max(activeIndex, 0);
    for (let i = 0; i < options.length; i++) {
      const index = (start + i) % options.length;
      const option = options[index];
      if (!option.disabled && !option.hidden && option.text.trim().toLowerCase().startsWith(state.buffer)) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => step(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => step(i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(step(-1, 1));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(step(options.length, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) handleTypeahead(e.key);
    }
  }

  // Position the menu against the trigger. It's portaled to <body> so drawers and
  // scroll containers can't clip it; flips above the trigger when there's no room below.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(menu.scrollHeight, MENU_MAX_HEIGHT);
    const menuWidth = Math.max(menu.offsetWidth, rect.width);
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const placeAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.left, window.innerWidth - menuWidth - VIEWPORT_MARGIN),
    );

    setMenuStyle({
      position: "fixed",
      left,
      minWidth: rect.width,
      maxWidth: window.innerWidth - VIEWPORT_MARGIN * 2,
      maxHeight: Math.max(Math.min(MENU_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow), 120),
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    function handleScroll(e: Event) {
      // Scrolling the option list itself doesn't move the trigger
      if (menuRef.current?.contains(e.target as Node)) return;
      updatePosition();
    }
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition]);

  // Close on outside press
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: globalThis.MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, close]);

  // Keep the active option in view. Waits until the menu is positioned, since its
  // height limit is only applied then; on open the selected option is centered.
  const positioned = open && menuStyle.visibility !== "hidden";
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const option = document.getElementById(`${reactId}-option-${activeIndex}`);
    if (!positioned || !menu || !option) return;

    if (centerOnReveal.current) {
      centerOnReveal.current = false;
      menu.scrollTop = option.offsetTop - (menu.clientHeight - option.offsetHeight) / 2;
    } else if (option.offsetTop < menu.scrollTop) {
      menu.scrollTop = option.offsetTop;
    } else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
    }
  }, [positioned, activeIndex, reactId]);

  // Uncontrolled selects inside a form return to their default when the form resets
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || isControlled) return;
    const handleReset = () => setInternalValue(defaultValue != null ? String(defaultValue) : "");
    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [isControlled, defaultValue]);

  const sm = size === "sm";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${reactId}-option-${activeIndex}` : undefined}
        onClick={(e) => {
          onClick?.(e);
          if (open) close();
          else openMenu();
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white text-left text-slate-700 cursor-pointer transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          sm ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-base sm:text-sm",
          open && "border-primary ring-2 ring-primary/20",
          className,
        )}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          className={cn(
            "shrink-0 text-slate-400 transition-transform",
            sm ? "w-3.5 h-3.5" : "w-4 h-4",
            open && "rotate-180",
          )}
        />
      </button>

      {(name || required) && (
        <input
          ref={inputRef}
          name={name}
          value={selected?.value ?? ""}
          required={required}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none"
        />
      )}

      {open && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          style={{ ...menuStyle, zIndex: 10000 }}
          // Keep focus on the trigger, and keep the press from reaching outside-click
          // handlers of whatever the select sits in (date picker, table row, drawer)
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => e.stopPropagation()}
          className="overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((option, index) => {
            if (option.hidden) return null;
            const isSelected = index === selectedIndex;
            return (
              <div
                key={`${option.value}-${index}`}
                id={`${reactId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => commit(index)}
                className={cn(
                  "flex items-center gap-2 cursor-pointer select-none",
                  sm ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
                  index === activeIndex && "bg-slate-50",
                  isSelected ? "font-medium text-slate-900" : "text-slate-700",
                  option.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="flex-1">{option.label}</span>
                <Check
                  className={cn(
                    "shrink-0 text-primary",
                    sm ? "w-3.5 h-3.5" : "w-4 h-4",
                    !isSelected && "invisible",
                  )}
                />
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
