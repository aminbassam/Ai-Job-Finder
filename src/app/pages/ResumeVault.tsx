import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  Eye,
  Pencil,
  Plus,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { documentsService, DocumentItem } from "../services/documents.service";
import { DocumentPreviewModal, type DocumentPreviewRef } from "../components/documents/DocumentPreviewModal";
import { DocumentEditorModal } from "../components/documents/DocumentEditorModal";

/* ─── helpers ──────────────────────────────────────────────────────────── */

const TAG_COLORS: Record<string, string> = {
  Master:         "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/30",
  "AI Generated": "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/30",
  Optimized:      "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
  Updated:        "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
  Tailored:       "bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/30",
};

function tagClass(tag: string): string {
  return TAG_COLORS[tag] ?? "bg-[#1F2937] text-[#9CA3AF] border-[#374151]";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ─── Resume card ──────────────────────────────────────────────────────── */

function ResumeCard({
  doc,
  onView,
  onEdit,
}: {
  doc: DocumentItem;
  onView: (doc: DocumentItem) => void;
  onEdit: (doc: DocumentPreviewRef) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const isAiGenerated = doc.origin === "ai_generated";
  const isTailored = doc.resumeType === "tailored";

  const tags = [...(doc.tags ?? [])];
  if (isAiGenerated && !tags.includes("AI Generated")) tags.push("AI Generated");

  return (
    <Card className="bg-[#111827] border-[#1F2937] p-6 hover:border-[#4F8CFF]/30 transition-all group">
      {/* Icon row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-[#4F8CFF]/10">
          <FileText className="h-7 w-7 text-[#4F8CFF]" />
        </div>
        {isAiGenerated && (
          <span className="flex items-center gap-1 text-[10px] bg-[#4F8CFF]/10 text-[#4F8CFF] border border-[#4F8CFF]/20 px-2 py-0.5 rounded-full font-medium">
            <Sparkles className="h-2.5 w-2.5" />
            AI Generated
          </span>
        )}
      </div>

      {/* Content */}
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-white mb-1 leading-tight line-clamp-2">
          {doc.title}
        </h3>
        {doc.jobTitle && (
          <p className="text-[11px] text-[#6B7280] mb-1.5">
            Tailored for: {doc.jobTitle}{doc.company ? ` at ${doc.company}` : ""}
          </p>
        )}
        <p className="text-[12px] text-[#9CA3AF] mb-3">
          Modified {formatDate(doc.lastModified)}
        </p>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.filter((t) => t !== "AI Generated").map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={`text-[10px] border ${tagClass(tag)}`}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Type badge */}
        <Badge
          variant="outline"
          className={`text-[11px] ${
            isTailored
              ? "border-[#4F8CFF]/50 text-[#4F8CFF]"
              : "border-[#8B5CF6]/50 text-[#8B5CF6]"
          }`}
        >
          {isTailored ? "Tailored Resume" : "Master Resume"}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-4 border-t border-[#1F2937]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(doc)}
          className="flex-1 bg-[#1F2937] hover:bg-[#374151] text-white"
        >
          <Eye className="h-4 w-4 mr-2" />
          View
        </Button>
        <button
          type="button"
          onClick={() =>
            onEdit({
              id: doc.id,
              title: doc.title,
              jobTitle: doc.jobTitle,
              company: doc.company,
            })
          }
          className="flex items-center justify-center h-8 w-8 bg-[#1F2937] hover:bg-[#374151] text-white rounded-md transition-colors"
          title="Edit"
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={async () => {
            setDownloading(true);
            try {
              await documentsService.download(doc.id);
            } finally {
              setDownloading(false);
            }
          }}
          className="flex items-center justify-center h-8 w-8 bg-[#1F2937] hover:bg-[#374151] text-white rounded-md transition-colors"
          title="Download"
          aria-label="Download"
          disabled={downloading}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </Card>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────── */

export function ResumeVault() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocumentItem | null>(null);
  const [editing, setEditing] = useState<DocumentPreviewRef | null>(null);

  useEffect(() => {
    documentsService
      .list("resume")
      .then(setDocs)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-white mb-2">Resume Vault</h1>
          <p className="text-[14px] text-[#9CA3AF]">
            Manage your master resume and tailored versions
          </p>
        </div>
        <Button className="bg-[#4F8CFF] hover:bg-[#4F8CFF]/90 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Create New Resume
        </Button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-[#4F8CFF] animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-[#EF4444] text-[13px] py-8">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {docs.map((doc) => (
            <ResumeCard
              key={doc.id}
              doc={doc}
              onView={setViewing}
              onEdit={setEditing}
            />
          ))}

          {/* Create New card */}
          <Card className="bg-[#111827] border-[#1F2937] border-dashed p-6 hover:border-[#4F8CFF]/50 transition-all group cursor-pointer flex flex-col items-center justify-center min-h-[280px]">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-[#4F8CFF]/10 mb-4 group-hover:bg-[#4F8CFF]/20 transition-colors">
              <Plus className="h-7 w-7 text-[#4F8CFF]" />
            </div>
            <h3 className="text-[15px] font-semibold text-white mb-2">Create New Resume</h3>
            <p className="text-[13px] text-[#9CA3AF] text-center">
              Start from scratch or tailor to a specific job
            </p>
          </Card>
        </div>
      )}

      {/* Tips Section */}
      <Card className="bg-[#111827] border-[#1F2937] p-6 mt-8">
        <h2 className="text-[18px] font-semibold text-white mb-4">Resume Tips</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-[14px] font-semibold text-[#4F8CFF] mb-2">Master Resume</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Keep one comprehensive resume with all your experience and skills. Use it as a base for tailored versions.
            </p>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[#22C55E] mb-2">Tailored Versions</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Create job-specific resumes that highlight relevant experience. AI can help optimize for ATS systems.
            </p>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-[#F59E0B] mb-2">Keep Updated</h3>
            <p className="text-[13px] text-[#9CA3AF]">
              Regularly update your master resume with new skills, projects, and achievements as they happen.
            </p>
          </div>
        </div>
      </Card>

      {/* View modal */}
      {viewing && (
        <DocumentPreviewModal
          doc={viewing}
          onClose={() => setViewing(null)}
          onUpdated={(updated) => {
            setDocs((prev) =>
              prev.map((doc) =>
                doc.id === updated.id
                  ? {
                      ...doc,
                      title: updated.title,
                      version: updated.version,
                      lastModified: updated.lastModified,
                    }
                  : doc
              )
            );
          }}
        />
      )}
      {editing && (
        <DocumentEditorModal
          doc={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setDocs((prev) =>
              prev.map((doc) =>
                doc.id === updated.id
                  ? {
                      ...doc,
                      title: updated.title,
                      version: updated.version,
                      lastModified: updated.lastModified,
                    }
                  : doc
              )
            );
          }}
        />
      )}
    </div>
  );
}
