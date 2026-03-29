import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, X } from "lucide-react";
import { documentsService, type DocumentDetail } from "../../services/documents.service";

export interface DocumentPreviewRef {
  id: string;
  title: string;
  jobTitle?: string;
  company?: string;
}

export function DocumentPreviewModal({
  doc,
  onClose,
}: {
  doc: DocumentPreviewRef;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    documentsService
      .get(doc.id)
      .then(setDetail)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [doc.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-[#1F2937] bg-[#111827] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#1F2937] p-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate pr-4 text-[16px] font-semibold text-white">{doc.title}</h2>
            {doc.jobTitle && (
              <p className="mt-0.5 text-[12px] text-[#9CA3AF]">
                Tailored for: {doc.jobTitle}{doc.company ? ` at ${doc.company}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[#6B7280] transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-[13px] text-[#EF4444]">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : detail?.content_html ? (
            <div
              className="rounded-2xl bg-[#0B0F14] p-3 md:p-5"
              dangerouslySetInnerHTML={{ __html: detail.content_html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[#D1D5DB]">
              {detail?.content_text ?? "No content available."}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#1F2937] p-4">
          <button
            type="button"
            onClick={async () => {
              setDownloading(true);
              try {
                await documentsService.download(doc.id);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to download document.");
              } finally {
                setDownloading(false);
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-[#374151] bg-[#1F2937] px-4 py-2 text-[13px] font-medium text-white transition-all disabled:opacity-60 hover:bg-[#374151]"
            disabled={downloading}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Downloading…" : "Download PDF"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-[#9CA3AF] transition-colors hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
