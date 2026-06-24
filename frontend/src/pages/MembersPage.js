import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MedlemstypeBadge from "@/components/MedlemstypeBadge";
import { Upload, Search, Mail, Newspaper } from "lucide-react";
import { toast } from "sonner";

export default function MembersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async (query) => {
    setLoading(true);
    try {
      const { data } = await api.get("/members", { params: { q: query, limit: 100 } });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/members/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(
        `Import færdig: ${data.inserted} nye, ${data.updated} opdateret, ${data.skipped} sprunget over`
      );
      await load(q);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="members-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Medlemmer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} medlem{total === 1 ? "" : "mer"} i systemet
          </p>
        </div>
        {isAdmin && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="hidden"
              data-testid="members-import-file"
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="members-import-button"
            >
              <Upload className="w-4 h-4 mr-2" strokeWidth={1.6} />
              {importing ? "Importerer..." : "Importér Excel"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Søg på medlemsnummer, navn, adresse, telefon eller email..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9 bg-white"
          data-testid="members-search-input"
        />
      </div>

      <div className="mt-6 border border-border rounded-md bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Nr.</TableHead>
              <TableHead>Navn & adresse</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">Telefon</TableHead>
              <TableHead className="hidden lg:table-cell">Medlemskab</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                  Indlæser...
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                  Ingen medlemmer fundet. {isAdmin && "Importér et Excel-ark for at komme i gang."}
                </TableCell>
              </TableRow>
            )}
            {items.map((m) => (
              <TableRow
                key={m.id}
                data-testid={`member-row-${m.id}`}
                onClick={() => navigate(`/medlemmer/${m.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-mono text-xs">{m.medlemsnummer}</TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{m.navn}</div>
                  {m.adresse && (
                    <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">
                      {m.adresse.split("\n").slice(1).join(", ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">{m.email}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{m.telefon}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex flex-col gap-1 items-start">
                    <MedlemstypeBadge type={m.medlemstype} compact />
                    {m.bladstatus && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {m.bladstatus.includes("e-mail") ? (
                          <Mail className="w-3 h-3" strokeWidth={1.6} />
                        ) : (
                          <Newspaper className="w-3 h-3" strokeWidth={1.6} />
                        )}
                        {m.bladstatus}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
