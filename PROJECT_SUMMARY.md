# HomeBase - Family Management Platform
## Phase 7: Complete Project Implementation

### Project Overview
HomeBase is a comprehensive family management platform built with Next.js 16, TypeScript, Prisma, and SQLite. The application provides a centralized hub for family organization including calendar management, meal planning, shopping lists, recipes, notes, and more.

### Core Features Implemented

#### 1. **Authentication & User Management**
- Multi-user authentication with NextAuth
- Family-based user organization
- Invite code system for family member onboarding
- Role-based permissions (admin/member)
- User preferences and theme customization

#### 2. **Calendar & Event Management**
- Family calendar with month/week views
- Event creation, editing, and deletion
- Google Calendar synchronization
- Personal vs family event distinction
- Color-coded event categories (editable names and colors, even for system defaults)
- All-day events support
- **Recurring events** with daily, weekly, monthly, yearly options
- Recurring event instances expand dynamically in calendar views
- Delete options: single instance or entire recurring series

#### 3. **Meal Planning System**
- Weekly meal planning grid
- Drag-and-drop meal assignment
- Recipe integration with meal slots
- Grocery list generation from meal plans
- Export functionality for grocery shopping
- Daily meal column organization
- Scope selector (7/14/30 days) for rolling forward display

#### 4. **Shopping & Todo Lists**
- Multiple list types (shopping, todo)
- Category-based organization
- Drag-and-drop reordering
- Completed items with configurable colors
- Recipe integration for shopping items
- Due dates and priority management
- **Per-user assignment** with My Tasks / Family Tasks filtering

#### 5. **Recipe Management**
- Recipe database with full CRUD operations
- Recipe import from URLs (web scraping)
- Umami recipe archive import support
- Recipe books organization
- Photo display and management
- Ingredient parsing and categorization

#### 6. **Tag Management System** (New in Phase 7)
- **TagManager**: Full CRUD interface for tag management
- **TagSelector**: Interactive tag selection component
- **TagCloud**: Visual tag cloud display with frequency weighting
- Database schema with tag relationships
- API endpoints with comprehensive testing
- Recipe-tag association system
- **Color Picker**: Visual color selection for tags with live preview

#### 7. **Ingredient Category Management** (New in Phase 7)
- **CategoryManager**: Interface for ingredient category management
- **CategoryAssignment**: Component for assigning categories to ingredients
- Machine learning-based category suggestions
- API endpoints for category operations
- Integration with recipe ingredient parsing
- **Color Picker**: Visual color selection for categories with live preview

#### 8. **Notes System** (New in Phase 7)
- Full-featured notes application
- Rich text editor with formatting
- Note organization and search
- Individual note pages with detail view
- API endpoints for CRUD operations
- Family-based note sharing
- **PIN Protection**: Optional PIN-based security for sensitive notes
- **Secure Unlock**: bcrypt-hashed PIN verification with 15-minute session cookies
- **Content Masking**: Locked note content is blurred with "PIN required to view" overlay on cards

#### 9. **Advanced Theming System** (New in Phase 7)
- **AdvancedThemeProvider**: Extended theme management
- **AdvancedThemingTab**: User interface for theme customization
- **ColorPicker**: Custom color selection component
- Dynamic theme switching (dark/light/auto)
- Font size and UI preference settings
- Done item color customization
- **Apple Pro Theme**: Premium high-contrast professional theme with refined typography and spacing
- **5 Apple-system themes**: `apple-aqua` (light), `apple-graphite` (neutral dark), `apple-sunset` (warm coral), `apple-midnight` (deep navy), `apple-forest` (earthy green) — all additive, existing themes preserved
- **iOS utility tokens**: `--cat-*` category colors and `--meal-*` meal-type colors added globally; Apple system font stack scoped to Apple themes

#### 10. **Secure Document & Contact Vault** (New in Phase 7)
- **PIN Protection**: Optional PIN-based security for documents and household contacts
- **Secure Unlock Dialog**: Reusable unlock dialog with show/hide PIN toggle and error handling
- **Session Management**: 15-minute httpOnly cookie-based unlock sessions
- **API Endpoints**: Dedicated unlock endpoints for notes, documents, and contacts
- **Content Masking**: Locked content is masked until verified unlock

#### 11. **Audit Log & Activity Tracking** (New in Phase 7)
- **Activity Log**: Lightweight audit trail of family changes with undo support
- **Backup & Truncate**: One-click backup and cleanup of entries older than 3 months
- **JSON Export**: Downloads audit log backup as JSON before truncation
- **Confirmation Dialog**: Safe-guarded truncation with user confirmation

#### 12. **Settings & Configuration**
- Family settings management
- Google Calendar integration
- Data import/export functionality
- Appearance customization (including Apple Pro theme)
- Integration management
- Tunnel configuration for external access

