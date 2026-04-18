'use client'

import { useState } from 'react'
import { ImportModal } from '@/components/recipes/ImportModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UploadIcon } from 'lucide-react'

export function ImportTab() {
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Recipes</CardTitle>
          <CardDescription>
            Import recipe books from Umami. Export each book as a zip from Umami, then upload all zip files here. The zip filename becomes the book name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setImportOpen(true)}>
            <UploadIcon className="h-4 w-4 mr-2" />
            Import from Umami
          </Button>
        </CardContent>
      </Card>

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => setImportOpen(false)}
      />
    </div>
  )
}
