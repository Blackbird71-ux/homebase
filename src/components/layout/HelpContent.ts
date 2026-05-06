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
          'Use the Bot button (bottom-right, above help) to open the AI assistant — control the whole app with voice or text: meal plan, shopping list, to-do, calendar, chores, notes, recipes, contacts, documents, and birthdays.',
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
        title: 'Drag & Drop Reordering',
        items: [
          'Drag and drop entire meal slots to reorder them within a day.',
          'Drag individual recipe cards within a meal slot to reorder them.',
          'Use the drag handle on the left side of each card to pick it up.',
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
          'Use "Import from URL" to automatically scrape a recipe from any website.',
          'To bulk-import from Umami, go to Settings → Import and upload your Umami zip archives.',
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
      {
        title: 'Sharing Recipes',
        items: [
          'Click "Share" to email a recipe to any email address.',
          'The shared recipe includes all ingredients and instructions.',
          'Private information is removed from the shared version.',
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
      {
        title: 'Event Categories',
        items: [
          'Events are color-coded by category for easy visual scanning.',
          'Manage category names and colors in Settings → Event Categories.',
          'Default categories (Work, Personal, Family, Health, Holiday) can be renamed.',
          'Each category gets a unique color that applies across month and week views.',
        ],
      },
      {
        title: 'Recurring Events',
        items: [
          'Create recurring events with daily, weekly, monthly, or yearly schedules.',
          'When deleting or editing a recurring event, choose to affect just this occurrence or the entire series.',
          'Recurring instances expand automatically in calendar views.',
        ],
      },
      {
        title: 'Email Reminders',
        items: [
          'Enable "Email Reminder" on any event to notify the whole family before it starts.',
          'Choose how far in advance to send the reminder (1 hour to 1 week).',
          'Add extra email recipients beyond family members using the comma-separated field.',
          'Reminders are processed automatically every day at 8:00 AM.',
          'SMTP must be configured in Settings → Email for reminders to work.',
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
      {
        title: 'Email Reminders',
        items: [
          'Enable "Email Reminder" on a chore to notify the assignee before the due date.',
          'Choose how many days before the due date the reminder should be sent.',
          'The reminder is sent to the assigned family member\'s email address.',
          'Reminders are processed automatically every day at 8:00 AM.',
          'SMTP must be configured in Settings → Email for reminders to work.',
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
          'Contacts are shared across the family and grouped by category.',
        ],
      },
      {
        title: 'Adding Contacts',
        items: [
          'Click "Add Contact" to enter a new contact\'s details.',
          'Include phone, email, address, and notes.',
          'Choose from built-in categories (Family, Emergency, Doctor, School, Tradesperson) or create custom ones.',
        ],
      },
      {
        title: 'PIN Protection',
        items: [
          'Enable PIN protection on any contact to keep their details private.',
          'When PIN-protected, the contact card shows as locked — click "Unlock" to enter the PIN.',
          'Once unlocked, the contact remains accessible for 15 minutes.',
          'If you forget your PIN, use the "Forgot PIN?" option to reset it via email.',
        ],
      },
      {
        title: 'Category Grouping',
        items: [
          'Contacts are automatically grouped by category for easy browsing.',
          'Built-in categories include Family, Emergency, Doctor, School, and Tradesperson.',
          'You can also create custom categories for your specific needs.',
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
          'Use the scrollable category tabs at the top to filter by document type.',
        ],
      },
      {
        title: 'Uploading',
        items: [
          'Click "Upload" to select files from your computer.',
          'Supported formats: PDF, images, and common document types.',
        ],
      },
      {
        title: 'PIN Protection',
        items: [
          'Enable PIN protection on any document to keep its contents private.',
          'When PIN-protected, the document shows a "Secure" badge.',
          'A PIN must be entered to view the document\'s content.',
          'If you forget your PIN, use the "Forgot PIN?" option to reset it via email.',
        ],
      },
      {
        title: 'Expiry Tracking',
        items: [
          'Set an expiry date on documents like passports, insurance policies, or warranties.',
          'Documents show a warning badge when approaching expiry.',
          'Expired documents are clearly marked with an "Expired" badge.',
          'Set how many days before expiry you want to be reminded.',
        ],
      },
      {
        title: 'Category Tabs',
        items: [
          'Use the scrollable category tabs to filter documents by type.',
          'Categories include Insurance, Warranty, Passport, Medical, Financial, Legal, and more.',
          'The active category is highlighted for easy navigation.',
        ],
      },
      {
        title: 'Email Reminders',
        items: [
          'Enable "Email Reminder" when uploading a document with an expiry date.',
          'All family members will be notified the specified number of days before expiry.',
          'Reminders are processed automatically every day at 8:00 AM.',
          'SMTP must be configured in Settings → Email for reminders to work.',
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
          'Notes are organized into three tabs: Family, Private, and Secure.',
        ],
      },
      {
        title: 'Tabbed Interface',
        items: [
          'Family tab — notes visible to all family members.',
          'Private tab — notes visible only to you (the creator).',
          'Secure tab — notes protected by a PIN that must be entered to view.',
          'Switch between tabs to filter your notes view.',
        ],
      },
      {
        title: 'Creating Notes',
        items: [
          'Click "New Note" to create a note with a title and content.',
          'Notes are automatically saved as you type.',
          'Use the privacy toggle to mark a note as private or family-shared.',
        ],
      },
      {
        title: 'PIN Protection',
        items: [
          'Enable PIN protection on any note to keep it secure.',
          'Set a 4-6 digit PIN when enabling protection.',
          'Secure notes appear in the Secure tab and require a PIN to view.',
          'If you forget your PIN, use the "Forgot PIN?" option to reset it via email.',
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
          'Settings are organized into tabs along the top. Some tabs are only visible to the family admin.',
          'Changes take effect immediately unless a "Save" button is shown.',
        ],
      },
      {
        title: 'Account',
        items: [
          'Change your display name and password.',
          'Admins can update the family name, timezone, and week start day.',
          'Admins can generate or regenerate the family invite code used to add new members.',
          'The family members list shows everyone with access and their role.',
        ],
      },
      {
        title: 'Appearance',
        items: [
          'Choose from 10+ themes including Apple Pro (high-contrast professional), dark, light, and glassmorphism styles.',
          'Adjust font size, font weight, and line height for comfortable reading.',
          'Set the color that completed (done) items appear in shopping and to-do lists.',
          'Choose how PIN-protected cards appear: "Blur" (blurred content) or "Redact" (fully hidden).',
          'Advanced theme tab lets you customize individual UI colors — sidebar, cards, calendar, and text.',
        ],
      },
      {
        title: 'Integrations',
        items: [
          'Connect Google Calendar for two-way event sync — import and export events.',
          'Click "Connect Google Calendar" and follow the OAuth flow; then use "Sync Now" to push/pull changes.',
          'Admins can configure a Cloudflare Tunnel URL for secure remote access from outside the home network.',
          'Admins can enter a Umami analytics site ID and URL for website traffic tracking.',
        ],
      },
      {
        title: 'Data',
        items: [
          'Download a full database backup (SQLite file) for safekeeping.',
          'Restore from a backup file — this replaces all current data.',
          'Export all family data as a JSON file for portability.',
          'View a history of Cozi calendar imports (dates and event counts).',
        ],
      },
      {
        title: 'Import',
        items: [
          'Bulk-import recipes from Umami zip archives — select one or more zip files and upload.',
          'Each archive is processed and its recipes are added to your recipe library.',
          'Duplicate detection prevents the same recipe being imported twice.',
        ],
      },
      {
        title: 'Tags',
        items: [
          'Create, rename, and delete tags used on recipes.',
          'Assign a color to each tag — colors appear as badges on recipe cards and in the recipe detail view.',
          'Tags can be used in the recipe list to filter and find recipes quickly.',
        ],
      },
      {
        title: 'Categories',
        items: [
          'Manage ingredient categories used to group shopping list items (e.g., Produce, Dairy, Meat).',
          'Assign a color and aisle number to each category.',
          'Aisle numbers power the "By Aisle" view in shopping lists.',
          'The app learns ingredient-to-category mappings automatically over time.',
        ],
      },
      {
        title: 'Event Categories',
        items: [
          'Manage the names and colors of calendar event categories.',
          'Default categories (Work, Personal, Family, Health, Holiday) can be renamed.',
          'Assign a distinct color to each category — it appears on all calendar views.',
          'Add custom categories for any event type your family uses regularly.',
        ],
      },
      {
        title: 'Ingredient Mappings',
        items: [
          'Create manual ingredient → category overrides that take priority over the auto-learning system.',
          'Useful for items the app consistently miscategorizes.',
          'Add a mapping by typing the ingredient name and selecting the target category.',
        ],
      },
      {
        title: 'Notifications',
        items: [
          'Enable browser push notifications to receive alerts even when the app is not open.',
          'Click "Enable Notifications" and grant permission when prompted.',
          'Each device/browser must subscribe separately.',
          'Notifications are delivered for chore reminders and other family alerts.',
        ],
      },
      {
        title: 'Activity Log',
        items: [
          'View a chronological audit trail of all changes made in your family account.',
          'Entries show who changed what, when, and in some cases support one-click undo.',
          'Click "Backup & Truncate" to download old entries as a JSON file, then remove entries older than 3 months.',
          'A confirmation dialog prevents accidental deletion.',
        ],
      },
      {
        title: 'AI Assistant',
        items: [
          'Enter your Gemini API key to enable the AI assistant. Get a free key at aistudio.google.com → Get API key.',
          'Choose a model: Gemini 2.0 Flash (recommended — fast and cheap), 1.5 Pro, or 2.5 Pro.',
          'Use "Test Connection" to verify your key works before using the assistant.',
          'Once configured, the Bot button (bottom-right corner of every page) opens the assistant.',
          'Meal plan: "Add pasta bake to Monday lunch", "Clear Tuesday dinner", "What\'s planned this week?", "Add this week\'s meal ingredients to the shopping list"',
          'Shopping & to-do: "Add milk and eggs", "What\'s on the shopping list?", "Mark milk as bought", "Add \'call the plumber\' to my to-do list"',
          'Calendar: "Add dentist on Thursday at 2pm", "What\'s on this week?"',
          'Chores: "I just did the vacuuming", "What chores are overdue?"',
          'Notes: "Create a note called Weekly Goals", "Do I have any notes about the car?"',
          'Recipes: "Do we have a recipe for chicken curry?", "What do I need for pasta bake?"',
          'Contacts: "What\'s the dentist\'s number?", "Find the plumber\'s details"',
          'Documents: "Any documents expiring soon?", "When does our insurance expire?"',
          'Birthdays: "Any birthdays coming up this month?", "When is Sarah\'s birthday?"',
        ],
      },
      {
        title: 'Email (Admin only)',
        items: [
          'Configure SMTP settings to enable email reminders and PIN-reset emails.',
          'Supports any SMTP provider — for Gmail use an App Password (not your regular password).',
          'Use "Test Email" to send a verification message to the admin\'s address.',
          'Reminders for chores, events, and expiring documents are processed automatically at 8:00 AM daily.',
          'Use "Send Reminders Now" to trigger processing immediately without waiting for the scheduled run.',
          'Set REMINDER_CRON_SCHEDULE in your environment to change the schedule; set CRON_SECRET to secure the endpoint.',
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

  // /chores/[id] -> /chores
  if (pathname.startsWith('/chores/') && pathname !== '/chores') {
    return HELP_CONTENT['/chores'] ?? null
  }

  // /documents/[id] -> /documents
  if (pathname.startsWith('/documents/') && pathname !== '/documents') {
    return HELP_CONTENT['/documents'] ?? null
  }

  // /settings/* -> /settings
  if (pathname.startsWith('/settings/')) {
    return HELP_CONTENT['/settings'] ?? null
  }

  return null
}