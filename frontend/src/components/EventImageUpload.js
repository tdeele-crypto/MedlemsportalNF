import { useRef, useState, useEffect } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Event image uploader.
 * - value: storage_path string (e.g. "medlemsportal/events/<uuid>.png") or null
 * - onChange(path | null)
 */
export default function EventImageUpload({ value, onChange, "data-testid": testId }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Fetch preview as blob when value changes
  useEffect(() => {
    let revoked = null;
    const fetchImg = async () => {
      if (!value) {
        setPreviewUrl(null);
        return;
      }
      try {
        const { data } = await api.get(`/files/${value}`, { responseType: "blob" });
        const url = URL.createObjectURL(data);
        revoked = url;
        setPreviewUrl(url);
      } catch {
        setPreviewUrl(null);
      }
    };
    fetchImg();
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [value]);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type)) {
      toast.error("Kun JPG, PNG, WebP eller GIF");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Billede er for stort (max 10 MB)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/uploads/image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.path);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFile}
        className="hidden"
        data-testid={`${testId}-file`}
      />
      {previewUrl ? (
        <div className="relative group border border-border rounded-md overflow-hidden bg-muted">
          <img
            src={previewUrl}
            alt="Arrangement"
            className="w-full h-40 object-cover"
            data-testid={`${testId}-preview`}
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 bg-white/95 hover:bg-white border border-border rounded-full p-1.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`${testId}-remove`}
            title="Fjern billede"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full h-40 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-60"
          data-testid={`${testId}-button`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.6} />
              <span className="text-sm">Uploader...</span>
            </>
          ) : (
            <>
              <ImageIcon className="w-6 h-6" strokeWidth={1.4} />
              <span className="text-sm">Klik for at vælge billede</span>
              <span className="text-xs">JPG, PNG, WebP – max 10 MB</span>
            </>
          )}
        </button>
      )}
      {previewUrl && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid={`${testId}-replace`}
          className="w-full"
        >
          <Upload className="w-3.5 h-3.5 mr-2" strokeWidth={1.6} />
          {uploading ? "Uploader..." : "Skift billede"}
        </Button>
      )}
    </div>
  );
}
