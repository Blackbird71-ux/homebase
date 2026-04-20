# HomeBase - Family Management Application

## Overview
HomeBase is a comprehensive family management application designed to help families organize their daily lives. The application includes meal planning, shopping lists, recipe management, calendar integration, and notes functionality.

## 🚀 **Recent Major Enhancements**

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
- **[Project Summary](docs/PROJECT_SUMMARY.md)** - Comprehensive implementation details
- **[API Documentation](docs/API.md)** - API endpoint reference
- **[User Guide](docs/USER_GUIDE.md)** - Application usage instructions
- **[Development Guide](docs/DEVELOPMENT.md)** - Development setup and guidelines

### **Feature Guides**
- [Meal Planning Guide](docs/MEAL_PLANNING.md)
- [Shopping List Guide](docs/SHOPPING_LIST.md)
- [Recipe Management Guide](docs/RECIPES.md)
- [Notes System Guide](docs/NOTES.md)
- [Theming Guide](docs/THEMING.md)

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

**Last Updated**: April 20, 2026  
**Version**: 2.0.0  
**Status**: ✅ **Production Ready**
