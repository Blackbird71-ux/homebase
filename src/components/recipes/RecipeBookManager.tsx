'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { PlusIcon, EditIcon, TrashIcon, Loader2, EyeIcon, EyeOffIcon } from 'lucide-react'

interface RecipeBook {
  id: string
  name: string
  hidden: boolean
  recipeCount: number
}

export function RecipeBookManager() {
  const [books, setBooks] = useState<RecipeBook[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<RecipeBook | null>(null)
  const [newBookName, setNewBookName] = useState('')
  const [editBookName, setEditBookName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchBooks()
  }, [])

  async function fetchBooks() {
    try {
      setLoading(true)
      const res = await fetch('/api/recipe-books')
      if (!res.ok) throw new Error('Failed to fetch recipe books')
      setBooks(await res.json())
    } catch (error) {
      toast.error('Failed to load recipe books')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newBookName.trim()) {
      toast.error('Book name is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/recipe-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBookName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create book')
      }
      const book = await res.json() as { id: string; name: string }
      setBooks((prev) => [...prev, { ...book, hidden: false, recipeCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)))
      setNewBookName('')
      setCreateOpen(false)
      toast.success('Recipe book created')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create book')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRename() {
    if (!selectedBook || !editBookName.trim()) {
      toast.error('Book name is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/recipe-books/${selectedBook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editBookName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to rename book')
      }
      const updated = await res.json() as { id: string; name: string }
      setBooks((prev) =>
        prev.map((b) => b.id === updated.id ? { ...b, name: updated.name } : b)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditOpen(false)
      setSelectedBook(null)
      toast.success('Recipe book renamed')
    } catch (error: any) {
      toast.error(error.message || 'Failed to rename book')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleHidden(book: RecipeBook) {
    const hidden = !book.hidden
    setBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, hidden } : b))
    try {
      const res = await fetch(`/api/recipe-books/${book.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
      })
      if (!res.ok) throw new Error()
      toast.success(hidden ? `"${book.name}" hidden` : `"${book.name}" visible`)
    } catch {
      setBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, hidden: book.hidden } : b))
      toast.error('Failed to update book')
    }
  }

  async function handleDelete() {
    if (!selectedBook) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/recipe-books/${selectedBook.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete book')
      }
      setBooks((prev) => prev.filter((b) => b.id !== selectedBook.id))
      setDeleteOpen(false)
      setSelectedBook(null)
      toast.success('Recipe book deleted')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete book')
    } finally {
      setSubmitting(false)
    }
  }

  function handleEditClick(book: RecipeBook) {
    setSelectedBook(book)
    setEditBookName(book.name)
    setEditOpen(true)
  }

  function handleDeleteClick(book: RecipeBook) {
    setSelectedBook(book)
    setDeleteOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Recipe Books</h2>
          <p className="text-muted-foreground">Rename, hide, or delete the books that organise your recipes</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              New Book
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Book</DialogTitle>
              <DialogDescription>
                Books group recipes in the sidebar of the Recipes page.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="book-name">Book Name</Label>
              <Input
                id="book-name"
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                placeholder="e.g., Weeknight Dinners, Baking"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={submitting || !newBookName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Book
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Books</CardTitle>
          <CardDescription>
            Hidden books disappear from the Recipes page sidebar; their recipes remain in All Recipes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recipe books yet. Create your first book!
            </div>
          ) : (
            <div className="space-y-2">
              {books.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center gap-4 px-4 py-3 border rounded-lg hover:bg-muted/50 bg-background"
                >
                  <div className={`flex-1 font-medium truncate ${book.hidden ? 'text-muted-foreground' : ''}`}>
                    {book.name}
                    {book.hidden && (
                      <span className="ml-2 text-xs text-muted-foreground">(Hidden)</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground shrink-0">
                    {book.recipeCount} recipe{book.recipeCount !== 1 ? 's' : ''}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleHidden(book)}
                      title={book.hidden ? 'Show book' : 'Hide book'}
                    >
                      {book.hidden ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditClick(book)}
                      title="Rename book"
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(book)}
                      title="Delete book"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rename Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Book</DialogTitle>
            <DialogDescription>
              Recipes stay in the book; only the name changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-book-name">Book Name</Label>
            <Input
              id="edit-book-name"
              value={editBookName}
              onChange={(e) => setEditBookName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={submitting || !editBookName.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rename Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedBook?.name}"?
              {selectedBook && selectedBook.recipeCount > 0 && (
                <span className="block mt-1">
                  Its {selectedBook.recipeCount} recipe{selectedBook.recipeCount !== 1 ? 's' : ''} will not be deleted — they will just no longer belong to a book.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
