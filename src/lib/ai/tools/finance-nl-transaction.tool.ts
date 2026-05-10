// src/lib/ai/tools/finance-nl-transaction.tool.ts
// AI tool for natural language transaction entry.
// The AI parses user speech like "spent $45 at Coles on groceries today"
// and calls quickAddTransaction which resolves names and creates the record.
// Provides: quickAddTransaction

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function financeNLContextProvider(familyId: string, _userId: string): Promise<string> {
  const [accounts, categories, vendors] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { familyId, isActive: true },
      select: { name: true, type: true, id: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financeCategory.findMany({
      where: { familyId, level: 0 },
      select: { name: true, type: true, id: true, children: { select: { name: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financeVendor.findMany({
      where: { familyId },
      select: { name: true, id: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const parts: string[] = []

  if (accounts.length > 0) {
    const lines = accounts.map(a => `  • ${a.name} (${a.type})`)
    parts.push(`**Accounts:**\n${lines.join('\n')}`)
  }

  if (categories.length > 0) {
    const lines = categories.map(c => {
      const kids = c.children.length > 0 ? ` [sub: ${c.children.map(k => k.name).join(', ')}]` : ''
      return `  • ${c.name} (${c.type})${kids}`
    })
    parts.push(`**Categories:**\n${lines.join('\n')}`)
  }

  if (vendors.length > 0) {
    const lines = vendors.map(v => `  • ${v.name}`)
    parts.push(`**Vendors/Payees:**\n${lines.join('\n')}`)
  }

  if (parts.length === 0) {
    return 'No finance accounts, categories, or vendors configured yet.'
  }

  return parts.join('\n\n')
}

// ── quickAddTransaction ────────────────────────────────────────────────────────

const quickAddTxDefinition: FunctionDeclaration = {
  name: 'quickAddTransaction',
  description: 'Create a finance transaction from natural language. Parses user speech like "spent $45 at Coles on groceries today" into structured data and creates the record. The AI should extract the best-matching account, category, and vendor from context.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      description: { type: SchemaType.STRING, description: 'Brief description/payee of the transaction (e.g. "Coles", "Electricity bill", "Freelance payment").' },
      amount: { type: SchemaType.NUMBER, description: 'Amount as a positive number (e.g. 45.00, 1234.56).' },
      type: { type: SchemaType.STRING, description: 'Transaction type: "expense" (money out) or "income" (money in). Default: "expense".' },
      accountName: { type: SchemaType.STRING, description: 'Name of the account to assign. Must match one from the available accounts list. Omit to leave unassigned.' },
      categoryName: { type: SchemaType.STRING, description: 'Name of the category. For expense: e.g. "Groceries", "Utilities". For income: e.g. "Salary". Can be a sub-category name too. Omit to leave unassigned.' },
      vendorName: { type: SchemaType.STRING, description: 'Optional vendor/payee name (e.g. "Coles", "AGL", "Client Name"). Omit to leave unassigned.' },
      date: { type: SchemaType.STRING, description: 'Date in YYYY-MM-DD format. Defaults to today if omitted.' },
      notes: { type: SchemaType.STRING, description: 'Optional additional notes or reference for this transaction.' },
    },
    required: ['description', 'amount'],
  },
}

async function quickAddTxHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const {
    description,
    amount,
    type,
    accountName,
    categoryName,
    vendorName,
    date,
    notes,
  } = args as {
    description: string
    amount: number
    type?: string
    accountName?: string
    categoryName?: string
    vendorName?: string
    date?: string
    notes?: string
  }

  const txType = type === 'income' ? 'income' : 'expense'

  // Build the transaction data
  const data: Record<string, unknown> = {
    description,
    amount: Math.abs(amount),
    type: txType,
    date: date ? new Date(date + 'T00:00:00Z') : new Date(),
    isCleared: true,
    createdBy: ctx.user.id,
    familyId: ctx.familyId,
  }

  const lookups: string[] = []

  // Resolve account name
  if (accountName) {
    const accounts = await prisma.financeAccount.findMany({
      where: { familyId: ctx.familyId, isActive: true },
      select: { id: true, name: true },
    })
    const lower = accountName.toLowerCase()
    let match = accounts.find(a => a.name.toLowerCase().includes(lower))
    if (!match) {
      match = accounts.find(a => lower.includes(a.name.toLowerCase()))
    }
    if (match) {
      data.accountId = match.id
      lookups.push(`account: "${match.name}"`)
    } else {
      lookups.push(`account: "${accountName}" (not found)`)
    }
  }

  // Resolve category name
  if (categoryName) {
    const categories = await prisma.financeCategory.findMany({
      where: { familyId: ctx.familyId },
      select: { id: true, name: true, parentId: true },
    })
    const lower = categoryName.toLowerCase()
    let match = categories.find(c => c.name.toLowerCase().includes(lower))
    if (!match) {
      match = categories.find(c => lower.includes(c.name.toLowerCase()))
    }
    if (match) {
      data.categoryId = match.id
      lookups.push(`category: "${match.name}"`)
    } else {
      lookups.push(`category: "${categoryName}" (not found)`)
    }
  }

  // Resolve vendor name
  if (vendorName) {
    const vendors = await prisma.financeVendor.findMany({
      where: { familyId: ctx.familyId },
      select: { id: true, name: true },
    })
    const lower = vendorName.toLowerCase()
    let match = vendors.find(v => v.name.toLowerCase().includes(lower))
    if (!match) {
      match = vendors.find(v => lower.includes(v.name.toLowerCase()))
    }
    if (match) {
      data.vendorId = match.id
      lookups.push(`vendor: "${match.name}"`)
    } else {
      lookups.push(`vendor: "${vendorName}" (not found)`)
    }
  }

  // Create the transaction
  const tx = await prisma.financeTransaction.create({
    data: data as {
      description: string
      amount: number
      type: string
      date: Date
      isCleared: boolean
      createdBy: string
      familyId: string
      accountId?: string
      categoryId?: string
      vendorId?: string
      notes?: string
    },
  })

  const lookupInfo = lookups.length > 0 ? `\nResolved: ${lookups.join(', ')}` : ''
  const direction = txType === 'expense' ? '💰 Spent' : '📥 Received'
  const formattedDate = tx.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

  return {
    message: `${direction} $${tx.amount.toFixed(2)} — ${tx.description} (${formattedDate})${lookupInfo}`,
    action: 'quickAddTransaction',
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerFinanceNLTransactionTools(): void {
  registerTool('quickAddTransaction', {
    definition: quickAddTxDefinition,
    contextProvider: financeNLContextProvider,
    handler: quickAddTxHandler,
    actionEvents: { quickAddTransaction: 'app:financeUpdated' },
  })
}
