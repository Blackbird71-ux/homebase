import Link from 'next/link'
import { CalendarIcon, TagIcon, FolderIcon, Trash2Icon, EditIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

interface NoteCardProps {
  id: string
  title: string
  content: string
  category: string | null
  tags: string[]
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
  createdAt,
  updatedAt,
  onDelete,
  onEdit,
}: NoteCardProps) {
  const formattedDate = format(new Date(updatedAt), 'MMM d, yyyy')
  const isRecentlyUpdated = new Date(updatedAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000

  // Strip HTML tags for preview
  const plainContent = content.replace(/<[^>]*>/g, '')
  const previewContent = plainContent.length > 150 
    ? plainContent.substring(0, 150) + '...' 
    : plainContent

  return (
    <div className="relative group h-full">
      <Link href={`/notes/${id}`} className="block h-full">
        <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <CardTitle className="text-base line-clamp-2">{title}</CardTitle>
              {isRecentlyUpdated && (
                <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded-full">
                  New
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                <span>{formattedDate}</span>
              </div>
              {category && (
                <div className="flex items-center gap-1">
                  <FolderIcon className="h-3 w-3" />
                  <span>{category}</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground line-clamp-3">{previewContent}</p>
            
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-full"
                  >
                    <TagIcon className="h-2 w-2" />
                    {tag}
                  </span>
                ))}
                {tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">
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