#### 13. **AI Voice & Chat Assistant** (New)
- **Floating Bot button** present on every page — opens a chat panel with voice and text input
- **Web Speech API** for microphone transcription (Chrome, Edge, iOS 14.5+, Android Chrome)
- **Multi-provider AI** — choose between **Google Gemini** (free tier via AI Studio) or **DeepSeek** (very cost-effective); provider selection persisted per user
- **Supported models**: Gemini 2.0 Flash Lite / 2.0 Flash / 1.5 Pro / 2.5 Pro; DeepSeek Chat
- **19 supported actions** across all major app areas (see below)
- **AI Settings tab** in Settings: select provider, enter API key, choose model, test connection
- **Per-user key storage** — each family member can configure their own key and provider
- **PWA compatible** — works on Windows PWA, Android PWA, and iOS PWA (16+)
- **Text fallback** — typed commands always available when mic is unsupported or unavailable
- **Context-aware** — AI receives recipes, shopping lists, meal plan, chores, events, and birthdays in its system prompt so it can resolve names and dates naturally
- **Microphone Permission Prompt** — Cross-platform permission dialog that auto-shows when voice input is first used, with platform-specific instructions for Windows, macOS, iOS, and Android. Handles denied state with recovery guidance.

**Meal plan**: add recipe, clear slot, query week, generate shopping list from meal plan  
**Shopping list**: add items, read list, tick off item  
**To-do list**: add task with optional due date  
**Calendar**: create event (timed or all-day), query week or specific day  
**Chores**: mark complete (recalculates next due), query by filter (overdue/upcoming/mine)  
**Notes**: create by dictation, search by keyword  
**Recipes**: fuzzy search by name, get ingredient list  
**Contacts**: look up by name or category (PIN-protected contacts shown as protected)  
**Documents**: query by name/category, show expiring within 90 days  
**Birthdays**: query upcoming (next 60 days), filter by month or name

### Technical Architecture

#### Database Schema (Prisma)
- **Family**: Central family entity
- **User**: Authentication and preferences
- **Event**: Calendar events
- **List/ListItem**: Shopping and todo lists
- **Recipe**: Recipe storage with ingredients
- **MealPlan**: Weekly meal planning
- **Tag**: Tag management system
- **IngredientCategory**: Ingredient categorization
- **Note**: Notes system
- **RecipeBook**: Recipe organization
- **GoogleCalendarSync**: Calendar integration
- **Chore**: Chore management with assignment, scheduling, notes
- **ChoreCompletion**: Completion tracking with who/when

#### API Structure
- RESTful API routes following Next.js App Router conventions
- Type-safe API responses with TypeScript
- Authentication middleware for protected routes
- Comprehensive error handling
- API testing with Vitest

#### Frontend Components
- Modular component architecture with shadcn/ui
- Responsive design with Tailwind CSS
- Drag-and-drop functionality with @dnd-kit
- Form handling with react-hook-form and zod validation
- Real-time updates with optimistic UI
- Theme-aware components

### Key Files Created/Modified

#### Database Migrations
- `prisma/migrations/20260419101620_add_tag_and_category_enhancements/migration.sql`
- `prisma/migrations/20260419201552_add_done_item_color/migration.sql`
- `prisma/migrations/20260505000000_add_tag_category_colors/migration.sql`
- `prisma/migrations/20260505000001_add_pin_hash_fields/migration.sql`
- `prisma/migrations/20260508200000_add_chore_note_and_item_assignment/migration.sql` — Add note to Chore, assignedToUserId to ListItem

#### API Endpoints
- `src/app/api/tags/`: Tag management API (with color support)
- `src/app/api/tags/[id]/`: Individual tag operations (with color support)
- `src/app/api/tags/[id]/recipes/`: Tag-recipe relationships
- `src/app/api/ingredient-categories/`: Category management (with color support)
- `src/app/api/ingredient-categories/[id]/`: Individual category operations
- `src/app/api/ingredient-categories/learn/`: ML category suggestions
- `src/app/api/notes/`: Notes CRUD operations (with PIN support)
- `src/app/api/notes/[id]/`: Individual note operations
- `src/app/api/notes/[id]/unlock/`: PIN verification and unlock session
- `src/app/api/documents/[id]/unlock/`: Document PIN verification
- `src/app/api/contacts/[id]/unlock/`: Contact PIN verification
- `src/app/api/audit-log/backup/`: Audit log backup and truncation
- `src/app/api/ai/command/route.ts`: Multi-provider function-calling command interpreter
- `src/app/api/settings/ai/route.ts`: GET/PUT user AI settings
- `src/app/api/chores/schedule/route.ts`: Chore schedule endpoint for dashboard
- `src/app/api/dashboard/route.ts`: Dashboard data with rolling forward window

#### Dashboard Components
- `src/components/dashboard/ChoreScheduleCard.tsx`: Rolling chore schedule card with scope toggle
- `src/components/dashboard/WeeklySummaryCard.tsx`: Rolling 7-day summary with dynamic label
- `src/components/dashboard/TodoCard.tsx`: My Tasks / Family Tasks counts
- `src/components/dashboard/DashboardGrid.tsx`: Orchestrates all dashboard cards

