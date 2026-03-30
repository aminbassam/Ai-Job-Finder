import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Loader2, Save, X } from "lucide-react";
import { RichTextEditor } from "../ui/rich-text-editor";
import { documentsService, type DocumentDetail } from "../../services/documents.service";
import type { DocumentPreviewRef } from "./DocumentPreviewModal";
import { Input } from "../ui/input";

function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function CoverLetterEditorModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: DocumentPreviewRef;
  onClose: () => void;
  onSaved: (updated: { id: string; title: string; lastModified: string; version: number }) => void;
}) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [contentHtml, setContentHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaved(false);

    documentsService
      .get(doc.id)
      .then((nextDetail) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setTitle(nextDetail.title);
        setContentHtml(nextDetail.content_html || plainTextToHtml(nextDetail.content_text || ""));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load cover letter.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  const versionText = useMemo(() => {
    if (!detail?.version) return "Draft";
    return `Version ${detail.version}`;
  }, [detail?.version]);

  async function handleSave() {
    if (!contentHtml.trim()) {
      setError("Cover letter content cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await documentsService.update(doc.id, {
        title: title.trim(),
        contentHtml,
        changeSummary: "Edited cover letter",
      });

      const nextLastModified = result.document.lastModified;
      setDetail((prev) => prev ? {
        ...prev,
        title: result.document.title,
        version: result.document.version,
        lastModified: nextLastModified,
        content_html: result.document.contentHtml,
        content_text: result.document.contentText,
      } : prev);
      setTitle(result.document.title);
      setContentHtml(result.document.contentHtml);
      setSaved(true);
      onSaved({
        id: doc.id,
        title: result.document.title,
        version: result.document.version,
        lastModified: nextLastModified,
      });
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cover letter.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#1F2937] bg-[#111827] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#1F2937] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate pr-4 text-[17px] font-semibold text-white">Edit Cover Letter</h2>
            <p className="mt-1 text-[12px] text-[#9CA3AF]">
              Save your edits as the latest cover letter version. Downloads will use the updated version automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[#6B7280] transition-colors hover:text-white"
            title="Close editor"
            aria-label="Close editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#4F8CFF]" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_280px]">
                <div>
                  <label className="mb-2 block text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                    Cover Letter Title
                  </label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="border-[#1F2937] bg-[#0B0F14] text-white"
                    placeholder="Cover letter title"
                  />
                </div>
                <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B7280]">Status</p>
                  <p className="mt-2 text-[13px] font-medium text-white">{versionText}</p>
                  <p className="mt-1 text-[12px] text-[#9CA3AF]">
                    {detail?.lastModified ? `Last updated ${new Date(detail.lastModified).toLocaleString()}` : "Loaded"}
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-[#7F1D1D] bg-[#7F1D1D]/10 px-4 py-3 text-[13px] text-[#FCA5A5]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {saved && (
                <div className="rounded-lg border border-[#14532D] bg-[#14532D]/10 px-4 py-3 text-[13px] text-[#86EFAC]">
                  Cover letter saved. The latest version is ready to preview and download.
                </div>
              )}

              <div>
                <label className="mb-2 block text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                  Cover Letter Content
                </label>
                <RichTextEditor
                  value={contentHtml}
                  onChange={setContentHtml}
                  placeholder="Edit your cover letter here…"
                  minRows={16}
                  className="min-h-[26rem]"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#1F2937] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[12px] text-[#6B7280]">
            Rich text formatting is preserved when you save and when you download the cover letter PDF.
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={async () => {
                setDownloading(true);
                try {
                  await documentsService.download(doc.id);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to download cover letter.");
                } finally {
                  setDownloading(false);
                }
              }}
              className="flex items-center gap-2 rounded-lg border border-[#374151] bg-[#1F2937] px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-[#374151] disabled:opacity-60"
              disabled={loading || saving || downloading}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? "Downloading…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] text-[#9CA3AF] transition-colors hover:text-white"
              disabled={saving}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="flex items-center gap-2 rounded-lg bg-[#4F8CFF] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#4F8CFF]/90 disabled:opacity-60"
              disabled={loading || saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
