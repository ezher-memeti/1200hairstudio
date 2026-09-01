"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type AdminSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  label?: string;
  placeholder?: string;
  options: AdminSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  searchable?: boolean;
  className?: string;
};

export default function AdminSelect({ label, placeholder = "Select an option", options, value, onChange, disabled = false, error, searchable = false, className = "" }: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery)) : options;
  }, [options, query]);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }
    const selectedIndex = filteredOptions.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, filteredOptions.findIndex((option) => !option.disabled)));
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
  }, [filteredOptions, isOpen, searchable, value]);

  function moveActive(direction: 1 | -1) {
    if (!filteredOptions.length) return;
    let nextIndex = activeIndex;
    for (let attempt = 0; attempt < filteredOptions.length; attempt += 1) {
      nextIndex = (nextIndex + direction + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[nextIndex]?.disabled) break;
    }
    setActiveIndex(nextIndex);
  }

  function selectOption(option: AdminSelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      else moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && isOpen && document.activeElement !== searchRef.current) {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) selectOption(option);
    }
  }

  return <div ref={rootRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>{label ? <label id={`${id}-label`} className="mb-2 block font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{label}</label> : null}<button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={isOpen} aria-labelledby={label ? `${id}-label ${id}-value` : `${id}-value`} aria-controls={`${id}-listbox`} onClick={() => setIsOpen((current) => !current)} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[3px] border bg-[#11110f] px-4 py-3 text-left font-admin-primary text-sm outline-none transition-all ${error ? "border-red-500/60" : isOpen ? "border-accent shadow-[0_0_0_1px_rgba(216,177,116,.2)]" : "border-border hover:border-foreground-muted focus:border-accent"} disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted disabled:opacity-60`}><span id={`${id}-value`} className={`min-w-0 flex-1 truncate ${selectedOption ? "text-foreground" : "text-foreground-muted"}`}>{selectedOption?.label ?? placeholder}</span><ChevronDown size={16} className={`shrink-0 text-foreground-muted transition-transform duration-150 ${isOpen ? "rotate-180 text-accent" : ""}`} /></button>{error ? <p className="mt-1.5 font-admin-primary text-xs text-red-300">{error}</p> : null}<div className={`absolute left-0 right-0 z-50 mt-2 origin-top overflow-hidden rounded-[3px] border border-border bg-[#11110f] shadow-2xl transition-all duration-150 ${isOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"}`}>{searchable ? <div className="border-b border-border p-2"><div className="flex items-center gap-2 border border-border bg-background px-3"><Search size={14} className="text-foreground-muted" /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search options" className="min-h-10 min-w-0 flex-1 bg-transparent font-admin-primary text-sm text-foreground outline-none placeholder:text-foreground-muted" /></div></div> : null}<div id={`${id}-listbox`} role="listbox" aria-labelledby={label ? `${id}-label` : undefined} className="max-h-64 overflow-y-auto p-1.5">{filteredOptions.map((option, index) => { const isSelected = option.value === value; const isActive = index === activeIndex; return <button key={option.value} type="button" role="option" aria-selected={isSelected} disabled={option.disabled} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectOption(option)} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-[2px] px-3 py-2 text-left font-admin-primary text-sm transition-colors ${isSelected ? "bg-accent/15 text-accent" : isActive ? "bg-surface text-foreground" : "text-foreground-secondary hover:bg-surface hover:text-foreground"} disabled:cursor-not-allowed disabled:opacity-40`}><span>{option.label}</span>{isSelected ? <Check size={14} className="shrink-0" /> : null}</button>; })}{!filteredOptions.length ? <p className="px-3 py-6 text-center font-admin-primary text-sm text-foreground-muted">No options found.</p> : null}</div></div></div>;
}
