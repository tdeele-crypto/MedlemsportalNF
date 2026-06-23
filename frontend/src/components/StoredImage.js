import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Image as ImageIcon } from "lucide-react";

/**
 * Auth-aware image renderer that fetches a stored image as a blob and shows it.
 * Falls back to a placeholder if path is missing or fetch fails.
 */
export default function StoredImage({ path, className = "", alt = "", placeholderClass = "", "data-testid": testId }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = null;
    setFailed(false);
    setUrl(null);
    if (!path) return;
    (async () => {
      try {
        const { data } = await api.get(`/files/${path}`, { responseType: "blob" });
        const u = URL.createObjectURL(data);
        revoked = u;
        setUrl(u);
      } catch {
        setFailed(true);
      }
    })();
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [path]);

  if (!path || failed) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${placeholderClass || className}`} data-testid={testId}>
        <ImageIcon className="w-6 h-6" strokeWidth={1.4} />
      </div>
    );
  }
  if (!url) {
    return <div className={`bg-muted ${className}`} data-testid={testId} />;
  }
  return <img src={url} alt={alt} className={className} data-testid={testId} />;
}
