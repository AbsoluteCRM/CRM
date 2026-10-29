-- Rename the pricing unit displayed as "per job". Enum values retain their
-- identity, so existing services (including archived ones) and the column
-- default become monthly without rewriting rows or changing prices.
alter type public.service_unit rename value 'each' to 'monthly';
