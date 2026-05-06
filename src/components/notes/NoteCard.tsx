import Link from 'next/link'
import { CalendarIcon, TagIcon, FolderIcon, Trash2Icon, EditIcon, LockIcon, UsersIcon, ShieldCheckIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

interface NoteCardProps {
  id: string
  title: string
  content: string
  category: string | null
  tags: string[]
  tagColors?: Record<string, string>
  isPrivate?: boolean
  isSecured?: boolean
  createdAt: string
  updatedAt: string
  onDelete?: (id: string) => void
  onEdit?: (id: string) => void
}

export function NoteCard({
  id,
  title,
  content,
  category,
  tags,
  tagColors,
  isPrivate = false,
  isSecured = false,
  createdAt,
  updatedAt,
  onDelete,
  onEdit,
}: NoteCardProps) {
  const formattedDate = format(new Date(updatedAt), 'MMM d, yyyy')
  const isRecentlyUpdated = new Date(updatedAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000


  return (
    <div className="relative group h-full">
      <Link href={`/notes/${id}`} className="block h-full">
        <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer overflow-hidden">
          <CardHeader className="p-3 pb-1">
            <div className="flex justify-between items-start gap-2">
              <CardTitle
                className="text-sm line-clamp-2 flex-1 [&_*]:leading-snug"
                dangerouslySetInnerHTML={{ __html: title }}
              />
              <div className="flex items-center gap-1 shrink-0">
                {isSecured && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                    <ShieldCheckIcon className="h-2.5 w-2.5" /> Secure
                  </span>
                )}
                {isPrivate ? (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                    <LockIcon className="h-2.5 w-2.5" /> Private
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                    <UsersIcon className="h-2.5 w-2.5" /> Family
                  </span>
                )}
                {isRecentlyUpdated && (
                  <span className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded-full">
                    New
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <div className="flex items-center gap-0.5">
                <CalendarIcon className="h-2.5 w-2.5" />
                <span>{formattedDate}</span>
              </div>
              {category && (
                <div className="flex items-center gap-0.5">
                  <FolderIcon className="h-2.5 w-2.5" />
                  <span>{category}</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 px-3 pb-3">
            {isSecured ? (
              <div className="relative overflow-hidden">
                <div className="text-xs text-muted-foreground line-clamp-2 blur-sm select-none [&_h1]:text-xs [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_*]:!my-0 [&_ul]:pl-4 [&_ol]:pl-4"
                  dangerouslySetInnerHTML={{ __html: content || '' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-medium text-muted-foreground bg-background/80 px-2 py-1 rounded-full backdrop-blur-sm">
                    🔒 PIN required to view
                  </span>
                </div>
              </div>
            ) : content ? (
              <div
                className="text-xs text-muted-foreground line-clamp-2 [&_h1]:text-xs [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_*]:!my-0 [&_ul]:pl-4 [&_ol]:pl-4"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <p className="text-xs text-muted-foreground italic">No content</p>
            )}
            
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {tags.slice(0, 3).map((tag, index) => {
                  const color = tagColors?.[tag]
                  return (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                      style={{
                        backgroundColor: color ? `${color}20` : undefined,
                        color: color || undefined,
                      }}
                    >
                      {color && (
                        <span
                          className="inline-block w-1 h-1 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {tag}
                    </span>
                  )
                })}
                {tags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{tags.length - 3} more
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
      
      {(onDelete || onEdit) && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit(id)
              }}
            >
              <EditIcon className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm text-destructive hover:text-destructive"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelete(id)
              }}
            >
              <Trash2Icon className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}