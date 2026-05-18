export interface DefaultBudgetItem {
  type: 'income' | 'expense'
  category: string
  subcategory: string
  amount: number
  frequency: string
  sortOrder: number
}

export const DEFAULT_INCOME_ITEMS: DefaultBudgetItem[] = [
  { type: 'income', category: 'Income', subcategory: 'Salary/Wages', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'income', category: 'Income', subcategory: 'Freelance/Contract', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'income', category: 'Income', subcategory: 'Investment Income', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'income', category: 'Income', subcategory: 'Government Benefits', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'income', category: 'Income', subcategory: 'Other Income', amount: 0, frequency: 'monthly', sortOrder: 4 },
]

export const DEFAULT_EXPENSE_ITEMS: DefaultBudgetItem[] = [
  // Home & Utilities
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Rent/Mortgage', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Electricity', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Gas', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Water', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Internet', amount: 0, frequency: 'monthly', sortOrder: 4 },
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Phone', amount: 0, frequency: 'monthly', sortOrder: 5 },
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Council Rates', amount: 0, frequency: 'monthly', sortOrder: 6 },
  { type: 'expense', category: 'Home & Utilities', subcategory: 'Home Insurance', amount: 0, frequency: 'monthly', sortOrder: 7 },

  // Insurance & Financial
  { type: 'expense', category: 'Insurance & Financial', subcategory: 'Health Insurance', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Insurance & Financial', subcategory: 'Life Insurance', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Insurance & Financial', subcategory: 'Car Insurance', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Insurance & Financial', subcategory: 'Loan Repayments', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'expense', category: 'Insurance & Financial', subcategory: 'Credit Card Payments', amount: 0, frequency: 'monthly', sortOrder: 4 },

  // Groceries
  { type: 'expense', category: 'Groceries', subcategory: 'Supermarket', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Groceries', subcategory: 'Fruit & Vegetables', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Groceries', subcategory: 'Meat & Seafood', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Groceries', subcategory: 'Pantry Items', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'expense', category: 'Groceries', subcategory: 'Household Supplies', amount: 0, frequency: 'monthly', sortOrder: 4 },

  // Transport & Auto
  { type: 'expense', category: 'Transport & Auto', subcategory: 'Fuel', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Transport & Auto', subcategory: 'Public Transport', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Transport & Auto', subcategory: 'Car Registration', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Transport & Auto', subcategory: 'Car Servicing', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'expense', category: 'Transport & Auto', subcategory: 'Parking/Tolls', amount: 0, frequency: 'monthly', sortOrder: 4 },

  // Entertainment
  { type: 'expense', category: 'Entertainment', subcategory: 'Dining Out', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Entertainment', subcategory: 'Takeaway', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Entertainment', subcategory: 'Movies/Events', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Entertainment', subcategory: 'Streaming Services', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'expense', category: 'Entertainment', subcategory: 'Hobbies', amount: 0, frequency: 'monthly', sortOrder: 4 },

  // Personal & Medical
  { type: 'expense', category: 'Personal & Medical', subcategory: 'Gym Membership', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Personal & Medical', subcategory: 'Hair/Beauty', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Personal & Medical', subcategory: 'Doctor Visits', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Personal & Medical', subcategory: 'Dental', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'expense', category: 'Personal & Medical', subcategory: 'Medications', amount: 0, frequency: 'monthly', sortOrder: 4 },
  { type: 'expense', category: 'Personal & Medical', subcategory: 'Clothing', amount: 0, frequency: 'monthly', sortOrder: 5 },

  // Children
  { type: 'expense', category: 'Children', subcategory: 'Childcare', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Children', subcategory: 'School Fees', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Children', subcategory: 'School Supplies', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Children', subcategory: 'Extracurricular Activities', amount: 0, frequency: 'monthly', sortOrder: 3 },
  { type: 'expense', category: 'Children', subcategory: 'Pocket Money', amount: 0, frequency: 'monthly', sortOrder: 4 },

  // Pets
  { type: 'expense', category: 'Pets', subcategory: 'Pet Food', amount: 0, frequency: 'monthly', sortOrder: 0 },
  { type: 'expense', category: 'Pets', subcategory: 'Vet Bills', amount: 0, frequency: 'monthly', sortOrder: 1 },
  { type: 'expense', category: 'Pets', subcategory: 'Pet Insurance', amount: 0, frequency: 'monthly', sortOrder: 2 },
  { type: 'expense', category: 'Pets', subcategory: 'Grooming', amount: 0, frequency: 'monthly', sortOrder: 3 },
]

export const DEFAULT_ITEMS: DefaultBudgetItem[] = [
  ...DEFAULT_INCOME_ITEMS,
  ...DEFAULT_EXPENSE_ITEMS,
]
