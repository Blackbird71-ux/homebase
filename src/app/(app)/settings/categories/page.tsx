'use client'

import { useState, useEffect } from 'react'
import { CategoryManager } from '@/components/categories/CategoryManager'
import { CategoryAssignment } from '@/components/categories/CategoryAssignment'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InfoIcon } from 'lucide-react'

interface Ingredient {
  id: string
  name: string
  categoryId: string | null
  categoryName: string | null
}

export default function CategoriesSettingsPage() {
  const [activeTab, setActiveTab] = useState('manage')
  const [sampleIngredients, setSampleIngredients] = useState<Ingredient[]>([
    { id: '1', name: 'milk', categoryId: null, categoryName: null },
    { id: '2', name: 'chicken breast', categoryId: null, categoryName: null },
    { id: '3', name: 'bread', categoryId: null, categoryName: null },
    { id: '4', name: 'tomatoes', categoryId: null, categoryName: null },
    { id: '5', name: 'olive oil', categoryId: null, categoryName: null },
    { id: '6', name: 'cheese', categoryId: null, categoryName: null },
    { id: '7', name: 'eggs', categoryId: null, categoryName: null },
    { id: '8', name: 'pasta', categoryId: null, categoryName: null },
  ])

  const [showAssignment, setShowAssignment] = useState(false)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold">Ingredient Category Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage categories and assign ingredients for better organization in shopping lists.
        </p>
      </div>

      <div className="flex-1 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="manage">Manage Categories</TabsTrigger>
            <TabsTrigger value="assign">Assign Ingredients</TabsTrigger>
            <TabsTrigger value="info">How It Works</TabsTrigger>
          </TabsList>

          <TabsContent value="manage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Category Management</CardTitle>
                <CardDescription>
                  Create, edit, and delete ingredient categories. Categories help organize shopping lists by aisle.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assign" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ingredient Assignment</CardTitle>
                <CardDescription>
                  Assign categories to ingredients. This helps the system automatically categorize items in your shopping lists.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="bg-muted/30 p-4 rounded-lg border">
                    <div className="flex items-start gap-3">
                      <InfoIcon className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Automatic Categorization</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          When you add items to your shopping list, the system automatically suggests categories based on ingredient names.
                          For example, "milk" is automatically assigned to "Dairy", and "chicken" to "Meat".
                        </p>
                      </div>
                    </div>
                  </div>

                  {showAssignment ? (
                    <CategoryAssignment
                      ingredients={sampleIngredients}
                      onAssignmentComplete={() => setShowAssignment(false)}
                    />
                  ) : (
                    <div className="text-center p-8 border-2 border-dashed rounded-lg">
                      <h3 className="text-lg font-medium mb-2">Ready to Assign Categories</h3>
                      <p className="text-muted-foreground mb-6">
                        The category assignment feature is now fully functional. Click below to try it with sample ingredients.
                      </p>
                      <Button onClick={() => setShowAssignment(true)}>
                        Try Category Assignment
                      </Button>
                      <p className="text-sm text-muted-foreground mt-4">
                        In a real implementation, this would load uncategorized ingredients from your shopping lists and recipes.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>How Ingredient Categories Work</CardTitle>
                <CardDescription>
                  Learn how categories improve your shopping list experience.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <h3 className="font-medium">Automatic Detection</h3>
                  <p className="text-sm text-muted-foreground">
                    When you type an ingredient like "2 cups milk" or "chicken breast", the system automatically detects the category (Dairy, Meat, etc.) based on keywords.
                  </p>

                  <h3 className="font-medium">Shopping List Organization</h3>
                  <p className="text-sm text-muted-foreground">
                    Your shopping list is grouped by categories, making it easier to shop by aisle. You can reorder categories to match your store layout.
                  </p>

                  <h3 className="font-medium">Custom Categories</h3>
                  <p className="text-sm text-muted-foreground">
                    Create custom categories for your specific needs. For example, "Gluten-Free", "Organic", or "Baby Food".
                  </p>

                  <h3 className="font-medium">Recipe Integration</h3>
                  <p className="text-sm text-muted-foreground">
                    When you export ingredients from recipes to your shopping list, categories are preserved, keeping your list organized.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}