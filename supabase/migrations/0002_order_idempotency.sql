-- Idempotency key sent by the order form, so an automatic client retry after a network failure
-- can never create a duplicate order. NULL for orders created before this migration / by other paths.
alter table orders add column idempotency_key uuid unique;
