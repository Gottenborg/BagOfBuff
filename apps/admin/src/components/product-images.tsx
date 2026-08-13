import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button, Input } from "@repo/ui";
import { supabase } from "../lib/supabase";
import { apiErrorMessage } from "../lib/errors";
import { api } from "../lib/api";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  position: number;
}

/**
 * Gallery management for one product.
 *
 * Files go straight from the browser to Supabase Storage — the back office
 * already holds an authenticated session, and proxying multi-megabyte uploads
 * through the API would buy nothing. Only the resulting public URL is recorded
 * against the product.
 *
 * The first image (lowest position) is the primary one: it represents the
 * product in listings and as the social preview.
 */
export function ProductImages({
  productId,
  images,
  onChanged,
}: {
  productId: string;
  images: ProductImage[];
  onChanged: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const ordered = [...images].sort((a, b) => a.position - b.position);

  async function upload(files: FileList) {
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!ACCEPTED.includes(file.type)) {
          setError(`${file.name}: only JPEG, PNG, WebP and AVIF are accepted.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`${file.name}: larger than 5 MB.`);
          continue;
        }

        const extension = file.name.split(".").pop() ?? "jpg";
        const path = `${productId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { cacheControl: "31536000", upsert: false });
        if (uploadError) {
          setError(`${file.name}: upload failed — ${uploadError.message}`);
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKET).getPublicUrl(path);

        const { error: attachError, response } = await api.POST(
          "/products/{id}/images",
          {
            params: { path: { id: productId } },
            // Alt text is filled in after upload; an empty string is recorded
            // rather than a guess, and the UI flags it as missing.
            body: { url: publicUrl, alt: "" },
          },
        );
        if (attachError) {
          setError(
            apiErrorMessage(attachError, response, `${file.name}: not saved.`),
          );
        }
      }
      onChanged();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const patch = useMutation({
    mutationFn: async ({
      imageId,
      body,
    }: {
      imageId: string;
      body: { alt?: string; position?: number };
    }) => {
      const { error, response } = await api.PATCH("/products/images/{imageId}", {
        params: { path: { imageId } },
        body,
      });
      if (error)
        throw new Error(apiErrorMessage(error, response, "Could not update."));
    },
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: async (image: ProductImage) => {
      const { error, response } = await api.DELETE(
        "/products/images/{imageId}",
        { params: { path: { imageId: image.id } } },
      );
      if (error)
        throw new Error(apiErrorMessage(error, response, "Could not remove."));

      // Best effort: drop the stored file too so the bucket doesn't accumulate
      // orphans. The gallery entry is already gone either way.
      const path = image.url.split(`/${BUCKET}/`)[1];
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    },
    onSuccess: onChanged,
  });

  /** Swap positions with the neighbour, so ordering is explicit and stable. */
  function move(index: number, direction: -1 | 1) {
    const current = ordered[index];
    const neighbour = ordered[index + direction];
    if (!current || !neighbour) return;
    patch.mutate({ imageId: current.id, body: { position: neighbour.position } });
    patch.mutate({ imageId: neighbour.id, body: { position: current.position } });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold text-muted">
          Images — the first is used in listings and social previews
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload images"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {patch.isError && (
        <p className="mt-2 text-sm text-danger">{patch.error.message}</p>
      )}
      {remove.isError && (
        <p className="mt-2 text-sm text-danger">{remove.error.message}</p>
      )}

      {ordered.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No images yet. A product without a photo is unlikely to sell.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-3">
          {ordered.map((image, index) => (
            <li
              key={image.id}
              className="w-56 rounded-md border border-border bg-paper p-2"
            >
              <div className="relative">
                <img
                  src={image.url}
                  alt={image.alt || "Product image awaiting alt text"}
                  className="h-32 w-full rounded object-cover"
                />
                {index === 0 && (
                  <Badge variant="brand" className="absolute left-1 top-1">
                    Primary
                  </Badge>
                )}
              </div>

              <Input
                className="mt-2 text-xs"
                value={image.alt}
                placeholder="Alt text (describe the image)"
                aria-label="Alt text"
                onChange={(e) =>
                  patch.mutate({
                    imageId: image.id,
                    body: { alt: e.target.value },
                  })
                }
              />
              {!image.alt.trim() && (
                <p className="mt-1 text-xs text-danger">
                  Missing alt text — needed for accessibility and SEO.
                </p>
              )}

              <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === 0 || patch.isPending}
                    onClick={() => move(index, -1)}
                    aria-label="Move image earlier"
                  >
                    ←
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === ordered.length - 1 || patch.isPending}
                    onClick={() => move(index, 1)}
                    aria-label="Move image later"
                  >
                    →
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(image)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
