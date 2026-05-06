# HomeBase - Family Management Application

## Overview
HomeBase is a comprehensive family management application designed to help families organize their daily lives. The application includes meal planning, shopping lists, recipe management, calendar integration, and notes functionality.

## 🚀 **Recent Major Enhancements**

### **Version 2.1 Feature Highlights**

#### 1. **AI Voice & Chat Assistant**
- Natural language commands via voice (microphone) or text from any page
- Powered by Google Gemini — bring your own API key (free tier available)
- **19 actions** across meal plan, shopping list, to-do, calendar, chores, notes, recipes, contacts, documents, and birthdays
- Works as a PWA on Windows, Android, and iOS (iOS 14.5+)
- Configure at Settings → AI; floating Bot button available on every page
- Example commands: "Add pasta bake to Monday dinner", "What chores are overdue?", "What do I need for lasagne?", "Any documents expiring soon?", "Mark milk as bought"

### **Version 2.0 Feature Highlights**

#### 1. **Shopping List Color Customization**
- Customize the color of completed shopping list items
- Default color: RED
- Real-time color application

#### 2. **Enhanced Meal Planner**
- Support for multiple meals per day (breakfast, lunch, dinner, snacks)
- Daily meal columns showing all meal types
- Export multiple meals to shopping list
- Visual meal type indicators

#### 3. **Advanced Theming System**
- Customizable colors for sidebar, calendar, cards, and text
- 10 preset themes including 3 new modern themes
- Live preview of theme changes
- Color picker interface

#### 4. **Integrated Notes System**
- Family-shared notes with rich text editing
- Categorization and tagging
- Search and filtering capabilities
- Full CRUD operations

## 📋 **Core Features**

### **Meal Planning**
- Weekly meal planning grid
- Multiple meals per day support
- Recipe assignment
- Grocery list generation

### **Shopping Lists**
- Collaborative shopping lists
- Category grouping
- Color-coded completed items
- Due dates and priorities

### **Recipe Management**
- Recipe collection with photos
- Tagging and categorization
- Import from URLs
- Family recipe books

### **Calendar Integration**
- Family calendar view
- Google Calendar sync
- Event management
- Meal plan integration

### **Notes System**
- Rich text editing
- Category organization
- Family collaboration
- Search functionality

### **AI Assistant**
- Voice and text command interface
- Google Gemini function calling backend
- 19 actions: meal plan, shopping & to-do lists, calendar, chores, notes, recipes, contacts, documents, birthdays
- PWA-compatible across all platforms

## 🛠️ **Technical Stack**

### **Frontend**
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom component library
- **State Management**: React hooks and context

### **Backend**
- **Runtime**: Node.js
- **Database**: SQLite with Prisma ORM
- **Authentication**: NextAuth.js
- **API**: RESTful API routes

### **Development Tools**
- **Package Manager**: npm
- **Type Checking**: TypeScript
- **Code Formatting**: ESLint
- **Containerization**: Docker

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+ 
- npm or yarn
- Git

### **Installation**
```bash
# Clone the repository
git clone <repository-url>

# Navigate to project directory
cd homebase

# Install dependencies
npm install

# Set up environment variables
cp env.local.example .env.local

# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Start development server
npm run dev
```

### **Development**
```bash
# Run development server
npm run dev

# Run TypeScript check
npx tsc --noEmit

# Run production build
npm run build

# Start production server
npm start
```

## 📁 **Project Structure**

```
homebase/
├── src/
│   ├── app/                    # Next.js app router pages
│   │   ├── (app)/             # Authenticated app pages
│   │   │   ├── calendar/      # Calendar functionality
│   │   │   ├── home/          # Dashboard
│   │   │   ├── lists/         # Shopping/todo lists
│   │   │   ├── meal-plan/     # Meal planning
│   │   │   ├── notes/         # Notes system (NEW)
│   │   │   ├── recipes/       # Recipe management
│   │   │   └── settings/      # User settings
│   │   ├── api/               # API routes
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── calendar/          # Calendar components
│   │   ├── layout/            # Layout components
│   │   ├── lists/             # List components
│   │   ├── meal-plan/         # Meal plan components
│   │   ├── notes/             # Notes components (NEW)
│   │   ├── providers/         # Context providers
│   │   ├── settings/          # Settings components
│   │   └── ui/                # UI component library
│   ├── lib/                   # Utility libraries
│   └── types/                 # TypeScript definitions
├── prisma/                    # Database schema and migrations
├── scripts/                   # Utility scripts
├── docs/                      # Documentation
├── public/                    # Static assets
└── package.json              # Dependencies
```

## 🔧 **Configuration**

### **Environment Variables**
Create a `.env.local` file with:
```env
# Database
DATABASE_URL="file:./data/dev.db"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# Google OAuth (optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

### **Database Setup**
```bash
# Run initial migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Seed database (optional)
npx prisma db seed
```

## 📖 **Documentation**

### **Detailed Documentation**
- **[Design Spec](docs/superpowers/specs/2026-04-16-homebase-design.md)** - Architecture and design specification
- **[Phase 1 Plan](docs/superpowers/plans/2026-04-16-homebase-phase1.md)** - Core implementation plan
- **[Phase 2 Plan](docs/superpowers/plans/2026-04-16-homebase-phase2.md)** - Content modules implementation plan
- **[Phase 3 Plan](docs/superpowers/plans/2026-04-16-homebase-phase3.md)** - Polish and settings implementation plan
- **[Deployment Guide](DEPLOY.md)** - Deployment reference for NAS and Cloudflare tunnel
- **[Build Guide](Homebase%20build%20guide.md)** - Project specification and build instructions

### **Feature Guides**
- [Meal Planning](src/app/(app)/meal-plan/) - Meal planner module
- [Shopping Lists](src/app/(app)/lists/) - Shopping and todo lists
- [Recipe Management](src/app/(app)/recipes/) - Recipe management
- [Notes System](src/app/(app)/notes/) - Family notes
- [Settings](src/app/(app)/settings/) - Application settings and configuration

## 🤝 **Contributing**

### **Development Workflow**
1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

### **Code Standards**
- Follow TypeScript best practices
- Use Tailwind CSS for styling
- Write descriptive commit messages
- Include appropriate tests

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 **Support**

### **Issues**
Report issues on the [GitHub Issues](https://github.com/your-username/homebase/issues) page.

### **Questions**
For questions about usage or development, please check the documentation first or open a discussion.

## 🎉 **Acknowledgments**

- Built with Next.js and React
- Uses Prisma for database management
- Inspired by family organization needs
- Community contributions welcome

---

**Last Updated**: May 6, 2026  
**Version**: 2.1.0  
**Status**: ✅ **Production Ready**
