-- 1) duração por template (30/180 etc)
alter table public.campaign_templates
add column if not exists campaign_days int not null default 30;

-- 2) regras de repetição por tarefa
alter table public.campaign_template_tasks
add column if not exists repeat_days int[] null,
add column if not exists repeat_every int null,
add column if not exists repeat_until int null;

-- (opcional) checks leves (não quebra legado)
do $$
begin
  -- repeat_every > 0
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaign_template_tasks_repeat_every_chk'
  ) then
    alter table public.campaign_template_tasks
    add constraint campaign_template_tasks_repeat_every_chk
    check (repeat_every is null or repeat_every > 0);
  end if;

  -- repeat_until >= 0
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaign_template_tasks_repeat_until_chk'
  ) then
    alter table public.campaign_template_tasks
    add constraint campaign_template_tasks_repeat_until_chk
    check (repeat_until is null or repeat_until >= 0);
  end if;
end$$;
