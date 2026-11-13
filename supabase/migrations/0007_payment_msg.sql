-- The payment confirmation message a customer pasted (instead of / as well as typing the transaction ID).
-- payment_ref stays the transaction ID (typed, or extracted from the message).
alter table orders add column payment_msg text;
