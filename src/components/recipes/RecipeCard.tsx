import Link from 'next/link'
import { ClockIcon, UsersIcon, Trash2Icon, Heart, Plane } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface RecipeCardProps {
  id: string
  title: string
  description: string | null
  tags: string[]
  tagColors?: Record<string, string>
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  isFavourite?: boolean
  image: string | null
  calories?: string | null
  onDelete?: (id: string) => void
  onToggleFavourite?: (id: string) => void
  onToggleFamily?: (id: string) => void
  onToggleTrip?: (id: string) => void
}

export function RecipeCard({
  id,
  title,
  description,
  tags,
  tagColors,
  prepTime,
  cookTime,
  servings,
  isFavourite = false,
  image,
  calories,
  onDelete,
  onToggleFavourite,
  onToggleFamily,
  onToggleTrip,
}: RecipeCardProps) {
  const totalTime = (prepTime ?? 0) + (cookTime ?? 0)
  const hasFamily = tags.some(t => t.toLowerCase() === 'family')
  const hasTrip   = tags.some(t => t.toLowerCase() === 'trip')

  function formatTime(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h} hr ${m} min` : `${h} hr`
  }

  return (
    <div className="relative group h-full">
      <Link href={`/recipes/${id}`} className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer overflow-hidden">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={title}
            className="w-full h-32 object-cover"
          />
        )}
        <CardHeader className="pb-2">
          <CardTitle className="text-base line-clamp-2">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                {formatTime(totalTime)}
              </span>
            )}
            {servings != null && (
              <span className="flex items-center gap-1">
                <UsersIcon className="h-3 w-3" />
                {servings}
              </span>
            )}
            {calories && (
              <span className="text-xs text-muted-foreground/60">🔥 {calories}</span>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 4).map((tag) => {
                const color = tagColors?.[tag]
                return (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded-full text-xs font-medium border"
                    style={color ? {
                      borderColor: color,
                      backgroundColor: `${color}20`,
                      color,
                    } : {
                      borderColor: 'hsl(var(--border))',
                    }}
                  >
                    {tag}
                  </span>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
    {onToggleFavourite && (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavourite(id) }}
        className={cn(
          'absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
          isFavourite
            ? 'bg-white/90 text-rose-500'
            : 'bg-black/20 text-white/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/90 hover:text-rose-500',
        )}
        title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
      >
        <Heart className={cn('h-3.5 w-3.5', isFavourite && 'fill-current')} />
      </button>
    )}
    {onToggleFamily && (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFamily(id) }}
        className={cn(
          'absolute top-10 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
          hasFamily
            ? 'bg-orange-500 text-white'
            : 'bg-black/20 text-white/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/90 hover:text-orange-500',
        )}
        title={hasFamily ? 'Remove family tag' : 'Mark as family-tested'}
      >
        <UsersIcon className="h-3.5 w-3.5" />
      </button>
    )}
    {onToggleTrip && (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleTrip(id) }}
        className={cn(
          'absolute top-[4.5rem] left-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
          hasTrip
            ? 'bg-sky-500 text-white'
            : 'bg-black/20 text-white/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/90 hover:text-sky-500',
        )}
        title={hasTrip ? 'Remove trip tag' : 'Mark as from the trip'}
      >
        <Plane className="h-3.5 w-3.5" />
      </button>
    )}
    {onDelete && (
      <button
        onClick={(e) => { e.preventDefault(); onDelete(id) }}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 text-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="Delete recipe"
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </button>
    )}
    </div>
  )
}
