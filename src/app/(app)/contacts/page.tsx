import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ContactsClient } from './ContactsClient'

export default async function ContactsPage() {
  const user = await requireSession()

  const contacts = await prisma.householdContact.findMany({
    where: { familyId: user.familyId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 pb-0 shrink-0">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="text-muted-foreground mt-1">Family address book for doctors, schools, tradespeople, and more.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        <ContactsClient
          initialContacts={contacts.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  )
}
