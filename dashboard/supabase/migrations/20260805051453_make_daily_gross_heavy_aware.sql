-- The legacy daily_gross column was generated as parcels * rate. Convert it
-- to a stored value so the Phase 2 parcel trigger can include heavy earnings.
-- PostgreSQL preserves every existing generated value when the expression is
-- dropped; existing rows all have heavy_parcels = 0 and are not recalculated.
alter table public.parcel_logs
  alter column daily_gross drop expression;

comment on column public.parcel_logs.daily_gross is
  'Stored gross delivery pay maintained by apply_parcel_rate_configuration; standard earnings plus heavy earnings.';
