import { useEffect, useState } from "react";
import { Download, Eye, FileText, Loader2, AlertCircle, Pencil } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { documentsService, type DocumentItem } from "../services/documents.service";
import { DocumentPreviewModal, type DocumentPreviewRef } from "../components/documents/DocumentPreviewModal";
import { DocumentEditorModal } from "../components/documents/DocumentEditorModal";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export function CoverLetters() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocumentPreviewRef | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocumentPreviewRef | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    documentsService
      .list("cover_letter")
      .then(setDocs)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load cover letters."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="mb-2 text-[32px] font-semibold text-white">Cover Letters</h1>
        <p className="text-[14px] text-[#9CA3AF]">
          Review every AI-generated cover letter saved from the Job Board and open or download them anytime.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-[#7F1D1D] bg-[#7F1D1D]/10 px-4 py-3 text-[13px] text-[#FCA5A5]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#4F8CFF]" />
        </div>
      ) : docs.length === 0 ? (
        <Card className="border-[#1F2937] bg-[#111827] p-10 text-center">
          <FileText className="mx-auto mb-4 h-8 w-8 text-[#4F8CFF]" />
          <h2 className="mb-2 text-[18px] font-semibold text-white">No cover letters yet</h2>
          <p className="text-[13px] text-[#9CA3AF]">
            Open a job from the Job Board and generate a cover letter to see it here.
          </p>
        </Card>
      ) : (
        <Card className="border-[#1F2937] bg-[#111827]">
          <Table>
            <TableHeader>
              <TableRow className="border-[#1F2937] hover:bg-transparent">
                <TableHead className="text-[#9CA3AF]">Title</TableHead>
                <TableHead className="text-[#9CA3AF]">Company</TableHead>
                <TableHead className="text-[#9CA3AF]">Location</TableHead>
                <TableHead className="text-[#9CA3AF]">Updated</TableHead>
                <TableHead className="text-[#9CA3AF]">Origin</TableHead>
                <TableHead className="text-right text-[#9CA3AF]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id} className="border-[#1F2937] hover:bg-[#0B0F14]">
                  <TableCell>
                    <button
                      type="button"
                      onClick={() =>
                        setViewingDoc({
                          id: doc.id,
                          title: doc.jobTitle ?? doc.title,
                          jobTitle: doc.jobTitle,
                          company: doc.company,
                        })
                      }
                      className="text-left text-[13px] font-medium text-white transition-colors hover:text-[#4F8CFF]"
                    >
                      {doc.jobTitle ?? doc.title}
                    </button>
                  </TableCell>
                  <TableCell className="text-[13px] text-[#9CA3AF]">{doc.company ?? "—"}</TableCell>
                  <TableCell className="text-[13px] text-[#9CA3AF]">{doc.location ?? "—"}</TableCell>
                  <TableCell className="text-[13px] text-[#9CA3AF]">{formatDate(doc.lastModified)}</TableCell>
                  <TableCell className="text-[13px] text-[#9CA3AF]">
                    {doc.origin === "ai_generated" ? "AI Generated" : doc.origin}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setViewingDoc({
                            id: doc.id,
                            title: doc.jobTitle ?? doc.title,
                            jobTitle: doc.jobTitle,
                            company: doc.company,
                          })
                        }
                        className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditingDoc({
                            id: doc.id,
                            title: doc.jobTitle ?? doc.title,
                            jobTitle: doc.jobTitle,
                            company: doc.company,
                          })
                        }
                        className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setDownloadingId(doc.id);
                          try {
                            await documentsService.download(doc.id);
                          } finally {
                            setDownloadingId(null);
                          }
                        }}
                        className="border-[#374151] bg-[#1F2937] text-white hover:bg-[#374151]"
                        disabled={downloadingId === doc.id}
                      >
                        {downloadingId === doc.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Download
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {viewingDoc && (
        <DocumentPreviewModal
          doc={viewingDoc}
          onClose={() => setViewingDoc(null)}
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

      {editingDoc && (
        <DocumentEditorModal
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
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
