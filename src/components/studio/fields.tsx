"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/** Textarea that grows with its content, styled to look like print until focused. */
export function AutoText({
  value,
  onChange,
  className = "",
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel ?? placeholder}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`edit-field block overflow-hidden px-1 -mx-1 ${className}`}
    />
  );
}

export function InlineInput({
  value,
  onChange,
  className = "",
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      value={value}
      aria-label={ariaLabel ?? placeholder}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`edit-field px-1 -mx-1 ${className}`}
    />
  );
}

export function IconButton({
  title,
  onClick,
  children,
  danger,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-muted transition hover:bg-mist disabled:opacity-30 ${
        danger ? "hover:text-red-700" : "hover:text-heading"
      }`}
    >
      {children}
    </button>
  );
}

/** Closes a dialog on Escape. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
