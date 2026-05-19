import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ContactsClient } from './ContactsClient'
import { PageHero } from '@/components/shared/PageHero'

export default async function ContactsPage() {
  const user = await requireSession()

  const contacts = await prisma.householdContact.findMany({
    where: { familyId: user.familyId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHero title="Contacts" subtitle="Family address book for doctors, schools, tradespeople, and more." />
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        <ContactsClient
          initialContacts={contacts.map((c) => ({
            ...c,
            pinHash: c.pinHash,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  )
}
