-- Wipe all test financial transaction data.
-- The account ledger and trial-balance general-ledger now read exclusively
-- from the GL (FinanceJournalLine/FinanceJournalEntry). FinanceTransaction is
-- retained as a read cache for the transactions page and tax report only.
-- All data in these tables is test-only; no real transactions have been recorded.
DELETE FROM "FinanceBillPayment";
DELETE FROM "FinanceJournalLine";
DELETE FROM "FinanceJournalEntry";
DELETE FROM "FinanceTransaction";
-- Clear FK links on bills and income entries that pointed to the deleted rows
UPDATE "FinanceRecurringBill" SET
  "journalEntryId" = NULL,
  "transactionId" = NULL,
  "invoiceTxId" = NULL,
  "paymentTxId" = NULL,
  "invoiceReceived" = 0,
  "invoiceReceivedDate" = NULL,
  "paid" = 0,
  "paidDate" = NULL;
UPDATE "FinanceIncomeEntry" SET
  "journalEntryId" = NULL,
  "transactionId" = NULL,
  "received" = 0,
  "receivedDate" = NULL,
  "invoiceReceived" = 0,
  "invoiceReceivedDate" = NULL;
