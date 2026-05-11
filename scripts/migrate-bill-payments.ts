import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? 'file:./homebase.db';
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });
}

const prisma = createPrismaClient();

/**
 * Data migration: Backfill FinanceBillPayment records for existing paid bills.
 *
 * For existing bills where `paid = true`:
 * 1. If a `paymentTxId` exists → create a FinanceBillPayment linked to that transaction
 * 2. If NO `paymentTxId` exists → create a FinanceBillPayment without a transaction link
 *
 * Bills that already have FinanceBillPayment records are skipped.
 */
async function migrateBillPayments() {
  console.log('Starting bill payment migration...');

  try {
    // Get all paid bills that do NOT already have payment records
    const bills = await prisma.financeRecurringBill.findMany({
      where: {
        paid: true,
        payments: { none: {} }, // No existing FinanceBillPayment records
      },
      select: {
        id: true,
        name: true,
        amount: true,
        paidDate: true,
        paymentTxId: true,
        invoiceTxId: true,
        transactionId: true,
        familyId: true,
      },
    });

    console.log(`Found ${bills.length} paid bills to migrate.`);

    let created = 0;
    let skipped = 0;

    for (const bill of bills) {
      if (!bill.paidDate) {
        console.log(`  SKIP ${bill.name} (${bill.id}): paid=true but no paidDate`);
        skipped++;
        continue;
      }

      // Determine which transaction to link (prefer paymentTxId, then invoiceTxId, then transactionId)
      const txId = bill.paymentTxId ?? bill.invoiceTxId ?? bill.transactionId ?? null;

      // Find the user who last modified this bill (fallback to 'system')
      const createdBy = 'system';

      await prisma.financeBillPayment.create({
        data: {
          billId: bill.id,
          amount: bill.amount,
          paymentDate: bill.paidDate,
          transactionId: txId,
          createdBy,
          familyId: bill.familyId,
          notes: txId
            ? 'Migrated from legacy payment (with transaction link)'
            : 'Migrated from legacy payment (no transaction link)',
        },
      });

      created++;
      if (created % 10 === 0) {
        console.log(`  Progress: ${created} records created...`);
      }
    }

    console.log(`\nMigration complete:`);
    console.log(`  Created: ${created} FinanceBillPayment records`);
    console.log(`  Skipped: ${skipped} bills (no paidDate)`);

    // Verify the migration
    const totalPayments = await prisma.financeBillPayment.count();
    console.log(`  Total FinanceBillPayment records now: ${totalPayments}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateBillPayments();
