create table if not exists category_rules (
  id          uuid primary key default uuid_generate_v4(),
  keyword     text not null,
  category    text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

create index if not exists category_rules_sort on category_rules(sort_order);
