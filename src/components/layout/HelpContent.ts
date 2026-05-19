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
          'Mark chores as complete by checking the checkbox — the checkbox flashes green to confirm.',
          'A notification shows the next scheduled date; tap Edit in the notification to adjust it.',
          'If the chore reaches its end date it deactivates automatically.',
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
  '/finance': {
    title: 'Finance',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Finance dashboard gives you a real-time snapshot of your household money — total balance across all accounts, this month\'s income and expenses, active budgets, upcoming bills, and savings goals.',
          'Summary cards show Monthly Income, Monthly Expenses, Total Balance, Active Budgets, and Upcoming Bills at a glance.',
          'Use the sub-navigation at the top to move between Transactions, Bills, Budget, Reports, and the setup pages (Accounts, Categories, Goals, Locations, Members, Vendors, Entities).',
        ],
      },
      {
        title: 'Monthly Summary Cards',
        items: [
          'Monthly Income — sum of all income transactions entered for the current calendar month.',
          'Monthly Expenses — sum of all expense transactions for the current month.',
          'Total Balance — combined current balance across all active accounts.',
          'Active Budgets — number of budget rules whose date range covers today.',
          'Upcoming Bills — count of recurring bills due in the coming period.',
        ],
      },
      {
        title: 'Spending Breakdown',
        items: [
          'The dashboard shows expense totals split by category type: Personal (private to one member), Location-based, and External.',
          'This helps you see quickly where household money is being spent across different spending contexts.',
        ],
      },
      {
        title: 'Budget Progress',
        items: [
          'Active budget rules appear as progress bars showing how much has been spent versus the budgeted amount.',
          'Each bar changes colour: green while under budget, amber when nearing the alert threshold, red when over.',
          'A surplus or shortfall callout shows the total remaining or overspent across all budgets.',
        ],
      },
      {
        title: 'Recent Transactions',
        items: [
          'The five most recent transactions for the current month are shown on the dashboard.',
          'Click "View All" or go to Finance → Transactions to see the full transaction list.',
        ],
      },
      {
        title: 'Members & Locations Summary',
        items: [
          'When family members or locations are set up, summary chips appear at the bottom of the dashboard.',
          'Click a member chip to see their assigned spending; click a location chip to see property-specific costs.',
        ],
      },
      {
        title: 'Getting Started',
        items: [
          'Start by adding your accounts under Finance → Accounts (e.g., everyday bank, credit card, savings).',
          'Then set up categories under Finance → Categories to organise your spending and income.',
          'Add recurring bills under Finance → Bills so overdue payments are flagged automatically.',
          'Create budget rules under Finance → Budget to track spending against limits.',
          'Set savings goals under Finance → Goals to monitor progress toward targets.',
          'Set up Vendors and Entities under Finance → Vendors and Finance → Entities to organise bills and transactions by payee and legal structure.',
        ],
      },
    ],
  },
  '/finance/accounts': {
    title: 'Finance — Accounts',
    sections: [
      {
        title: 'Overview',
        items: [
          'Accounts represent your real-world financial accounts — bank accounts, credit cards, savings accounts, loans, and investments.',
          'Each account card shows the current balance, institution, account type, and a colour-coded indicator.',
          'All accounts contribute to the Total Balance shown on the Finance dashboard.',
        ],
      },
      {
        title: 'Adding an Account',
        items: [
          'Click "Add Account" to open the form. Name and Type are required.',
          'Account types: Checking, Savings, Credit, Cash, Investment, Loan, Entity Account, External Account, Other.',
          'Set the Current Balance to your actual balance at the time of setup — transactions you add later will not automatically adjust this field.',
          'For credit accounts, enter the Credit Limit to track how much of your limit is in use.',
          'Choose a colour to visually distinguish accounts across the app.',
        ],
      },
      {
        title: 'Editing & Deleting',
        items: [
          'Click the pencil icon on an account card to edit its name, balance, type, or colour.',
          'Deleting an account unlinks its transactions but does not delete them — transactions remain in the history without an account.',
          'Inactive accounts are hidden from account selectors but remain in reports.',
        ],
      },
      {
        title: 'Entity & External Accounts',
        items: [
          '"Entity Account" is for accounts belonging to a business or external organisation that you want to track separately.',
          '"External Account" is for accounts you don\'t directly control but still want to reference (e.g., a partner\'s account for transfer tracking).',
        ],
      },
    ],
  },
  '/finance/bills': {
    title: 'Finance — Bills & Recurring',
    sections: [
      {
        title: 'Overview',
        items: [
          'Bills tracks recurring or one-off payments — rent, utilities, subscriptions, insurance, and anything else that comes around on a schedule.',
          'Bills follow a two-step process that mirrors how accounting works: first you acknowledge the invoice exists, then you record that you\'ve paid it.',
          'Bills are split into two groups: Overdue (past their next due date, shown in red) and Upcoming.',
          'The Finance dashboard\'s "Bills to Pay" card is sourced from this list.',
        ],
      },
      {
        title: 'Step 1 — Create the bill',
        items: [
          'Open **Bills & Recurring** and click **Add Bill**. Fill in the required fields:',
          '**Recurring / One-off** — Choose One-off for a single payment (e.g. a tax bill); Recurring for regular bills (e.g. electricity).',
          '**Name** — A clear label — e.g. "ATO — Mark".',
          '**Amount** — The invoice amount.',
          '**Category** — Select the expense category this belongs to (e.g. Taxes — Mark). This is what drives your P&L report.',
          '**Account** — The bank account the payment will come from. Required for the balance sheet to show cash leaving the right account.',
          '**Due Date** — When the bill is due.',
          '**Entity / Fund** — Select the correct entity (e.g. Personal / Family). Required for per-entity reporting.',
          '**Financial Contact** — Optional but useful for filtering.',
          '**Tax Classification** — Set to Tax Payment (PAYG) for ATO bills, Tax Deduction for deductible expenses, or leave as Not Classified.',
          'Click **Create**.',
        ],
      },
      {
        title: 'Step 2 — Mark the invoice received',
        items: [
          'When the invoice or statement arrives in your inbox, tick **Invoice received** on the bill row (the receipt icon), or tick it inside the editor before saving.',
          '**What this does:** The expense immediately appears on your P&L and the amount shows under **Accounts Payable** on the Balance Sheet. You now have a record of what you owe, even though you haven\'t paid yet.',
          'If you\'re creating the bill and the invoice is already in hand, tick **Invoice received** and set the **Invoice date** before clicking Create — it\'s in the same editor screen shown above.',
        ],
      },
      {
        title: 'Step 3 — Mark as paid',
        items: [
          'When you make the payment, click the **green tick** on the bill row and confirm the payment date.',
          '**What this does:** The expense clears from Accounts Payable, the bank account balance decreases, and the transaction is marked as reconciled on the payment date.',
        ],
      },
      {
        title: 'Skipping straight to paid',
        items: [
          'If you don\'t need to track the invoice separately (e.g. for a direct debit you know has gone out), you can click the green tick without ticking Invoice received first.',
          'The expense and payment are recorded in one step.',
        ],
      },
      {
        title: 'What updates automatically',
        items: [
          '**Bill created (draft)** — P&L: No change | Accounts Payable: No change | Bank Balance: No change.',
          '**Invoice received ticked** — P&L: Expense appears | Accounts Payable: Amount added | Bank Balance: No change.',
          '**Bill marked paid** — P&L: No change | Accounts Payable: Amount removed | Bank Balance: Decreases.',
          'The **Balance Sheet** is a live view — check it any time to see your current Accounts Payable (what you owe) and Accounts Receivable (what you\'re owed).',
        ],
      },
      {
        title: 'Tips',
        items: [
          '**Always select Account** when creating a bill. Without it the bank account balance on the Balance Sheet won\'t move when you mark things paid.',
          '**Always select Category**. Without a category, the transaction is unclassified and won\'t appear in P&L category breakdowns or tax reports.',
          '**Always select Entity / Fund**. This is required for the per-entity filters on P&L, Tax Report, and Balance Sheet to work correctly.',
        ],
      },
      {
        title: 'Member & Location Assignment',
        items: [
          'Use "Assigned To" to link a bill to a specific family member (e.g., a personal subscription).',
          'Use "Location" to associate the bill with a property or physical location (e.g., holiday home utilities).',
          'Bills without a member assignment are treated as shared household expenses.',
        ],
      },
      {
        title: 'Auto-Pay & Reminders',
        items: [
          'Tick "Auto-pay" to flag bills that are paid automatically from your account — they still appear in the list as a record.',
          'Tick "Email reminder" to receive an email before the bill is due. Set how many days in advance under "Remind N days before".',
          'Email reminders require SMTP to be configured in Settings → Email.',
        ],
      },
      {
        title: 'Attachments',
        items: [
          'Click the paperclip icon on any bill to open the attachments panel and upload PDFs, images, or documents.',
          'Uploaded files are displayed inline as preview cards — click to download or view the original.',
          'Delete individual attachments using the X icon on each preview card.',
        ],
      },
      {
        title: 'Overdue Bills',
        items: [
          'A bill turns overdue once its Next Due Date has passed. It moves to the red "Overdue" section at the top.',
          'To clear an overdue bill: edit it and update the Next Due Date to the next upcoming date.',
          'The Finance dashboard shows an overdue count badge when bills are outstanding.',
          'Date range filters (14 days / 30 days / Quarter / 12 months) let you control how far ahead to look for upcoming bills.',
        ],
      },
      {
        title: 'Category Column Picker',
        items: [
          'Toggle root category columns on/off using the checkboxes above the bill list.',
          'Each active category shows a mini-amount in that column, giving you a quick category breakdown without switching to Reports.',
          'The column total appears at the bottom of each column.',
        ],
      },
    ],
  },
  '/finance/budget': {
    title: 'Finance — Budget',
    sections: [
      {
        title: 'Overview',
        items: [
          'Budget rules let you set spending limits per category (or across all expenses) for a given period.',
          'Each budget card shows a progress bar: green while under budget, amber when nearing the alert threshold, and red when over.',
          'Spending is pulled live from this month\'s expense transactions.',
          'Entity tabs at the top let you filter the budget view by entity (Personal/Family, Super Fund, Trust, Business, etc.).',
        ],
      },
      {
        title: 'Creating a Budget Rule',
        items: [
          'Click "Add Budget". Name, Amount, and Period are required.',
          'Periods: Monthly, Weekly, or Yearly.',
          'Leave Category blank to create an overall household spending cap across all expense categories.',
          'Assign a specific category (e.g., Groceries, Fuel) to track that category\'s spending independently.',
          'Set "Alert at %" to choose when the bar turns amber — default is 80%.',
          'Assign an Entity to isolate this budget rule to a specific entity\'s spending.',
        ],
      },
      {
        title: 'Income Streams',
        items: [
          'Income Streams let you define regular income sources (salary, rental income, dividends, etc.) that contribute to your monthly budget.',
          'Click "Add Income Stream" and set the name, amount, and frequency (Weekly, Fortnightly, Monthly, Quarterly, Yearly, or Custom).',
          'Custom frequency lets you set a custom unit (Daily, Weekly, Monthly, Yearly) and interval.',
          'Assign an income stream to an Entity to track income per legal structure.',
          'Each stream shows its calculated monthly equivalent amount so you can compare across different frequencies at a glance.',
          'Toggle a stream on/off using the switch — disabled streams are excluded from budget calculations.',
        ],
      },
      {
        title: 'Rollover',
        items: [
          'Tick "Rollover unused" to carry any unspent budget forward into the next period.',
          'For example, if your monthly grocery budget is $500 and you only spent $420, the extra $80 rolls into next month.',
        ],
      },
      {
        title: 'Reading Budget Cards',
        items: [
          'The progress bar fills as spending increases relative to the budget amount.',
          'Amber bar means spending has exceeded the alert threshold (default 80%).',
          'Red bar means spending has hit or exceeded 100% of the budget.',
          'The card shows "Spent: $X of $Y" and a percentage so you can see exactly where you stand.',
        ],
      },
    ],
  },
  '/finance/categories': {
    title: 'Finance — Categories',
    sections: [
      {
        title: 'Overview',
        items: [
          'Categories classify transactions, bills, and budgets into meaningful groups (e.g., Groceries, Rent, Salary).',
          'Categories are organised as a tree — root categories can have sub-categories nested beneath them.',
          'System categories (marked "SYSTEM") are created automatically and cannot be deleted, but can be renamed.',
        ],
      },
      {
        title: 'Category Types',
        items: [
          'Expense — for spending transactions (shown in red badge).',
          'Income — for money coming in (shown in green badge).',
          'Transfer — for moving money between your own accounts (shown in blue badge).',
          'When adding a transaction, only categories matching the transaction type are shown.',
        ],
      },
      {
        title: 'Sub-Categories',
        items: [
          'Select a "Parent Category" when creating a category to nest it under an existing one.',
          'Sub-categories appear indented beneath their parent in the list.',
          'Use sub-categories to get more detail — e.g., "Food" as the parent with "Groceries" and "Restaurants" as children.',
        ],
      },
      {
        title: 'Category Flags',
        items: [
          '"Personal (private to me)" — marks the category as representing personal spending visible only to the assigned member. Useful for tracking individual expenditure within a shared household.',
          '"Location Based" — marks categories that are tied to a specific property or location (e.g., holiday home costs). Tagged transactions and bills can then be filtered by location.',
          '"External" — marks categories for spending associated with entities outside the household (e.g., a business).',
        ],
      },
      {
        title: 'Colours',
        items: [
          'Each category can have a custom colour that appears in reports, budget progress bars, and the spending breakdown on the dashboard.',
          'Choose a colour that makes sense at a glance — e.g., green for income, red for large expenses.',
        ],
      },
    ],
  },
  '/finance/goals': {
    title: 'Finance — Savings Goals',
    sections: [
      {
        title: 'Overview',
        items: [
          'Savings Goals help you track progress toward financial targets — a house deposit, holiday fund, emergency buffer, or any other savings objective.',
          'Each goal shows a progress bar from the current amount to the target amount.',
          'The bar turns green and shows "Goal completed!" when the current amount meets or exceeds the target.',
        ],
      },
      {
        title: 'Creating a Goal',
        items: [
          'Click "Add Goal". Name and Target Amount are required.',
          'Enter the Current Amount — how much is already saved toward this goal.',
          'Optionally set a Target Date to track the deadline and show the due month on the card.',
          'Link to an Account to associate the goal with the savings account being used.',
          'Choose a colour to visually identify the goal.',
        ],
      },
      {
        title: 'Updating Progress',
        items: [
          'Edit the goal and update the Current Amount as you save more toward the target.',
          'The progress bar and percentage update automatically.',
          'At 75% progress the bar turns amber; at 100% it turns green and the goal is marked complete.',
        ],
      },
      {
        title: 'Completing a Goal',
        items: [
          'A goal is marked complete automatically once the Current Amount reaches the Target Amount.',
          'Completed goals show a green card border and a "Goal completed!" message.',
          'Goals that are complete are hidden from the Finance dashboard\'s goal summary by default.',
        ],
      },
    ],
  },
  '/finance/locations': {
    title: 'Finance — Locations',
    sections: [
      {
        title: 'Overview',
        items: [
          'Locations represent physical places associated with spending — your primary home, a holiday property, a business premises, or any other address.',
          'Once created, locations can be assigned to transactions and bills so you can filter and report on spending by property.',
          'This is particularly useful for households that manage expenses across multiple properties.',
        ],
      },
      {
        title: 'Adding a Location',
        items: [
          'Click "Add Location". Name is required.',
          'Types: Primary, Secondary, Vacation, Business, Other — choose the one that best describes the property.',
          'Add the street address for reference — it\'s displayed on the location card but not used for filtering.',
          'Choose a colour to make the location visually distinct in lists and reports.',
        ],
      },
      {
        title: 'Using Locations',
        items: [
          'When adding a transaction or bill, select a location from the "Location" dropdown.',
          'On the Transactions page, use the Filters panel to filter the transaction list to a single location.',
          'Location categories (flagged "Location Based" in Finance → Categories) pair with locations to segment location-specific spending.',
        ],
      },
    ],
  },
  '/finance/members': {
    title: 'Finance — Family Members',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Members page lists all family members who have access to the household finances.',
          'Members can be assigned to transactions and bills so spending can be tracked per person.',
          'This page mirrors your family\'s user list — members are added here by email and must already have a HomeBase account.',
        ],
      },
      {
        title: 'Adding a Member',
        items: [
          'Click "Add Member" and enter the person\'s name and email address.',
          'The email must match an existing HomeBase user account.',
          'Once added, the member\'s name appears in the "Assigned To" dropdowns throughout the Finance module.',
        ],
      },
      {
        title: 'Member Spending',
        items: [
          'Assign transactions to a member to track individual spending within the household.',
          'Use Finance → Transactions → Filters → Member to view all transactions for a specific person.',
          'Personal categories (flagged "Personal" in Finance → Categories) work alongside member assignment to give each person a private view of their spending.',
        ],
      },
      {
        title: 'Removing a Member',
        items: [
          'Click the delete icon to remove a member from the family finance group.',
          'Removing a member does not delete their historical transactions — the member field on those transactions will become unlinked.',
        ],
      },
    ],
  },
  '/finance/reports': {
    title: 'Finance — Reports',
    sections: [
      {
        title: 'Overview',
        items: [
          'Reports gives you a summarised view of your financial health across different time periods.',
          'Use the period selector (top-right) to switch between Month, Quarter, or Year view.',
          'The page automatically recalculates when you change the period or navigate to previous/next periods using the arrow buttons.',
        ],
      },
      {
        title: 'Summary Cards',
        items: [
          'Income — total of all income transactions in the selected period.',
          'Expenses — total of all expense transactions in the selected period.',
          'Net Change — Income minus Expenses; green when positive (surplus), red when negative (deficit).',
          'Net Worth — combined current balance across all active accounts (not period-specific).',
          'Bills (Total) — total value of all recurring bills on record.',
        ],
      },
      {
        title: 'View Options',
        items: [
          'Toggle between "By Category" and "By Vendor" views to see spending grouped either by expense category or by payee.',
          'By Category — a breakdown of expense transactions grouped by category, sorted from highest to lowest spend with percentage of total.',
          'By Vendor — shows spending grouped by vendor/payee, useful for seeing which businesses receive the most of your money.',
          'Each row shows a proportional bar for quick visual comparison.',
        ],
      },
      {
        title: 'Drill-Down',
        items: [
          'Click on any category or vendor row to drill down and see the individual bills and transactions that make up that total.',
          'The drill-down panel shows each bill\'s name, amount, due date, and status.',
          'Click "Back to overview" to return to the full report.',
        ],
      },
      {
        title: 'Account Balances',
        items: [
          'Shows each account\'s current balance and type.',
          'The total at the bottom matches the Net Worth figure in the summary cards.',
          'This section reflects live balances, not period-specific changes.',
        ],
      },
    ],
  },
  '/finance/transactions': {
    title: 'Finance — Transactions',
    sections: [
      {
        title: 'Overview',
        items: [
          'Transactions is the main ledger for all money in and out — expenses, income, and transfers between accounts.',
          'Transactions are shown 50 per page, newest first. Use the Previous / Next buttons to page through older records.',
          'Each row is colour-coded: red for expenses, green for income, blue for transfers.',
        ],
      },
      {
        title: 'Adding a Transaction',
        items: [
          'Click "Add Transaction". Type and Amount are required.',
          'Types: Expense (money out), Income (money in), Transfer (between your own accounts).',
          'Assign an Account, Category, Member, and Location to keep records organised and filterable.',
          'Payee is the person or business you paid (or were paid by). Description is for any additional notes.',
          'Tick "Cleared" once the transaction has settled in your bank account (uncleared transactions show a "PENDING" badge).',
          'Tick "Private" to hide the transaction from other family members — useful for personal purchases.',
        ],
      },
      {
        title: 'Filtering Transactions',
        items: [
          'Click "Filters" to open the filter panel. You can filter by Type (Expense / Income / Transfer), Member, and Location.',
          'A blue dot on the Filters button indicates active filters are applied.',
          'Click "Clear" in the filter panel to remove all active filters.',
          'Filters reset when you navigate away from the page.',
        ],
      },
      {
        title: 'Editing & Deleting',
        items: [
          'Click the pencil icon on any transaction row to edit all of its fields.',
          'Click the red trash icon to permanently delete a transaction — you will be asked to confirm.',
          'Deleting a transaction does not automatically adjust the linked account\'s current balance; update the account balance manually if needed.',
        ],
      },
      {
        title: 'Transaction Status Badges',
        items: [
          '"PENDING" — the transaction is not yet cleared (reconciled with your bank statement).',
          '"PRIVATE" — the transaction is only visible to the person who created it.',
        ],
      },
    ],
  },
  '/finance/contacts': {
    title: 'Finance — Financial Contacts',
    sections: [
      {
        title: 'Overview',
        items: [
          'Financial Contacts stores the people and businesses you transact with — creditors you pay (utilities, landlords, subscriptions, tradespeople) and debtors who pay you (clients, employers, tenants).',
          'Each contact card shows the name (with an avatar), default category, contact details, and counts of linked bills and transactions.',
          'Contacts are shared across the whole family and can be assigned on bills, income entries, and transactions.',
        ],
      },
      {
        title: 'Adding & Editing',
        items: [
          'Click "Add Contact" and enter the name — this is the only required field.',
          'Optionally set a Default Category so every new bill or transaction using this contact automatically gets that category.',
          'Add website, phone number, and account reference (e.g., your customer or member number) for quick access.',
          'Use the Notes field to store any additional information about the contact.',
        ],
      },
      {
        title: 'Using Contacts',
        items: [
          'When adding a bill or income entry, the contact picker shows all contacts. Selecting one auto-fills the category if the contact has a default category set.',
          'The contact card shows how many bills and transactions are linked, letting you see at a glance which contacts are most active.',
          'Delete a contact to unlink it from all associated bills and transactions — the records themselves are preserved.',
        ],
      },
    ],
  },
  '/finance/entities': {
    title: 'Finance — Entities',
    sections: [
      {
        title: 'Overview',
        items: [
          'Entities represent legal or accounting structures within your household — Personal/Family, Superannuation Fund, Trust, Business, Investment Fund, or Other.',
          'Entity-based isolation lets you track spending and budgets separately for each entity, so superannuation contributions don\'t get mixed with daily household expenses.',
          'Each entity has a preset colour and type badge for quick visual identification throughout the Finance module.',
        ],
      },
      {
        title: 'Setting Up an Entity',
        items: [
          'Click "Add Entity". Name and Type are required. The name appears in entity selectors across bills, transactions, and budgets.',
          'Entity types: Personal/Family, Super Fund, Trust, Business, Investment, Other — choose the one that best describes the structure.',
          'Pick a preset colour to visually identify the entity in cards and lists.',
          'Set an entity as Default to have it pre-selected in relevant forms.',
        ],
      },
      {
        title: 'Managing Entities',
        items: [
          'Use the drag handle to reorder entities — the order is reflected in entity tabs and selectors.',
          'Deactivate an entity to hide it from selectors without losing its historical transactions and budgets.',
          'Reactivate a deactivated entity at any time — it reappears in selectors with all its history intact.',
          'Inactive entities are displayed in a separate collapsed section below the active list.',
          'Delete an entity to permanently remove it and unlink its transactions and budget rules.',
        ],
      },
    ],
  },
  '/finance/paid-bills': {
    title: 'Finance — Paid Bills',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Paid Bills page shows a history of all bills that have been marked as paid — a record of what was paid, when, and for how much.',
          'Paid bills are listed chronologically by their paid date, newest first.',
          'Use this page to review past payments, verify amounts, or undo a payment if it was marked in error.',
        ],
      },
      {
        title: 'Filtering Paid Bills',
        items: [
          'Use the "Show last" dropdown to choose the lookback period: 1 month, 3 months, 6 months, or 12 months.',
          'Toggle root category columns on/off to see a category breakdown of paid amounts at a glance.',
          'Active category columns show mini-amounts for each bill, with column totals at the bottom.',
        ],
      },
      {
        title: 'Undoing a Payment',
        items: [
          'Click the "Undo" icon on any paid bill to move it back to the active Bills list.',
          'The bill returns to its original state with the original Next Due Date — you can then edit the date or mark it paid again later.',
          'Undo is useful if a bill was accidentally marked as paid or if the payment failed.',
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
  '/finance/income': {
    title: 'Finance — Income',
    sections: [
      {
        title: 'Overview',
        items: [
          'Track recurring and one-off income — salary, rental income, dividends, freelance payments, and any other money coming in.',
          'Income follows a similar two-step process to bills: first create the income entry, then mark it as received.',
          'Use the sub-navigation to switch between Income (active) and Received (history) views.',
        ],
      },
      {
        title: 'Creating Income',
        items: [
          'Click "Add Income" to open the form. Choose Recurring or One-off.',
          'Enter name, amount, category (must be an Income type category), account, entity, and the expected date.',
          'For recurring income, set the frequency (Weekly, Fortnightly, Monthly, etc.) and the next expected date.',
          'Assign a member and location if the income is specific to one person or property.',
        ],
      },
      {
        title: 'Payslip Support',
        items: [
          'For salary income, you can enter detailed payslip data including gross pay, PAYG withheld, superannuation guarantee (SGC), and individual pay components.',
          'Payslip details are stored and viewable from the income row — click the "Payslip" badge to expand the breakdown.',
          'Payslip data feeds into the Tax Report for accurate PAYG and SGC reporting.',
        ],
      },
      {
        title: 'Marking Received',
        items: [
          'When income arrives, click the green tick on the income row and confirm the received date.',
          'Marking as received immediately posts the income to the P&L and increases the linked bank account balance.',
          'The income entry moves from the active list to the Received history.',
        ],
      },
      {
        title: 'Category Column Picker',
        items: [
          'Toggle root category columns on/off using the checkboxes above the income list.',
          'Each active category shows a mini-amount in that column, giving you a quick category breakdown.',
          'The column total appears at the bottom of each column.',
        ],
      },
    ],
  },
  '/finance/income/received': {
    title: 'Finance — Income Received',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Received page shows a history of all income entries that have been marked as received.',
          'Entries are listed chronologically by their received date, newest first.',
          'Use this page to review past income, verify amounts, or undo a receipt if it was marked in error.',
        ],
      },
      {
        title: 'Filtering',
        items: [
          'Use the period selector to choose the lookback period: 1 month, 3 months, 6 months, or 12 months.',
          'Toggle root category columns on/off to see a category breakdown of received amounts at a glance.',
        ],
      },
      {
        title: 'Undo Received & Voiding',
        items: [
          'Click the "Undo" icon on any received entry to move it back to the active Income list.',
          'Undo is useful if income was accidentally marked as received.',
          'Use "Void" to cancel an income entry while preserving the audit trail — the entry remains visible with a "Voided" status.',
        ],
      },
    ],
  },
  '/finance/profit-loss': {
    title: 'Finance — Profit & Loss',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Profit & Loss report shows your income vs expenses for any period — month, quarter, or year.',
          'Toggle between Accrual (posted invoices only) and +Forecast (accrual plus upcoming recurring entries) views.',
          'Use the period toggle (Month/Quarter/Year) and arrow buttons to navigate between periods.',
        ],
      },
      {
        title: 'Entity Filtering',
        items: [
          'Filter by entity using the entity tabs (Personal/Family, Super Fund, Trust, Business, etc.).',
          'Each entity shows its own P&L breakdown, letting you see financial performance per legal structure.',
          'The "All" tab combines all entities for a household-wide view.',
        ],
      },
      {
        title: 'Income & Expense Sections',
        items: [
          'Both income and expense sides show category breakdowns with amounts and proportional bars.',
          'Click any category row to drill into the underlying bills and transactions that make up that total.',
          'The drill-down panel shows each item\'s name, amount, date, and status.',
        ],
      },
      {
        title: 'Summary Bar',
        items: [
          'The summary bar at the top shows total income, total expenses, estimated tax, and net profit.',
          'Net profit is shown in green (positive) or red (negative) for quick visual assessment.',
        ],
      },
      {
        title: 'Export',
        items: [
          'Use the Print button for a printer-friendly version.',
          'Use the Excel button to download the report as a spreadsheet.',
        ],
      },
    ],
  },
  '/finance/trial-balance': {
    title: 'Finance — Trial Balance',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Trial Balance shows all GL account balances for a given date range, grouped by account type (Assets, Liabilities, Equity, Income, Expenses).',
          'Total debits should equal total credits — a balanced ledger is indicated by a green checkmark.',
          'Use this report to verify the integrity of your accounting data before running financial statements.',
        ],
      },
      {
        title: 'Date Range & Filtering',
        items: [
          'Set custom From/To dates to view balances for any period. Defaults to the current month.',
          'Filter by entity to see the trial balance for a specific legal structure.',
          'Use the search field to quickly find accounts by name or GL code.',
        ],
      },
      {
        title: 'Drill-Down',
        items: [
          'Click any account row to see the individual transactions (ledger entries) that make up that account\'s balance.',
          'The ledger panel shows each transaction\'s date, description, and amount.',
          'Click "Back to Trial Balance" to return to the full report.',
        ],
      },
      {
        title: 'Export',
        items: [
          'Use the Print button for a printer-friendly version.',
          'Use the Excel button to download the trial balance as a spreadsheet.',
        ],
      },
    ],
  },
  '/finance/balance-sheet': {
    title: 'Finance — Balance Sheet',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Balance Sheet is a snapshot of your financial position at a given date — what you own (Assets) vs what you owe (Liabilities) and your Equity.',
          'The fundamental accounting equation: Assets = Liabilities + Equity.',
          'Use the date picker to set the snapshot date for the balance sheet.',
        ],
      },
      {
        title: 'Sections',
        items: [
          'Assets are split into Bank Accounts, Accounts Receivable (unpaid invoices), and Other Asset GL accounts.',
          'Liabilities are split into Credit/Overdraft Accounts, Accounts Payable (unpaid bills), and Other Liability GL accounts.',
          'Equity shows retained earnings (opening balances) and the current period net income.',
        ],
      },
      {
        title: 'Net Worth Check',
        items: [
          'A reconciliation indicator compares Total Equity against Net Worth (Assets minus Liabilities).',
          'A green checkmark with "Balanced" confirms the accounting equation holds.',
          'A warning indicator appears when there\'s a discrepancy — investigate missing opening balances or unposted entries.',
        ],
      },
      {
        title: 'Entity Tabs',
        items: [
          'Filter by entity to see the balance sheet per legal structure.',
          'The "All" tab combines all entities for a household-wide balance sheet.',
        ],
      },
      {
        title: 'Export',
        items: [
          'Use the Print button for a printer-friendly version.',
          'Use the Excel button to download the balance sheet as a spreadsheet.',
        ],
      },
    ],
  },
  '/finance/bas': {
    title: 'Finance — BAS (GST)',
    sections: [
      {
        title: 'Overview',
        items: [
          'The BAS (Business Activity Statement) page shows GST on sales and purchases, organised by quarterly periods aligned to your financial year.',
          'Use this page to prepare your quarterly BAS lodgement — it summarises GST collected and paid.',
          'Navigate between quarters using the left/right arrow buttons.',
        ],
      },
      {
        title: 'GST Summary Cards',
        items: [
          'G1 — Total sales (including GST) for the quarter.',
          'G10 — Estimated GST on sales (G1 ÷ 11).',
          'G11 — Total purchases (including GST) for the quarter.',
          '1B — GST on purchases (G11 ÷ 11).',
          'Net GST shows the amount payable (red) or refundable (green).',
        ],
      },
      {
        title: 'Sales & Purchases Detail',
        items: [
          'Expand the Sales and Purchases sections to see individual GST lines from posted journals.',
          'Each line shows the journal reference, date, description, GL account, entity, and GST amount.',
          'Use the entity filter to see BAS data per legal structure.',
        ],
      },
      {
        title: 'Export',
        items: [
          'Use the Print button for a printer-friendly version suitable for lodgement reference.',
        ],
      },
    ],
  },
  '/finance/tax-report': {
    title: 'Finance — Tax Report',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Tax Report provides an annual tax calculation per family member (or joint) showing income, deductions, estimated tax, and refund or amount owing.',
          'Select a financial year using the arrow buttons to navigate between years.',
          'Data is pulled from posted journal entries and income records for the selected period.',
        ],
      },
      {
        title: 'Entity Tabs',
        items: [
          'Filter by entity (Personal/Family, Super Fund, Trust, etc.) to see tax data per legal structure.',
          'The "Joint" tab combines all entities for a complete household tax picture.',
          'Member tabs (Mark, Sarah, etc.) show per-person tax calculations when members are set up.',
        ],
      },
      {
        title: 'Income & Deductions',
        items: [
          'Income breakdown includes wages, bank interest, other income, and franking credits — both actual and projected amounts.',
          'Deductions include voluntary super contributions, charity/gifts, and other deductions.',
          'Each section shows individual income lines from posted journals and income entries.',
        ],
      },
      {
        title: 'Tax Calculation',
        items: [
          'Uses ATO tax brackets to calculate income tax and Medicare levy.',
          'Shows taxable income, estimated tax per week, total tax payable, and total credits.',
          'Credits include PAYG withheld, PAYG instalments, and franking credit offsets.',
          'The result shows a refund (green) or amount owing (red).',
          'Superannuation guarantee (SGC) amount is shown separately.',
        ],
      },
      {
        title: 'Export',
        items: [
          'Use the Print button for a printer-friendly version.',
          'Use the Excel button to download the tax report as a spreadsheet.',
        ],
      },
    ],
  },
  '/finance/vendor-statement': {
    title: 'Finance — Vendor Statement',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Vendor Statement shows all invoices and payments for a selected vendor within a date range, with a running balance.',
          'Useful for reconciling your records with a supplier\'s or customer\'s statements.',
          'Select the vendor from the dropdown to generate their statement.',
        ],
      },
      {
        title: 'Statement Type & Date Range',
        items: [
          'Choose AP (Accounts Payable — vendors you owe) or AR (Accounts Receivable — vendors who owe you) as the statement type.',
          'Set custom From/To dates to define the period covered by the statement.',
          'The statement shows an opening balance, all line items, and a closing balance.',
        ],
      },
      {
        title: 'Line Items',
        items: [
          'Each line shows the date, type (invoice/payment/receipt), description, reference number, charges, payments, and running balance.',
          'The closing balance at the bottom shows the net position with the selected vendor.',
        ],
      },
      {
        title: 'Export',
        items: [
          'Use the Print button for a printer-friendly version suitable for sharing with vendors.',
        ],
      },
    ],
  },
  '/finance/annual-pnl': {
    title: 'Finance — Annual P&L',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Annual P&L shows a year-to-date profit and loss comparison across 12 months in a single view.',
          'Each column represents a month of the financial year, with income and expense categories as rows.',
          'Navigate between financial years using the arrow buttons.',
        ],
      },
      {
        title: 'Entity Filtering',
        items: [
          'Filter by entity using the entity tabs to see annual P&L per legal structure.',
          'The "All" tab combines all entities for a household-wide view.',
        ],
      },
      {
        title: 'Reading the Report',
        items: [
          'Income category rows show monthly amounts with a total column on the right.',
          'Expense category rows follow the same layout.',
          'The summary row at the bottom shows total income, total expenses, and net profit/loss per month and for the full year.',
          'Positive amounts are shown in green, negative in red.',
        ],
      },
      {
        title: 'Export',
        items: [
          'Use the Print button for a printer-friendly version.',
          'Use the Excel button to download the annual P&L as a spreadsheet.',
        ],
      },
    ],
  },
  '/finance/accounts-payable': {
    title: 'Finance — Accounts Payable Aging',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Accounts Payable Aging report shows all unpaid bills grouped by vendor and aged by days since invoice date.',
          'Aging buckets: 0-30 days, 31-60 days, 61-90 days, and 91+ days.',
          'This helps you manage cash flow and prioritise which bills to pay first.',
        ],
      },
      {
        title: 'Reading the Report',
        items: [
          'Each vendor row shows the amounts in each aging bucket and a total column.',
          'Expand a vendor row to see the individual bills that make up their total.',
          'Each bill shows the invoice date, days since invoice, amount, and reference.',
        ],
      },
      {
        title: 'Reconciliation Check',
        items: [
          'The header shows the GL subledger balance vs the total from unpaid bills.',
          'A green checkmark indicates the subledger is reconciled with the GL.',
          'A warning indicator appears when there\'s a difference that may need investigation.',
        ],
      },
      {
        title: 'Filtering',
        items: [
          'Filter by entity to see AP aging per legal structure.',
          'Use the search field to filter bills by name or vendor.',
        ],
      },
    ],
  },
  '/finance/accounts-receivable': {
    title: 'Finance — Accounts Receivable Aging',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Accounts Receivable Aging report shows all unpaid income entries grouped by payer and aged by days since invoice date.',
          'Aging buckets: 0-30 days, 31-60 days, 61-90 days, and 91+ days.',
          'This helps you track who owes you money and follow up on overdue amounts.',
        ],
      },
      {
        title: 'Reading the Report',
        items: [
          'Each payer row shows the amounts in each aging bucket and a total column.',
          'Expand a payer row to see the individual income entries that make up their total.',
          'Each entry shows the invoice date, days since invoice, and amount.',
        ],
      },
      {
        title: 'Reconciliation Check',
        items: [
          'The header shows the GL subledger balance vs the total from unpaid income entries.',
          'A green checkmark indicates the subledger is reconciled with the GL.',
          'A warning indicator appears when there\'s a difference that may need investigation.',
        ],
      },
      {
        title: 'Filtering',
        items: [
          'Filter by entity to see AR aging per legal structure.',
        ],
      },
    ],
  },
  '/finance/drafts': {
    title: 'Finance — Drafts (Approval)',
    sections: [
      {
        title: 'Overview',
        items: [
          'Drafts are pending bill and income entries that have been auto-generated from recurring templates.',
          'Drafts sit in a holding state until approved or cancelled — nothing is posted to the GL until approved.',
          'Switch between the "Draft Bills" and "Draft Income" tabs to see pending items of each type.',
        ],
      },
      {
        title: 'Reviewing Drafts',
        items: [
          'Each draft shows the template source, amount, due date, category, and vendor/payer.',
          'Expand a draft to see its proposed journal lines (debit/credit breakdown).',
          'Click the pencil icon to edit draft details — name, amount, category, account, etc. — before approving.',
        ],
      },
      {
        title: 'Approving & Rejecting',
        items: [
          'Click the green checkmark to approve a draft — it becomes an active bill or income entry and posts journal entries to the GL.',
          'Click the red X to cancel a draft without posting anything to the GL.',
          'Use "Approve All" to approve multiple drafts in bulk — useful at the start of a new period.',
        ],
      },
    ],
  },
  '/finance/journals': {
    title: 'Finance — Journal Entries',
    sections: [
      {
        title: 'Overview',
        items: [
          'Journal Entries allows you to make direct GL adjustments — corrections, accruals, depreciation, reclassifications, and opening balance entries.',
          'Use the tabs to filter between Manual entries (posted), Drafts (unposted), and All Posted entries.',
          'Entries are shown 50 per page, newest first.',
        ],
      },
      {
        title: 'Creating an Entry',
        items: [
          'Click "New Journal" to open the entry form. Enter a description, date, and at least two journal lines.',
          'Each journal line requires a GL account, side (debit or credit), and amount — total debits must equal total credits.',
          'Optionally assign the entry to an entity and add a reference number.',
          'Click "Post" to submit the entry to the GL.',
        ],
      },
      {
        title: 'Entry Actions',
        items: [
          'Post — submit a draft entry to the GL. Once posted, the entry affects account balances.',
          'Reverse — create an automatic reversing entry on the first day of the next period (useful for accruals).',
          'Void — cancel a posted entry while preserving the audit trail (the entry remains visible with a "Voided" status).',
          'Amend — modify a posted entry; the system creates an automatic reversal and re-posts the corrected version.',
        ],
      },
      {
        title: 'Viewing Entries',
        items: [
          'Each entry row shows the date, reference/description, total debits, total credits, and status badge.',
          'Status badges: Posted (green), Draft (amber), Voided (red/grey).',
          'Expand an entry to see its individual journal lines with GL account names, debit/credit amounts, and line descriptions.',
        ],
      },
    ],
  },
  '/finance/templates': {
    title: 'Finance — Recurring Templates',
    sections: [
      {
        title: 'Overview',
        items: [
          'Recurring Templates are the engine behind automated recurring transactions — they automatically spawn new bill or income entries on their schedule.',
          'Templates are split into two sections: Bill Templates (expenses) and Income Templates (revenue).',
          'Each section shows the next occurrence date, frequency, amount, and whether the template is currently enabled.',
        ],
      },
      {
        title: 'Creating a Template',
        items: [
          'Click "New Bill" or "New Income" to create a template. Enter name, amount, category, and frequency.',
          'Frequency options: Weekly, Fortnightly, Monthly, Quarterly, Yearly, or Custom (set your own interval).',
          'Set the next occurrence date to control when the first auto-spawn happens.',
          'Templates can include GL account mappings, entity assignments, member/location assignments, and tax classifications.',
        ],
      },
      {
        title: 'Managing Templates',
        items: [
          'Toggle a template on/off using the switch — disabled templates stop spawning new entries.',
          'Edit a template using the pencil icon. The form shows an occurrence preview so you can see upcoming dates.',
          'Delete a template using the trash icon — this does not affect entries already spawned.',
          'Each template shows its total occurrence count and next scheduled date.',
        ],
      },
      {
        title: 'Auto-Spawn',
        items: [
          'Templates are processed automatically by the scheduler (typically runs daily).',
          'When processed, enabled templates with a past next occurrence date generate a new draft entry.',
          'Use Finance → Admin → "Spawn Templates Now" to trigger immediate processing for testing or catch-up.',
          'Newly spawned entries appear in Drafts (Approval) where they can be reviewed before posting.',
        ],
      },
    ],
  },
  '/finance/admin': {
    title: 'Finance — Admin',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Finance Admin page provides administrative tools for managing the finance module — template spawning, period locks, and system information.',
          'These tools are intended for family administrators and system operators.',
        ],
      },
      {
        title: 'Spawn Templates Now',
        items: [
          'Manually trigger the recurring template spawner to process all enabled templates immediately.',
          'Results show which families were processed, how many templates were considered, and how many entries were spawned.',
          'Useful for testing template configurations or catching up after templates were disabled.',
        ],
      },
      {
        title: 'Period Locks',
        items: [
          'Lock financial periods to prevent changes to posted entries in closed periods.',
          'Locked periods cannot have new journal entries posted to them, protecting the integrity of completed accounting periods.',
          'Unlock a period if corrections are needed — but this should be done sparingly and documented.',
        ],
      },
    ],
  },
  '/finance/simple-budget-planner': {
    title: 'Finance — Simple Budget Planner',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Simple Budget Planner is a straightforward budgeting tool separate from the main Budget module.',
          'Track planned income and expenses across categories for weekly, fortnightly, monthly, or yearly periods.',
          'Toggle between view periods — all amounts are automatically recalculated to the selected period.',
        ],
      },
      {
        title: 'Income & Expense Sections',
        items: [
          'Add income items (salary, side hustle, rental income, etc.) under the Income section.',
          'Add expense items under categories like Home & Utilities, Groceries, Transport, Entertainment, Personal, and more.',
          'Each section shows a subtotal so you can see income vs expenses at a glance.',
          'Items are colour-coded by category for quick visual identification.',
        ],
      },
      {
        title: 'Adding Items',
        items: [
          'Click the "+" button in any section to add a new budget line.',
          'Enter a name, amount, and frequency for each item.',
          'Use the inline form to quickly add multiple items.',
        ],
      },
      {
        title: 'Summary & Export',
        items: [
          'The summary at the bottom shows total income, total expenses, and the difference (surplus or deficit).',
          'Surplus is shown in green, deficit in red.',
          'Use the reset button to clear all budget data and start fresh.',
          'Export to Excel or print using the toolbar buttons.',
        ],
      },
    ],
  },
  '/trips': {
    title: 'Trips',
    sections: [
      {
        title: 'Overview',
        items: [
          'Plan and manage family trips — browse all trips as cover cards showing destination, date range, and status.',
          'Trip statuses: Planning (blue), Upcoming (amber), In Progress (green), Completed, and Cancelled.',
          'Filter trips by status using the tab bar at the top.',
        ],
      },
      {
        title: 'Creating a Trip',
        items: [
          'Click "New Trip" and fill in the trip name, destination, start/end dates, and optional notes.',
          'Trips are automatically assigned a cover colour palette based on the trip ID.',
          'Once created, the trip appears on the list with its status badge and date range.',
        ],
      },
      {
        title: 'Managing Trips',
        items: [
          'Click any trip card to open its detail page with itinerary, packing, weather, budget, and maps.',
          'Delete a trip using the trash icon on the card — you will be asked to confirm.',
          'Use the tag manager to add tags for filtering and organisation.',
        ],
      },
    ],
  },
  '/trips/\\[id\\]': {
    title: 'Trip Detail',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Trip Detail page is your central hub for managing all aspects of a trip.',
          'On desktop, the page uses a split-pane layout: the left sidebar shows trip info and day-by-day navigation, the right pane shows the selected view.',
          'On mobile, use the tab bar at the bottom to switch between Overview, Itinerary, Packing, Weather, Budget, and Maps.',
        ],
      },
      {
        title: 'Itinerary',
        items: [
          'Plan activities for each day of your trip. Each day card shows the date and day number.',
          'Click "Add Activity" to add an activity with a name, time, location, notes, and optional tags.',
          'Reorder activities within a day using the drag handle on each activity card.',
          'Click an activity to edit it, or use the note icon to add private notes.',
        ],
      },
      {
        title: 'Packing',
        items: [
          'Create one or more packing lists for the trip (e.g., by person or by bag type).',
          'Add items with quantities and mark them as packed/unpacked using the checkbox.',
          'Track overall packing progress per list with a progress indicator.',
        ],
      },
      {
        title: 'Weather',
        items: [
          'View the weather forecast for the trip destination and date range.',
          'Weather data is displayed inline for quick reference while planning.',
        ],
      },
      {
        title: 'Budget',
        items: [
          'Set a budget amount for the trip and track expenses against it.',
          'Add individual expense items with amounts and optional categories.',
          'See total spending and remaining budget at a glance.',
        ],
      },
      {
        title: 'Maps',
        items: [
          'View the trip destination on an interactive Google Map.',
          'Key locations from your itinerary may be shown on the map.',
        ],
      },
      {
        title: 'Attachments',
        items: [
          'Upload and attach files to the trip — documents, images, PDFs, etc.',
          'Attachments are displayed as preview cards with download and delete options.',
        ],
      },
      {
        title: 'Editing & Deleting',
        items: [
          'Click the pencil icon next to the trip name to edit trip details.',
          'Use the trash icon in the header to delete the entire trip — you will be asked to confirm.',
        ],
      },
    ],
  },
  '/budget-planner': {
    title: 'Budget Planner',
    sections: [
      {
        title: 'Overview',
        items: [
          'The Budget Planner is a straightforward budgeting tool to track planned income and expenses across categories.',
          'Toggle between Weekly, Fortnightly, Monthly, and Yearly views — all amounts are automatically recalculated.',
          'Items are colour-coded by category for quick visual identification.',
        ],
      },
      {
        title: 'Income & Expense Sections',
        items: [
          'Add income items (salary, side hustle, rental income, etc.) under the Income section.',
          'Add expense items under categories like Home & Utilities, Groceries, Transport, Entertainment, and more.',
          'Each section shows a subtotal for quick comparison.',
        ],
      },
      {
        title: 'Adding Items',
        items: [
          'Click the "+" button in any section to add a new budget line.',
          'Enter a name, amount, and frequency for each item.',
          'Use the inline form to quickly add multiple items.',
        ],
      },
      {
        title: 'Summary & Export',
        items: [
          'The summary shows total income, total expenses, and the surplus or deficit.',
          'Surplus is shown in green, deficit in red.',
          'Use the reset button to clear all data and start fresh.',
          'Export to Excel or print using the toolbar buttons.',
        ],
      },
    ],
  },
  '/admin': {
    title: 'System Admin',
    sections: [
      {
        title: 'Overview',
        items: [
          'The System Admin panel provides tools for managing families, users, and server operations.',
          'This page is only accessible to system administrators.',
        ],
      },
      {
        title: 'Docker Logs',
        items: [
          'View real-time application logs directly from the admin panel.',
          'Filter logs by level (log, info, warn, error) using the dropdown.',
          'Toggle auto-refresh to monitor logs in real time.',
        ],
      },
      {
        title: 'Families',
        items: [
          'View all registered families with their member counts.',
          'Click a family to see its users and manage their settings.',
        ],
      },
      {
        title: 'Users',
        items: [
          'View users within a selected family.',
          'Change user roles between admin and member.',
          'Reset user passwords if needed.',
        ],
      },
      {
        title: 'Server Actions',
        items: [
          'Trigger template spawning to process recurring templates immediately.',
          'Restart the Cloudflare tunnel if needed.',
          'Manage database and system backups.',
        ],
      },
      {
        title: 'Audit Trail',
        items: [
          'View the system-wide audit log showing changes made across all families.',
          'Useful for troubleshooting and security monitoring.',
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

  // /trips/[id] -> /trips/\[id\]
  if (pathname.startsWith('/trips/') && pathname !== '/trips') {
    return HELP_CONTENT['/trips/\\[id\\]'] ?? null
  }

  // /finance/* — each sub-page has its own entry; fall back to /finance for unknown sub-paths
  if (pathname.startsWith('/finance/')) {
    return HELP_CONTENT[pathname] ?? HELP_CONTENT['/finance'] ?? null
  }

  // /settings/* -> /settings
  if (pathname.startsWith('/settings/')) {
    return HELP_CONTENT['/settings'] ?? null
  }

  return null
}