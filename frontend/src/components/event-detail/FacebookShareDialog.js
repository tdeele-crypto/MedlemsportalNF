import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Download, Facebook } from "lucide-react";
import { toast } from "sonner";

export default function FacebookShareDialog({ open, onOpenChange, event, initialText }) {
  const [text, setText] = useState(initialText || "");

  useEffect(() => {
    if (open) {
      setText(initialText || "");
      // Pre-copy to clipboard so paste works immediately in FB
      navigator.clipboard?.writeText(initialText || "").catch(() => {});
    }
  }, [open, initialText]);

  const openFacebookWindow = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    let groupUrl = "https://www.facebook.com/groups/315581835133905";
    try {
      const { data } = await api.get("/config/facebook");
      if (data?.group_url) groupUrl = data.group_url;
    } catch { /* keep default */ }
    window.open(groupUrl, "_blank", "noopener,noreferrer");
  };

  const downloadImage = async () => {
    if (!event?.image_path) return;
    try {
      const { data } = await api.get(`/files/${event.image_path}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      const ext = (event.image_path.split(".").pop() || "jpg").toLowerCase();
      a.download = `${(event.title || "arrangement").replace(/\s+/g, "_")}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      toast.success("Billede downloadet");
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Tekst kopieret til udklipsholder");
    } catch {
      toast.error("Kunne ikke kopiere — markér teksten manuelt og kopier");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-xl max-h-[90vh] overflow-y-auto" data-testid="facebook-share-dialog">
        <DialogHeader>
          <DialogTitle>Del på Facebook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-foreground/80 space-y-2">
            <p><strong>Sådan gør du:</strong></p>
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              <li>(Valgfri) Klik <strong>&quot;Download billede&quot;</strong> hvis du vil have arrangementets billede med</li>
              <li>Klik <strong>&quot;Åbn Facebook-gruppen&quot;</strong> — gruppen åbner i ny fane</li>
              <li>I gruppen klik <strong>&quot;Skriv noget...&quot;</strong></li>
              <li>Indsæt teksten med <strong>Cmd/Ctrl + V</strong> (allerede kopieret)</li>
              <li>Træk det downloadede billede ind i opslaget (hvis du downloadede det)</li>
              <li>Klik <strong>Slå op</strong></li>
            </ol>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fb-text">Tekst til opslaget</Label>
            <Textarea
              id="fb-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="text-sm font-mono"
              data-testid="facebook-share-text"
            />
            <p className="text-xs text-muted-foreground">Du kan redigere teksten her før du indsætter i Facebook.</p>
          </div>
          <Button
            type="button" variant="outline" onClick={copyText}
            className="w-full" data-testid="facebook-copy-text"
          >
            <Download className="w-4 h-4 mr-2 rotate-180" strokeWidth={1.6} />
            Kopier tekst igen
          </Button>
          {event?.image_path && (
            <Button
              type="button" variant="outline" onClick={downloadImage}
              className="w-full" data-testid="facebook-download-image"
            >
              <Download className="w-4 h-4 mr-2" strokeWidth={1.6} />
              Download billede
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="facebook-close">
            Luk
          </Button>
          <Button
            type="button" onClick={openFacebookWindow}
            className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white"
            data-testid="facebook-open"
          >
            <Facebook className="w-4 h-4 mr-2" strokeWidth={1.6} />
            Åbn Facebook-gruppen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
