-- A pending payment can settle after its invoice is voided; the contractor
-- must then be able to refund it. On a void invoice, allow a settled payment
-- to move only toward refunded (same amount, refunded_cents not lowered).
create or replace function private.guard_payment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.invoice_status;
begin
  if old.status <> 'pending'
     and (new.amount_cents, new.status, new.refunded_cents)
       is distinct from (old.amount_cents, old.status, old.refunded_cents) then
    select status into st from public.invoices
    where organization_id = old.organization_id and id = old.invoice_id
    for no key update;
    if st = 'void'
       and not (old.status in ('succeeded', 'partially_refunded')
                and new.status in ('partially_refunded', 'refunded')
                and new.amount_cents = old.amount_cents
                and new.refunded_cents >= old.refunded_cents) then
      raise exception 'this invoice is void; its payments can only be refunded' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
