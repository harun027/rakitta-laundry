"use client";

import * as React from "react";
import { Camera, Image as ImageIcon, X, AlertCircle } from "lucide-react";

/* =============================================================================
   PRD §7.2 FR12 & §11.4 — Intake Condition Photo Uploader.
   Compresses images on the client side (< 5MB limit), strips GPS EXIF, 
   and generates safe preview thumbnails for stain / damage notes.
   ============================================================================= */

export interface ConditionPhoto {
  id: string;
  dataUrl: string;
  fileName: string;
  sizeBytes: number;
}

export function ConditionPhotoUploader({
  photos,
  onChange,
  maxPhotos = 3,
}: {
  photos: ConditionPhoto[];
  onChange: (photos: ConditionPhoto[]) => void;
  maxPhotos?: number;
}) {
  const [error, setError] = React.useState<string>("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (photos.length + files.length > maxPhotos) {
      setError(`Maksimal ${maxPhotos} foto dokumentasi noda/kondisi.`);
      return;
    }

    files.forEach((file) => {
      // Validate type
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError("Hanya format JPG, PNG, atau WebP yang diperbolehkan.");
        return;
      }
      // 5MB Limit per PRD §10.2
      if (file.size > 5 * 1024 * 1024) {
        setError("Ukuran foto maksimal 5 MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) return;

        // Client-side canvas compression to strip sensitive EXIF & resize
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

          onChange([
            ...photos,
            {
              id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              dataUrl: compressedDataUrl,
              fileName: file.name,
              sizeBytes: Math.round(compressedDataUrl.length * 0.75),
            },
          ]);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleRemove = (id: string) => {
    onChange(photos.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-neutral-700 block">
          Foto Kondisi / Noda Awal (Opsional)
        </label>
        <span className="text-[10px] text-neutral-400 font-mono">
          {photos.length}/{maxPhotos} Foto (Maks 5MB)
        </span>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Thumbnails Grid */}
      <div className="flex flex-wrap gap-3">
        {photos.map((p) => (
          <div
            key={p.id}
            className="relative size-20 rounded-xl overflow-hidden border border-neutral-300 bg-neutral-100 group shadow-xs"
          >
            <img src={p.dataUrl} alt="Kondisi Cucian" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(p.id)}
              className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black transition-all"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="size-20 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50/50 hover:bg-neutral-100 hover:border-neutral-400 flex flex-col items-center justify-center text-neutral-500 transition-all gap-1 cursor-pointer"
          >
            <Camera className="size-5" />
            <span className="text-[10px] font-bold">+ Foto</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
