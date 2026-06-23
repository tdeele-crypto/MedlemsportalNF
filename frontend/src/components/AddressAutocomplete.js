import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";

/**
 * Address autocomplete using DAWA (Danmarks Adressers Web API).
 * https://dawadocs.dataforsyningen.dk/dok/api/autocomplete
 * Free, no API key required. Returns Danish addresses progressively
 * (street → street + number → full address with postnr/by).
 */
export default function AddressAutocomplete({ value, onChange, placeholder, "data-testid": testId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [caretPos, setCaretPos] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced fetch from DAWA
  useEffect(() => {
    const q = (value || "").trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://api.dataforsyningen.dk/autocomplete?q=${encodeURIComponent(q)}&caretpos=${caretPos}&fuzzy=&type=adresse`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("DAWA fejl");
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch (err) {
        console.warn("DAWA autocomplete failed", err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [value, caretPos]);

  const handleChange = (e) => {
    const v = e.target.value;
    setCaretPos(e.target.selectionStart ?? v.length);
    onChange(v);
    setOpen(true);
  };

  const handlePick = (s) => {
    // s.forslagstekst is "selected" text including caret. s.tekst is full text.
    // DAWA returns: when not full address yet, caretpos points where to continue typing.
    onChange(s.tekst);
    setCaretPos((s.caretpos ?? s.tekst.length));
    if (s.type === "adresse") {
      setOpen(false);
      setSuggestions([]);
    } else {
      // partial selection - refocus and continue typing
      setOpen(true);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input) {
          input.focus();
          const pos = s.caretpos ?? s.tekst.length;
          try { input.setSelectionRange(pos, pos); } catch { /* ignore */ }
        }
      });
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" strokeWidth={1.6} />
        <Input
          ref={inputRef}
          value={value || ""}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder || "Begynd at skrive en adresse..."}
          className="pl-9"
          data-testid={testId}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" strokeWidth={1.6} />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg max-h-64 overflow-y-auto"
          data-testid="address-suggestions"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.tekst}-${i}`}
              type="button"
              onClick={() => handlePick(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 border-b border-border last:border-b-0"
              data-testid={`address-suggestion-${i}`}
            >
              {s.forslagstekst || s.tekst}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
