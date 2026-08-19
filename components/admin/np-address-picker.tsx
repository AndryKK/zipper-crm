"use client";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

type NpAddressOption = {
  ref: string;
  cityRef?: string;
  cityDescription?: string;
  description: string;
  number: string;
  isPostomat: boolean;
  formatted: string;
};

// One-field Nova Poshta city+warehouse picker — search-as-you-type against
// /api/nova-poshta/address-search (see that route and npSearchAddress in
// lib/nova-poshta.ts for why this needs two real NP calls per query, not
// one). Selecting a result writes back the exact
// "{City} — {Відділення|Поштомат} №{N}...: {address}" format
// parseNpAddress()'s regex (and everything downstream of it — TTN
// creation, weight/oversized detection) requires — built from NP's own
// CityDescription/Description fields, never hand-typed, so the dash is
// never missing or the wrong character the way free-typing it invited.
//
// Still a plain controlled text input underneath (value/onChange fire on
// every keystroke same as a normal <Input>) — an order's delivery address
// isn't always an NP warehouse (courier-to-door, or historical free text),
// so typing without picking a suggestion is left possible on purpose,
// this only makes the *correct* NP format the easy, one-click path.
export function NpAddressPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<NpAddressOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || value.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/nova-poshta/address-search?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [value, open]);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && (searching || results.length > 0) && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
            background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
            boxShadow: "0 8px 28px rgba(0,0,0,0.13)", maxHeight: 280, overflowY: "auto",
          }}
        >
          {searching && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", fontSize: 12.5, color: "var(--text-muted)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Пошук у Новій Пошті…
            </div>
          )}
          {!searching && results.map((r) => (
            <button
              key={r.ref}
              type="button"
              onClick={() => { onChange(r.formatted); setOpen(false); setResults([]); }}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, width: "100%",
                padding: "8px 12px", background: "var(--bg)", border: "none",
                borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontSize: 13,
              }}
            >
              <MapPin size={13} style={{ flexShrink: 0, marginTop: 2, color: "var(--text-muted)" }} />
              <span>
                <span style={{ fontWeight: 600 }}>{r.cityDescription}</span>
                <span style={{ color: "var(--text-muted)" }}> — {r.description}</span>
                {r.isPostomat && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#7c3aed" }}>ПОШТОМАТ</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