#### Chore Components
- `src/app/(app)/chores/ChoreDialog.tsx`: Modal editor with note textarea field
- `src/app/(app)/chores/ChoresClient.tsx`: Compact single-row layout with completion feedback

#### List Components
- `src/components/lists/TodoList.tsx`: Filter buttons (All/My Tasks/Due today/Overdue)
- `src/components/lists/ListItemRow.tsx`: Assignee badge/dropdown
- `src/lib/list-helpers.ts`: TodoFilter type and filterTodoItems function

### Usage Instructions

#### Dashboard Rolling Forward
1. Home screen displays all panels starting from today's date
2. **Chore Schedule** card shows rolling 7/14/30 days with scope toggle
3. **Weekly Summary** shows "Next 7 Days — {date range}" label
4. **Todo** shows My Tasks (User icon) vs Family Tasks (Users icon) counts

#### Meal Planner Scope
1. Navigate to Meal Plan from sidebar
2. Use the Week/14d/30d toggle to change scope
3. Current day is at the top with next days underneath
4. Navigation arrows always advance by 7 days

#### Todo Assignment
1. Create a todo item in any todo list
2. Click the assignee dropdown on the right side of any item
3. Select a family member to assign the task
4. Use filters: All / My Tasks / Due today / Overdue

#### Chore Notes
1. Create or edit a chore
2. The ChoreDialog now has a "Notes" textarea field
3. Notes appear in the Chore Schedule dashboard card

### Deployment & Development

#### Prerequisites
- Node.js 18+ 
- SQLite database
- npm or yarn package manager
- Docker (for NAS deployment)

#### Setup Instructions
1. Clone repository: `git clone <repo-url>`
2. Install dependencies: `npm install`
3. Set up environment variables: `cp env.local.example .env.local`
4. Initialize database: `npx prisma db push`
5. Run development server: `npm run dev`
6. Access application at `http://localhost:3300`

#### Database Operations
- Generate Prisma client: `npx prisma generate`
- Create migrations: `npx prisma migrate dev`
- Reset database: `npx prisma db push --force-reset`
- View data: `npx prisma studio`

#### Building for Production
1. Build application: `npm run build`
2. Start production server: `npm start`
3. Docker deployment: `docker compose up -d --build` — migrations run at container startup via entrypoint.sh

### Known Limitations & Future Improvements

#### Current Limitations
- Google Calendar sync requires manual OAuth configuration
- Umami import requires specific archive format
- Some routes use dynamic server rendering (headers)
- Mobile responsiveness could be improved in some views

#### Planned Enhancements
1. **Mobile App**: React Native companion application
2. **Real-time Collaboration**: Live updates for shared lists
3. **Recipe Scaling**: Adjust recipe quantities for different serving sizes
4. **Nutrition Tracking**: Integrate nutrition data for recipes
5. **Budget Tracking**: Connect shopping lists with expense tracking
6. **AI — Extended Actions**: Calendar event creation, chore completion, and read-only queries via the AI assistant
7. **AI — Note Templates**: Pre-built note templates the AI can populate by dictation
8. **AI — Recipe Cross-links in Notes**: Type `[[` in the note editor to link to a recipe

### Commit History Summary
- **Phase 7 Commit**: Complete implementation of tags, categories, notes, and UI enhancements
- **Recurring Events Fix**: Fixed recurring event expansion in calendar views, edit/delete for recurring instances, and seriesId preservation
- **AI Auto-Refresh Fix**: Cross-component event bus for AI assistant UI refresh; fixed ambiguous recipe matching
- **UI Overhaul**: Premium glassmorphism themes, colored tags, notes Family/Private/Secure tabs, PIN protection, lock status indicators
- **Dashboard Rolling Forward**: Home screen and meal planner display from today going forward (rolling 7-day window). New Chore Schedule dashboard panel with scope toggle (7/14/30 days). Chore note field. Todo per-user assignment with My Tasks / Family Tasks filtering. Build verified with zero TypeScript errors.
- **Previous Phases**: Recipe images, deployment scripts, bug fixes, and core feature development

### Project Status
✅ **Phase 7 Complete**: All features implemented and tested
✅ **Phase 8 Complete**: AI Voice & Chat Assistant with multi-provider support (Gemini + DeepSeek)
✅ **Recurring Events**: Create, edit, delete recurring events with daily/weekly/monthly/yearly options
✅ **Apple Themes**: 5 additive Apple-system themes added (aqua, graphite, sunset, midnight, forest)
✅ **Dashboard Rolling Forward**: Home dashboard and meal planner show rolling 7 days from today, chore schedule card, chore note field, per-user todo assignment, scope selectors (7/14/30 days)
✅ **TypeScript Validation**: No type errors
✅ **Build Success**: Production build compiles successfully
✅ **Git Status**: All changes committed with descriptive messages