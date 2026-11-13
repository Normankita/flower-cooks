-- Account name shown to customers next to the Lipa Namba (it is what they see on their payment confirmation screen).
-- Copied to the next cycle like lipa_namba.
alter table cycles add column lipa_name text;
