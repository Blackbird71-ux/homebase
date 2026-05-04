export interface HelpSection {
  title: string
  items: string[]
}

export interface HelpPage {
  title: string
  sections: HelpSection[]
}

export const HELP_CONTENT: Record<string, HelpPage> = {
  '/home': {
    title: 'Dashboard',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Dashboard is your home base — it shows an overview of what\'s happening today and this week.',
          'Cards display today\'s meals, upcoming events, shopping list status, and a weekly summary.',
        ],
      },
      {
        title: 'Customizing Your Dashboard',
        items: [
          'Click the "Customize" button to show/hide specific cards.',
          'Choose which shopping list appears on the dashboard.',
          'Drag cards to reorder them (if supported).',
        ],
      },
      {
        title: 'Weekly Summary',
        items: [
          'The weekly summary card shows a snapshot of events, meals, and todos for the current week.',
          'Click on any item to navigate to the full view.',
        ],
      },
      {
        title: 'Quick Actions',
        items: [
          'Use the floating action button (bottom-right) to quickly add items from any page.',
          'Click on a meal to view the recipe details.',
        ],
      },
    ],
  },
  '/meal-plan': {
    title: 'Meal Plan',
    sections: [
      {
        title: 'Overview',
        items: [
          'Plan your family\'s meals for the week. Assign recipes to breakfast, lunch, dinner, or snacks for each day.',
          'Navigate between weeks using the arrow buttons or "Today" button.',
        ],
      },
      {
        title: 'Adding Recipes',
        items: [
          'Click the "+" button on any meal slot to search and add a recipe.',
          'You can add multiple recipes to a single meal slot.',
          'Add a note instead of a recipe if you\'re having leftovers or eating out.',
        ],
      },
      {
        title: 'Exporting to Groceries',
        items: [
          'Click "Export to Groceries" to send all planned recipe ingredients to your shopping list.',
          'The preview dialog shows which items are new vs already in your list.',
          'You can toggle individual recipes on/off before exporting.',
          'Choose "Replace" to clear the list first, or "Append" to add to existing items.',
        ],
      },
      {
        title: 'Meal Plan Templates',
        items: [
          'Save a week\'s meal plan as a template for future reuse.',
          'Apply a template to quickly populate a new week.',
        ],
      },
    ],
  },
  '/recipes': {
    title: 'Recipes',
    sections: [
      {
        title: 'Overview',
        items: [
          'Browse all your family\'s recipes. Search by name, filter by tags, or browse by recipe book.',
          'Click any recipe to view full details, including ingredients and step-by-step instructions.',
        ],
      },
      {
        title: 'Adding Recipes',
        items: [
          'Click "New Recipe" to manually enter a recipe with ingredients and instructions.',
          'Use "Import from URL" to automatically scrape a recipe from a website.',
          'Use "Import from Cozi" to migrate your existing recipes.',
        ],
      },
      {
        title: 'Recipe Books',
        items: [
          'Organize recipes into books (collections) for easy browsing.',
          'Set a favorite book to have it open by default.',
        ],
      },
      {
        title: 'Tags',
        items: [
          'Add tags to recipes for filtering (e.g., "vegetarian", "quick", "dessert").',
          'Manage tags in Settings → Tags.',
        ],
      },
    ],
  },
  '/recipes/\\[id\\]': {
    title: 'Recipe Detail',
    sections: [
      {
        title: 'Overview',
        items: [
          'View the full recipe with ingredients, step-by-step instructions, and nutritional information.',
          'Use the toolbar buttons to print, duplicate, edit, or delete the recipe.',
        ],
      },
      {
        title: 'Scaling Ingredients',
        items: [
          'Use the scale buttons (½, 1, 1½, 2, 3×) next to "Ingredients" to adjust serving sizes.',
          'Quantities are automatically recalculated.',
        ],
      },
      {
        title: 'Cooking Mode',
        items: [
          'Click "Start Cooking" to enter full-screen cooking mode with wake lock (screen stays on).',
          'Tap the circle next to each ingredient to mark it as prepared.',
          'Tap step numbers to mark steps as completed.',
          'Progress is tracked at the bottom — reset or mark all complete as needed.',
        ],
      },
      {
        title: 'Timers',
        items: [
          'Timers are automatically created from time mentions in instructions (e.g., "Bake for 20 minutes").',
          'Click "Step Timers" to re-scan for any missed timers.',
          'Use "Add Timer" to create manual timers for any step.',
          'Each timer shows a progress bar and plays an alarm when done.',
          'Start, pause, restart, or delete timers as needed.',
        ],
      },
      {
        title: 'Adding to Lists',
        items: [
          'Click "Add to List" to add recipe ingredients to any shopping or todo list.',
        ],
      },
    ],
  },
  '/lists': {
    title: 'Lists',
    sections: [
      {
        title: 'Overview',
        items: [
          'Create and manage shopping lists and to-do lists for your family.',
          'Each list shows items grouped by category with completion checkboxes.',
        ],
      },
      {
        title: 'Adding Items',
        items: [
          'Type an item name in the input field at the top and press Enter to add it.',
          'Use the barcode scanner button (📷) next to the input to scan a product barcode and auto-fill the name.',
          'Items are automatically categorized based on learned categories.',
        ],
      },
      {
        title: 'Categories',
        items: [
          'Items are grouped by category (e.g., Produce, Dairy, Meat) for easier shopping.',
          'Change an item\'s category by clicking the category badge.',
          'The app learns your categorizations over time.',
          'Manage categories and set aisle numbers in Settings → Categories.',
        ],
      },
      {
        title: 'Recipe Name Pills',
        items: [
          'When items come from meal plan recipes, they show a recipe name pill.',
          'Click "Show Recipes" toggle to see which recipe each item belongs to.',
          'This helps when shopping for multiple recipes at once.',
        ],
      },
      {
        title: 'Aisle View',
        items: [
          'Toggle "By Aisle" to sort items by store aisle order.',
          'Set aisle numbers for categories in Settings → Categories.',
          'Makes shopping more efficient by grouping items by store layout.',
        ],
      },
      {
        title: 'Templates',
        items: [
          'Save any list as a template for future reuse.',
          'Create a new list from a template to quickly populate it.',
          'Great for weekly shopping lists or recurring to-do lists.',
        ],
      },
      {
        title: 'Real-time Presence',
        items: [
          'See who else in your family is viewing or editing the same list.',
          'Avatars appear in the list header showing active viewers.',
        ],
      },
    ],
  },
  '/calendar': {
    title: 'Calendar',
    sections: [
      {
        title: 'Overview',
        items: [
          'View and manage family events, appointments, and activities.',
          'Events are color-coded by category for easy identification.',
        ],
      },
      {
        title: 'Adding Events',
        items: [
          'Click on a date or the "+" button to create a new event.',
          'Set the title, date/time, category, and color.',
          'Mark events as all-day for birthdays or holidays.',
        ],
      },
      {
        title: 'Google Calendar Sync',
        items: [
          'Connect your Google Calendar to sync events both ways.',
          'Go to Settings → Integrations to connect.',
          'Sync is manual — click "Sync Now" to push/pull changes.',
        ],
      },
    ],
  },
  '/chores': {
    title: 'Chores',
    sections: [
      {
        title: 'Overview',
        items: [
          'Assign and track household chores for family members.',
          'Chores can be one-time or recurring with rotation schedules.',
        ],
      },
      {
        title: 'Creating Chores',
        items: [
          'Click "New Chore" to create a chore with a title, description, and assignment.',
          'Set a due date and optional rotation schedule.',
          'Chores can be assigned to specific family members.',
        ],
      },
      {
        title: 'Completing Chores',
        items: [
          'Mark chores as complete by checking the checkbox.',
          'Completed chores show a history of who completed them and when.',
          'Rotating chores automatically reassign to the next person.',
        ],
      },
    ],
  },
  '/contacts': {
    title: 'Contacts',
    sections: [
      {
        title: 'Overview',
        items: [
          'Store and manage family contacts — phone numbers, emails, and addresses.',
          'Contacts are shared across the family.',
        ],
      },
      {
        title: 'Adding Contacts',
        items: [
          'Click "Add Contact" to enter a new contact\'s details.',
          'Include phone, email, address, and notes.',
        ],
      },
    ],
  },
  '/documents': {
    title: 'Documents',
    sections: [
      {
        title: 'Overview',
        items: [
          'Upload and organize important family documents.',
          'Documents are stored securely and accessible to all family members.',
        ],
      },
      {
        title: 'Uploading',
        items: [
          'Click "Upload" to select files from your computer.',
          'Supported formats: PDF, images, and common document types.',
        ],
      },
    ],
  },
  '/notes': {
    title: 'Notes',
    sections: [
      {
        title: 'Overview',
        items: [
          'Create and organize notes for your family.',
          'Notes support rich text and can be organized with tags.',
        ],
      },
      {
        title: 'Creating Notes',
        items: [
          'Click "New Note" to create a note with a title and content.',
          'Notes are automatically saved as you type.',
        ],
      },
    ],
  },
  '/settings': {
    title: 'Settings',
    sections: [
      {
        title: 'Overview',
        items: [
          'Configure your HomeBase experience — general settings, categories, tags, and integrations.',
          'Settings are per-user unless otherwise noted.',
        ],
      },
      {
        title: 'General Settings',
        items: [
          'Set your timezone and preferred week start day.',
          'Configure dashboard preferences.',
        ],
      },
      {
        title: 'Categories',
        items: [
          'Manage shopping list categories (e.g., Produce, Dairy, Meat).',
          'Add custom categories for your specific shopping needs.',
          'Set aisle numbers for each category to enable aisle view in shopping lists.',
          'The app learns ingredient-to-category mappings over time.',
        ],
      },
      {
        title: 'Tags',
        items: [
          'Create and manage tags used across the app.',
          'Tags help organize recipes and other content.',
        ],
      },
      {
        title: 'Integrations',
        items: [
          'Connect Google Calendar for two-way event sync.',
          'Configure Cloudflare Tunnel for remote access.',
        ],
      },
    ],
  },
}

/**
 * Get the help content for a given pathname.
 * Matches against known patterns, falling back to the most specific match.
 */
export function getHelpForPath(pathname: string): HelpPage | null {
  // Exact match first
  if (HELP_CONTENT[pathname]) {
    return HELP_CONTENT[pathname]
  }

  // Pattern matching for dynamic routes
  // /recipes/[id] -> /recipes/\[id\]
  if (pathname.startsWith('/recipes/') && pathname !== '/recipes') {
    return HELP_CONTENT['/recipes/\\[id\\]'] ?? null
  }

  // /notes/[id] -> /notes
  if (pathname.startsWith('/notes/') && pathname !== '/notes') {
    return HELP_CONTENT['/notes'] ?? null
  }

  // /settings/* -> /settings
  if (pathname.startsWith('/settings/')) {
    return HELP_CONTENT['/settings'] ?? null
  }

  return null
}
