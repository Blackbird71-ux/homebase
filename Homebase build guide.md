# Project Spec: Homebase (Family Calendar, Lists, & Recipes)

## 1. Vision & Architecture
Homebase is a shared family management platform designed for privacy and high utility. It follows a **"Settings-First"** architecture where all user preferences and UI behaviors are stored in a SQLite database rather than hardcoded.

### Core Principles
- **Family Scoped**: All data (Calendar, Lists, Recipes) is linked to a `FamilyID`.
- **Local-First Auth**: Uses Email/Password login (no OAuth) to simplify development and private hosting.
- **Standalone Deployment**: Target a Dockerized Next.js standalone build.

## 2. Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Runtime**: Node.js 20+ (Optimized for Node 22)
- **Database**: SQLite with Prisma ORM
- **Auth**: NextAuth.js (v5) using `CredentialsProvider`
- **Styling**: Tailwind CSS, Lucide React Icons, Shadcn UI
- **Key Deps**: `better-sqlite3`, `date-fns`, `cheerio` (for recipe scraping)

## 3. Database Schema (Prisma)
The schema must support multi-user collaboration within a single "Family" unit.

```prisma
model Family {
  id        String    @id @default(cuid())
  name      String
  users     User[]
  lists     List[]
  recipes   Recipe[]
  events    Event[]
  mealPlans MealPlan[]
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  password      String   // Hashed via bcrypt
  name          String
  familyId      String
  family        Family   @relation(fields: [familyId], references: [id])
  
  // Settings-First Architecture (Stored as columns or JSON)
  theme         String   @default("modern") // light, dark, sepia
  fontSize      String   @default("base")
  weekStartsOn  Int      @default(0) // 0 for Sunday
  doneItemColor String   @default("RED")
  uiPreferences Json?    // JSON object: customTheme, defaultListId, etc.

}

model Event {
  id          String   @id @default(cuid())
  title       String
  description String?
  start       DateTime
  end         DateTime
  isAllDay    Boolean  @default(false)
  category    String?  // e.g., "Medical", "School", "Social"
  familyId    String
  family      Family   @relation(fields: [familyId], references: [id])
}

model Recipe {
  id           String     @id @default(cuid())
  title        String
  ingredients  Json       // Array of strings or objects
  instructions Json       // Array of steps
  image        String?
  sourceUrl    String?
  tags         String[]
  familyId     String
  family       Family     @relation(fields: [familyId], references: [id])
  mealPlans    MealPlan[]
}

model List {
  id        String     @id @default(cuid())
  name      String
  type      String     // "SHOPPING" or "TODO"
  items     ListItem[]
  familyId  String
  family    Family     @relation(fields: [familyId], references: [id])
}

model ListItem {
  id          String   @id @default(cuid())
  content     String
  isCompleted Boolean  @default(false)
  category    String?  // e.g., "Dairy", "Produce"
  listId      String
  list        List     @relation(fields: [listId], references: [id])
}

model MealPlan {
  id        String   @id @default(cuid())
  date      DateTime
  recipeId  String
  recipe    Recipe   @relation(fields: [recipeId], references: [id])
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
}