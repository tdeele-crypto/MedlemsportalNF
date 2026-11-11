import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, ExternalLink, Eye } from "lucide-react";
import { toast } from "sonner";

export const AppAdminPanel = () => {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get("/admin/public-link")
      .then(({ data }) => setLink(`${window.location.origin}${data.path}`))
      .catch((err) => setError(formatApiError(err)));
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.getElementById("public-link-input");
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    toast.success("Link kopieret");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border rounded-md bg-white p-6" data-testid="app-admin-panel">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Eye className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">View only-link</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Offentlig side med kommende arrangementer. Ingen login og intet kan redigeres. Kan sendes til medlemmer eller deles på Facebook.
          </p>
        </div>
      </div>
      {error ? (
        <p className="mt-5 text-sm text-destructive" data-testid="public-link-error">{error}</p>
      ) : (
        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <Input
            id="public-link-input"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="font-mono text-xs"
            data-testid="public-link-input"
          />
          <div className="flex gap-2 shrink-0">
            <Button onClick={copy} disabled={!link} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="public-link-copy-button">
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Kopieret" : "Kopier"}
            </Button>
            <Button variant="outline" asChild disabled={!link} data-testid="public-link-open-button">
              <a href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Åbn
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
