// src/components/ui/PolicyEditor.tsx
import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { cn } from '@/utils/cn';

interface PolicyEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

const MenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null;

  const buttons = [
    {
      label: 'H1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor.isActive('heading', { level: 1 }),
    },
    {
      label: 'H2',
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive('heading', { level: 2 }),
    },
    {
      label: 'H3',
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      active: editor.isActive('heading', { level: 3 }),
    },
    {
      label: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
    },
    {
      label: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
    },
    {
      label: 'Strike',
      action: () => editor.chain().focus().toggleStrike().run(),
      active: editor.isActive('strike'),
    },
    {
      label: 'Bullet List',
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
    },
    {
      label: 'Ordered List',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive('orderedList'),
    },
    {
      label: 'Code Block',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive('codeBlock'),
    },
    {
      label: 'Blockquote',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote'),
    },
    {
      label: 'Horizontal Rule',
      action: () => editor.chain().focus().setHorizontalRule().run(),
      active: false,
    },
    {
      label: 'Undo',
      action: () => editor.chain().focus().undo().run(),
      active: false,
    },
    {
      label: 'Redo',
      action: () => editor.chain().focus().redo().run(),
      active: false,
    },
  ];

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-surface-alt border-b border-line flex-wrap">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          type="button"
          onClick={btn.action}
          className={cn(
            'h-7 px-2.5 text-xs font-medium rounded transition-colors',
            btn.active
              ? 'bg-primary text-white'
              : 'bg-white text-ink-secondary hover:bg-white hover:text-ink border border-line'
          )}
          aria-label={btn.label}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
};

/**
 * PolicyEditor Component
 * Rich text editor using Tiptap for policy content creation and editing.
 * Renders as read-only when viewing published policies.
 */
export function PolicyEditor({ content, onChange, readOnly = false }: PolicyEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
    ],
    content,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: cn(
          'focus:outline-none min-h-[300px] px-4 py-3 text-sm text-ink tiptap-content',
          readOnly ? 'cursor-default' : ''
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external content changes to editor (e.g., switching versions)
  const prevContent = useRef(content);
  useEffect(() => {
    if (editor && content !== prevContent.current) {
      const currentContent = editor.getHTML();
      if (content !== currentContent) {
        editor.commands.setContent(content);
      }
      prevContent.current = content;
    }
  }, [editor, content]);

  if (!editor) return null;

  return (
    <div className={cn(
      'border border-line rounded-md overflow-hidden bg-white',
      readOnly ? '' : 'focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary'
    )}>
      {!readOnly && <MenuBar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
