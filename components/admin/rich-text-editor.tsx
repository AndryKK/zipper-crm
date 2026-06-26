"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Pilcrow, Strikethrough, Undo, Redo, Code } from "lucide-react";
import { useState } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  rows?: number;
}

export function RichTextEditor({ value, onChange, rows = 8 }: Props) {
  const [showHtml, setShowHtml] = useState(false);
  const [rawHtml, setRawHtml] = useState(value);

  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      setRawHtml(html);
    },
    editorProps: {
      attributes: {
        style: `min-height:${rows * 24}px; outline:none; padding:12px; font-size:14px; line-height:1.6;`,
      },
    },
  });

  if (!editor) return null;

  function ToolBtn({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          border: "none",
          borderRadius: 4,
          background: active ? "rgba(99,102,241,0.12)" : "transparent",
          color: active ? "#6366f1" : "var(--text-muted, #888)",
          cursor: "pointer",
          transition: "all 0.12s",
        }}
      >
        {children}
      </button>
    );
  }

  function applyHtml() {
    editor.commands.setContent(rawHtml);
    onChange(rawHtml);
    setShowHtml(false);
  }

  return (
    <div
      style={{
        border: "1px solid var(--border, #e2e8f0)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--bg, #fff)",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "6px 8px",
          borderBottom: "1px solid var(--border, #e2e8f0)",
          background: "var(--bg-secondary, #f8fafc)",
          flexWrap: "wrap",
        }}
      >
        <ToolBtn title="Жирний (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <Bold size={14} />
        </ToolBtn>
        <ToolBtn title="Курсив (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <Italic size={14} />
        </ToolBtn>
        <ToolBtn title="Закреслення" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
          <Strikethrough size={14} />
        </ToolBtn>
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
        <ToolBtn title="Параграф" onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")}>
          <Pilcrow size={14} />
        </ToolBtn>
        <ToolBtn title="Маркований список" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          <List size={14} />
        </ToolBtn>
        <ToolBtn title="Нумерований список" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          <ListOrdered size={14} />
        </ToolBtn>
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
        <ToolBtn title="Відмінити (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}>
          <Undo size={14} />
        </ToolBtn>
        <ToolBtn title="Повторити (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}>
          <Redo size={14} />
        </ToolBtn>
        <div style={{ flex: 1 }} />
        <ToolBtn title="Редагувати HTML" onClick={() => { setRawHtml(editor.getHTML()); setShowHtml((v) => !v); }} active={showHtml}>
          <Code size={14} />
        </ToolBtn>
      </div>

      {/* HTML source editor */}
      {showHtml ? (
        <div style={{ padding: 8 }}>
          <textarea
            value={rawHtml}
            onChange={(e) => setRawHtml(e.target.value)}
            style={{
              width: "100%",
              minHeight: rows * 20,
              fontFamily: "monospace",
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 8,
              resize: "vertical",
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={applyHtml}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: "#6366f1", color: "#fff" }}
            >
              Застосувати
            </button>
            <button
              type="button"
              onClick={() => setShowHtml(false)}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--text)" }}
            >
              Скасувати
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{ cursor: "text" }}
          onClick={() => editor.commands.focus()}
        >
          <EditorContent editor={editor} />
        </div>
      )}

      <style>{`
        .ProseMirror p { margin: 0 0 8px 0; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 20px; margin: 0 0 8px 0; }
        .ProseMirror li { margin-bottom: 2px; }
        .ProseMirror strong { font-weight: 700; }
        .ProseMirror em { font-style: italic; }
        .ProseMirror s { text-decoration: line-through; }
        .ProseMirror:focus { outline: none; }
      `}</style>
    </div>
  );
}
