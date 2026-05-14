'use client'

import { useState } from 'react'
import {
  BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon,
  ListIcon, ListOrderedIcon, LinkIcon, ImageIcon,
  AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
  Heading1Icon, Heading2Icon, Heading3Icon, TypeIcon,
  BaselineIcon, HighlighterIcon, RemoveFormattingIcon,
} from 'lucide-react'

const FONT_SIZES = [
  { label: 'Small',  value: '0.875em' },
  { label: 'Normal', value: '1em'     },
  { label: 'Large',  value: '1.25em'  },
  { label: 'XL',     value: '1.5em'   },
  { label: '2XL',    value: '2em'     },
]

interface Props {
  exec: (command: string, value?: string) => void
  insertLink: () => void
  insertImage: () => void
  saveSelection: () => void
  applyTextColor: (color: string) => void
  applyHighlightColor: (color: string) => void
  textColorInputRef: React.RefObject<HTMLInputElement | null>
  highlightColorInputRef: React.RefObject<HTMLInputElement | null>
  textColor: string
  highlightColor: string
  isLoading: boolean
}

function ToolButton({ onClick, title, children, isLoading }: {
  onClick: () => void; title: string; children: React.ReactNode; isLoading: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className="h-7 w-7 flex items-center justify-center rounded text-sm transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground disabled:opacity-50"
      disabled={isLoading}
    >
      {children}
    </button>
  )
}

function ColorButton({ inputRef, color, title, onColorChange, saveSelection, isLoading, children }: {
  inputRef: React.RefObject<HTMLInputElement | null>
  color: string
  title: string
  onColorChange: (c: string) => void
  saveSelection: () => void
  isLoading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        title={title}
        onMouseDown={e => { e.preventDefault(); saveSelection(); inputRef.current?.click() }}
        className="h-7 w-7 flex flex-col items-center justify-center gap-0 rounded transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground disabled:opacity-50"
        disabled={isLoading}
      >
        {children}
        <span className="block h-[3px] w-4 rounded-full mt-0.5" style={{ backgroundColor: color }} />
      </button>
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={e => onColorChange(e.target.value)}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  )
}

const Sep = () => <div className="w-px h-5 bg-border mx-1" />

export function NoteEditorToolbar({
  exec, insertLink, insertImage, saveSelection, applyTextColor, applyHighlightColor,
  textColorInputRef, highlightColorInputRef, textColor, highlightColor, isLoading,
}: Props) {
  const [fontSizeKey, setFontSizeKey] = useState(0)

  function setFontSize(size: string) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!range.collapsed) {
      const span = document.createElement('span')
      span.style.fontSize = size
      range.surroundContents(span)
      sel.removeAllRanges()
    }
    setFontSizeKey(k => k + 1)
  }

  const tool = (cmd: string, value?: string) => () => exec(cmd, value)

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border border-input rounded-t-md bg-muted/40">
      <ToolButton onClick={tool('formatBlock', 'h1')} title="Heading 1" isLoading={isLoading}><Heading1Icon className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('formatBlock', 'h2')} title="Heading 2" isLoading={isLoading}><Heading2Icon className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('formatBlock', 'h3')} title="Heading 3" isLoading={isLoading}><Heading3Icon className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('formatBlock', 'p')}  title="Normal text" isLoading={isLoading}><TypeIcon className="h-3.5 w-3.5" /></ToolButton>

      <Sep />

      <select
        key={fontSizeKey}
        onMouseDown={e => e.preventDefault()}
        onChange={e => { if (e.target.value) setFontSize(e.target.value) }}
        className="h-7 text-xs rounded border border-input bg-background px-1 text-muted-foreground cursor-pointer"
        defaultValue=""
        disabled={isLoading}
        title="Font size"
      >
        <option value="" disabled>Size</option>
        {FONT_SIZES.map(fs => <option key={fs.value} value={fs.value}>{fs.label}</option>)}
      </select>

      <Sep />

      <ToolButton onClick={tool('bold')}          title="Bold (Ctrl+B)"  isLoading={isLoading}><BoldIcon          className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('italic')}         title="Italic (Ctrl+I)" isLoading={isLoading}><ItalicIcon         className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('underline')}      title="Underline (Ctrl+U)" isLoading={isLoading}><UnderlineIcon      className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('strikeThrough')}  title="Strikethrough"  isLoading={isLoading}><StrikethroughIcon  className="h-3.5 w-3.5" /></ToolButton>

      <Sep />

      <ToolButton onClick={tool('justifyLeft')}   title="Align left"   isLoading={isLoading}><AlignLeftIcon   className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('justifyCenter')} title="Align centre" isLoading={isLoading}><AlignCenterIcon className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('justifyRight')}  title="Align right"  isLoading={isLoading}><AlignRightIcon  className="h-3.5 w-3.5" /></ToolButton>

      <Sep />

      <ToolButton onClick={tool('insertUnorderedList')} title="Bullet list"   isLoading={isLoading}><ListIcon        className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={tool('insertOrderedList')}   title="Numbered list" isLoading={isLoading}><ListOrderedIcon className="h-3.5 w-3.5" /></ToolButton>

      <Sep />

      <ToolButton onClick={insertLink} title="Insert link" isLoading={isLoading}><LinkIcon className="h-3.5 w-3.5" /></ToolButton>
      <ToolButton onClick={insertImage} title="Insert image" isLoading={isLoading}><ImageIcon className="h-3.5 w-3.5" /></ToolButton>

      <Sep />

      <ColorButton inputRef={textColorInputRef}      color={textColor}      title="Text colour"      onColorChange={applyTextColor}      saveSelection={saveSelection} isLoading={isLoading}><BaselineIcon    className="h-3.5 w-3.5" /></ColorButton>
      <ColorButton inputRef={highlightColorInputRef} color={highlightColor} title="Highlight colour" onColorChange={applyHighlightColor} saveSelection={saveSelection} isLoading={isLoading}><HighlighterIcon className="h-3.5 w-3.5" /></ColorButton>

      <Sep />

      <ToolButton onClick={tool('removeFormat')} title="Clear formatting" isLoading={isLoading}><RemoveFormattingIcon className="h-3.5 w-3.5" /></ToolButton>
    </div>
  )
}
