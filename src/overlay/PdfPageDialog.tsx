import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pdfPageThumbnail } from "./pdf";
import type { PdfDocument } from "./pdf";

interface PdfPageDialogProps {
  pdf: PdfDocument;
  fileName: string;
  onChoose: (pageNumber: number) => void;
  onCancel: () => void;
}

export function PdfPageDialog({
  pdf,
  fileName,
  onChoose,
  onCancel,
}: PdfPageDialogProps) {
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<number, string>>(
    () => new Map(),
  );

  // One page at a time: a long PDF fills in progressively without a spike.
  useEffect(() => {
    const controller = new AbortController();
    const isCancelled = () => controller.signal.aborted;
    const urls: Array<string> = [];
    void (async () => {
      for (let page = 1; page <= pdf.numPages && !isCancelled(); page += 1) {
        try {
          const url = await pdfPageThumbnail(pdf, page);
          if (isCancelled()) {
            URL.revokeObjectURL(url);
            break;
          }
          urls.push(url);
          setThumbnails((current) => new Map(current).set(page, url));
        } catch {
          // The page stays a numbered placeholder; it can still be chosen.
        }
      }
    })();
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pdf]);

  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choisir la page du plan</DialogTitle>
          <DialogDescription className="truncate">
            {fileName} — {pdf.numPages} pages
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
          {pages.map((page) => {
            const thumbnail = thumbnails.get(page);
            return (
              <button
                key={page}
                type="button"
                onClick={() => onChoose(page)}
                className="flex flex-col items-center gap-1 rounded-md border border-border p-2 transition-colors hover:border-ring hover:bg-muted"
                aria-label={`Page ${page}`}
              >
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt=""
                    className="max-h-40 w-full object-contain"
                  />
                ) : (
                  <span className="grid h-40 w-full place-items-center bg-muted text-xs text-muted-foreground">
                    …
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Page {page}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
