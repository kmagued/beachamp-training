-- Add payment status tracking to expenses
ALTER TABLE expenses
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid_full'
    CHECK (payment_status IN ('paid_full', 'partially_paid', 'payment_due')),
  ADD COLUMN paid_amount NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN due_date DATE DEFAULT NULL;
