# Homebase — Bills & Income How-To Guide

## Bills (money going out)

Bills follow a two-step process that mirrors how accounting works: first you acknowledge the invoice exists, then you record that you've paid it.

---

### Step 1 — Create the bill

Open **Bills & Recurring** and click **Add Bill**. Fill in the required fields:

| Field | What to enter |
|---|---|
| **Recurring / One-off** | Choose One-off for a single payment (e.g. a tax bill); Recurring for regular bills (e.g. electricity) |
| **Name** | A clear label — e.g. "ATO — Mark" |
| **Amount** | The invoice amount |
| **Category** | Select the expense category this belongs to (e.g. Taxes — Mark). This is what drives your P&L report |
| **Account** | The bank account the payment will come from. Required for the balance sheet to show cash leaving the right account |
| **Due Date** | When the bill is due |
| **Entity / Fund** | Select the correct entity (e.g. Personal / Family). Required for per-entity reporting |
| **Financial Contact** | Optional but useful for filtering |
| **Tax Classification** | Set to Tax Payment (PAYG) for ATO bills, Tax Deduction for deductible expenses, or leave as Not Classified |

Click **Create**.

---

### Step 2 — Mark the invoice received

When the invoice or statement arrives in your inbox, tick **Invoice received** on the bill row (the receipt icon), or tick it inside the editor before saving.

> **What this does:** The expense immediately appears on your P&L and the amount shows under **Accounts Payable** on the Balance Sheet. You now have a record of what you owe, even though you haven't paid yet.

If you're creating the bill and the invoice is already in hand, tick **Invoice received** and set the **Invoice date** before clicking Create — it's in the same editor screen shown above.

---

### Step 3 — Mark as paid

When you make the payment, click the **green tick** on the bill row and confirm the payment date.

> **What this does:** The expense clears from Accounts Payable, the bank account balance decreases, and the transaction is marked as reconciled on the payment date.

---

### Skipping straight to paid

If you don't need to track the invoice separately (e.g. for a direct debit you know has gone out), you can click the green tick without ticking Invoice received first. The expense and payment are recorded in one step.

---

---

## Income (money coming in)

Income works the same way in reverse. First you acknowledge that money is owed to you, then you record that it has arrived.

---

### Step 1 — Create the income entry

Open **Income** and click **Add Income**. Fill in the required fields:

| Field | What to enter |
|---|---|
| **Recurring / One-off** | One-off for a single payment; Recurring for salary, rent, etc. |
| **Name** | A clear label — e.g. "Salary — Mark May 2026" |
| **Amount** | The amount expected |
| **Category** | The income category (e.g. Salary, Rental Income). Drives your P&L |
| **Account** | The bank account the money will land in |
| **Expected Date** | When you expect to receive it |
| **Entity / Fund** | The correct entity for reporting |
| **Tax Tracked** | Tick this for assessable income (salary, business income). Set the estimated tax rate if known |

Click **Create**.

---

### Step 2 — Mark remittance received

When you receive the remittance advice, payslip, or confirmation that money is on its way, tick **Invoice received** on the income row.

> **What this does:** The income immediately appears on your P&L and the amount shows under **Accounts Receivable** on the Balance Sheet. You have a record of money owed to you before it hits the bank.

---

### Step 3 — Mark as received

When the money actually arrives in your bank account, click the **green tick** on the income row and confirm the received date.

> **What this does:** The income clears from Accounts Receivable and the bank account balance increases. The transaction is marked as reconciled.

---

### Skipping straight to received

For direct deposits or salary payments where you don't track the remittance separately, click the green tick without ticking remittance first. Income and receipt are recorded in one step.

---

---

## What updates automatically

| Action | P&L | Accounts Payable | Accounts Receivable | Bank Balance |
|---|---|---|---|---|
| Bill created (draft) | No change | No change | — | No change |
| Invoice received ticked | Expense appears | Amount added | — | No change |
| Bill marked paid | No change | Amount removed | — | Decreases |
| Income created (draft) | No change | — | No change | No change |
| Remittance received ticked | Income appears | — | Amount added | No change |
| Income marked received | No change | — | Amount removed | Increases |

---

## Tips

- **Always select Account** when creating a bill or income entry. Without it the bank account balance on the Balance Sheet won't move when you mark things paid or received.
- **Always select Category**. Without a category, the transaction is unclassified and won't appear in P&L category breakdowns or tax reports.
- **Always select Entity / Fund**. This is required for the per-entity filters on P&L, Tax Report, and Balance Sheet to work correctly.
- The **Balance Sheet** is a live view — check it any time to see your current Accounts Payable (what you owe) and Accounts Receivable (what you're owed).
