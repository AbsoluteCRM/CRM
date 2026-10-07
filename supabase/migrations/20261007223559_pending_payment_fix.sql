-- A pending payment (for example slow ACH) can still settle after its invoice
-- is voided: voiding only requires amount_paid_cents = 0, which ignores
-- pending rows. Let a pending payment move on; settled payments stay frozen.
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
    if st = 'void' then
      raise exception 'this invoice is void; its payments can''t change' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
