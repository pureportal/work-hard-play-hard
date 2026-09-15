import { useState } from "react";
import { Upload, X } from "lucide-react";
import { WHITEBOARD_IMAGE_MAX_BYTES, isWhiteboardImageSource } from "@workhard/shared";
import { IconButton } from "../IconButton";

interface Props {
  disabled: boolean;
  onUpload: ((file: File) => Promise<string>) | undefined;
  onBusy: (busy: boolean) => void;
  onAdd: (src: string) => void;
  onClose: () => void;
}

export function WhiteboardImagePicker({ disabled, onUpload, onBusy, onAdd, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File) => {
    if (!onUpload || uploading || disabled) return;
    setError("");
    if (file.size > WHITEBOARD_IMAGE_MAX_BYTES || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, GIF, or WebP image up to 5 MB.");
      return;
    }
    setUploading(true);
    onBusy(true);
    try {
      onAdd(await onUpload(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Image could not be uploaded. Try again.");
    } finally {
      setUploading(false);
      onBusy(false);
    }
  };

  return <div className="whiteboard-image-picker">
    <form onSubmit={(event) => {
      event.preventDefault();
      if (disabled || uploading) return;
      const src = url.trim();
      if (!isWhiteboardImageSource(src)) { setError("Enter an HTTPS image URL."); return; }
      onAdd(src);
    }}>
      <label className="sr-only" htmlFor="whiteboard-image-url">Image URL</label>
      <input id="whiteboard-image-url" type="url" placeholder="https://…" value={url} maxLength={2048} disabled={disabled || uploading} onChange={(event) => setUrl(event.target.value)} autoFocus />
      <button className="secondary-button" disabled={disabled || uploading || !url.trim()}>Add image</button>
      {onUpload && <label className={`whiteboard-upload secondary-button${disabled || uploading ? " disabled" : ""}`}>
        <Upload size={16} aria-hidden="true" />{uploading ? "Uploading…" : "Upload image"}
        <input className="sr-only" type="file" aria-label="Upload image" accept="image/png,image/jpeg,image/gif,image/webp" disabled={disabled || uploading}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
      </label>}
      <IconButton label="Cancel image" icon={X} type="button" disabled={uploading} onClick={onClose} />
    </form>
    {error && <p className="work-object-error" role="alert">{error}</p>}
  </div>;
}
