import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Undo,
  Redo,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className={`rounded p-1 transition-colors ${
        active
          ? "bg-[#4F8CFF]/20 text-[#4F8CFF]"
          : "text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white"
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add details…",
  className = "",
  minRows = 4,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: value || "",
    onUpdate({ editor: ed }) {
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: "outline-none min-h-[inherit] text-[13px] text-white leading-relaxed",
      },
    },
  });

  // Sync external value changes (e.g. AI fill) without overriding cursor
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) return null;

  const minHeight = `${minRows * 1.625}rem`;

  return (
    <div
      className={`rounded-lg border border-[#1F2937] bg-[#0B0F14] focus-within:border-[#4F8CFF]/50 transition-colors ${className}`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-[#1F2937] px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold (⌘B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic (⌘I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline (⌘U)"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-[#1F2937]" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-[#1F2937]" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (⌘Z)"
        >
          <Undo className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (⌘⇧Z)"
        >
          <Redo className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div className="px-3 py-2.5" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #4B5563;
          pointer-events: none;
          height: 0;
        }
        .tiptap ul { list-style-type: disc; padding-left: 1.25rem; margin: 0.25rem 0; }
        .tiptap ol { list-style-type: decimal; padding-left: 1.25rem; margin: 0.25rem 0; }
        .tiptap li { margin: 0.1rem 0; }
        .tiptap strong { font-weight: 600; }
        .tiptap em { font-style: italic; }
        .tiptap u { text-decoration: underline; }
        .tiptap p { margin: 0.15rem 0; }
      `}</style>
    </div>
  );
}
