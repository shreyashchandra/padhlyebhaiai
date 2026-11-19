import { useRef, useState } from "react";
import { FileText, ImageIcon, UploadCloud, X } from "lucide-react";
import { cn } from "../lib/utils";

export default function FileDrop({ file, onChange, accept = "application/pdf,image/*", hint = "PDF or photo, up to 15 MB" }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const pick = (f) => f && onChange(f);

  if (file) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const Icon = isPdf ? FileText : ImageIcon;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{file.name}</p>
          <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-fg" aria-label="Remove file">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
        over ? "border-brand-500 bg-brand-500/5" : "border-line hover:border-brand-400 hover:bg-surface-2",
      )}
    >
      <UploadCloud className="h-7 w-7 text-brand-500" />
      <span className="text-sm font-medium text-fg">Drop a file or click to upload</span>
      <span className="text-xs text-muted">{hint}</span>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </button>
  );
}
