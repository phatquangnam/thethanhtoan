-- Chạy toàn bộ trong Supabase SQL Editor. Không chứa khóa hoặc mật khẩu.
-- Dữ liệu riêng từng tài khoản. Tất cả thay đổi nghiệp vụ đi qua RPC giao dịch.
begin;
create table if not exists public.app_cards (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null, unique (user_id,id),
  check (length(trim(data->>'name')) between 1 and 150),
  check (length(trim(data->>'bankName')) between 1 and 150),
  check ((data->>'defaultDueDay')::int between 1 and 31),
  check (data->>'status' in ('active','archived')),
  check (data->>'startTrackingMonth' ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
create unique index if not exists app_card_name_unique on public.app_cards(user_id,lower(trim(data->>'name')));
create table if not exists public.app_obligations (
  id text primary key, user_id uuid not null, card_id text not null, month text not null,
  data jsonb not null, unique(user_id,id), unique(user_id,card_id,month),
  foreign key(user_id,card_id) references public.app_cards(user_id,id) on delete cascade,
  check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  check(data ?& array['id','userId','cardId','month','dataState','amount','actualDueDate'] and jsonb_typeof(data->'amount')='number'),
  check(data->>'dataState' in ('UNUPDATED','DECLARED','NO_EXPENSE')),
  check((data->>'amount')::numeric >= 0 and (data->>'amount')::numeric <= 9007199254740991 and (data->>'amount')::numeric = trunc((data->>'amount')::numeric)),
  check((data->>'dataState' = 'DECLARED' and (data->>'amount')::numeric > 0) or (data->>'dataState' <> 'DECLARED' and (data->>'amount')::numeric = 0)),
  check((data->>'actualDueDate')::date is not null)
);
create table if not exists public.app_payments (
  id text primary key, user_id uuid not null, obligation_id text not null, card_id text not null,
  data jsonb not null, unique(user_id,id),
  foreign key(user_id,obligation_id) references public.app_obligations(user_id,id) on delete cascade,
  foreign key(user_id,card_id) references public.app_cards(user_id,id) on delete cascade,
  check((data->>'amount')::numeric > 0 and (data->>'amount')::numeric <= 9007199254740991 and (data->>'amount')::numeric = trunc((data->>'amount')::numeric)),
  check(data ?& array['id','userId','cardId','obligationId','amount','paidDate','status'] and jsonb_typeof(data->'amount')='number'),
  check(data->>'status' in ('VALID','CANCELLED')),
  check((data->>'paidDate')::date is not null)
);
create table if not exists public.app_audit_logs (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade, data jsonb not null
);
create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null
);
create table if not exists public.app_notifications (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null, data jsonb not null, unique(user_id,dedupe_key)
);
create table if not exists public.app_changes (
  user_id uuid primary key references auth.users(id) on delete cascade, revision bigint not null default 0, changed_at timestamptz not null default now()
);
-- Chỉ phát realtime qua app_changes: bản ghi revision báo cả thao tác xóa.
-- Không phụ thuộc bộ lọc sự kiện DELETE của Realtime.
do $$ declare t text; begin
  foreach t in array array['app_cards','app_obligations','app_payments','app_audit_logs','app_settings','app_notifications','app_changes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists owner_read on public.%I',t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create index if not exists app_obl_owner_month on public.app_obligations(user_id,month);
create index if not exists app_payment_owner_obl on public.app_payments(user_id,obligation_id);

create or replace function public.app_touch(u uuid) returns void language plpgsql security definer set search_path = public,pg_temp as $$
begin
 insert into public.app_changes(user_id,revision) values(u,1)
 on conflict(user_id) do update set revision=app_changes.revision+1,changed_at=now();
end $$;
create or replace function public.app_log(u uuid,entity text,eid text,act text,oldval jsonb,newval jsonb,reason text default '') returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare i text := gen_random_uuid()::text;
begin
 insert into app_audit_logs values(i,u,jsonb_build_object('id',i,'userId',u,'entityType',entity,'entityId',eid,'action',act,'previousValue',oldval,'newValue',newval,'reason',reason,'createdAt',now()));
end $$;
create or replace function public.app_validate_card(d jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
declare dy numeric; m date;
begin
 if coalesce(length(trim(d->>'name')),0) not between 1 and 150 or coalesce(length(trim(d->>'bankName')),0) not between 1 and 150 then raise exception 'Tên thẻ và ngân hàng phải có từ 1 đến 150 ký tự'; end if;
 dy := (d->>'defaultDueDay')::numeric;
 if dy is null or dy < 1 or dy > 31 or dy <> trunc(dy) then raise exception 'Ngày đến hạn phải là số nguyên từ 1 đến 31'; end if;
 if coalesce(d->>'status','') not in ('active','archived') then raise exception 'Trạng thái thẻ không hợp lệ'; end if;
 if coalesce(d->>'startTrackingMonth','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Tháng bắt đầu không hợp lệ'; end if;
 m := (d->>'startTrackingMonth' || '-01')::date;
 if extract(year from m) not between 2000 and 2100 then raise exception 'Năm theo dõi phải từ 2000 đến 2100'; end if;
 if d ? 'customReminderDays' and d->'customReminderDays' <> 'null'::jsonb then
  if jsonb_typeof(d->'customReminderDays') <> 'array' then raise exception 'Lịch nhắc không hợp lệ'; end if;
  if exists(select 1 from jsonb_array_elements_text(d->'customReminderDays') v where v::numeric < 0 or v::numeric > 30 or v::numeric <> trunc(v::numeric)) then raise exception 'Lịch nhắc phải là số nguyên từ 0 đến 30'; end if;
 end if;
 if nullif(d->>'customUpdateReminderDaysBefore','') is not null and ((d->>'customUpdateReminderDaysBefore')::numeric < 0 or (d->>'customUpdateReminderDaysBefore')::numeric > 30 or (d->>'customUpdateReminderDaysBefore')::numeric <> trunc((d->>'customUpdateReminderDaysBefore')::numeric)) then raise exception 'Ngày nhắc cập nhật phải từ 0 đến 30'; end if;
end $$;
create or replace function public.app_reminder(u uuid,cid text,due date,ym text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; n int; med numeric; cnt int; src text := 'DEFAULT_7_DAYS'; why text := 'Mặc định trước ngày đến hạn 7 ngày';
begin
 select data into c from app_cards where user_id=u and id=cid;
 n := (c->>'customUpdateReminderDaysBefore')::int;
 if n is not null then src := 'CUSTOM'; why := 'Theo cấu hình riêng của thẻ';
 else
  with recent as (select data from app_obligations where user_id=u and card_id=cid and month<ym and data->>'dataState'='DECLARED' and data->>'firstDeclaredAt' is not null order by month desc limit 6),
  diffs as (select (data->>'actualDueDate')::date - ((data->>'firstDeclaredAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date d from recent)
  select count(*),ceil(percentile_cont(0.5) within group(order by d)) into cnt,med from diffs where d between 0 and 30;
  if cnt >= 3 then n:=least(30,med::int+1); src:='MEDIAN_DECLARATION'; why:='Dựa trên lịch khai báo của các kỳ gần nhất';
  else
   with recent as (select id,data from app_obligations where user_id=u and card_id=cid and month<ym and data->>'dataState'='DECLARED' order by month desc limit 6),
   diffs as (select (o.data->>'actualDueDate')::date-max((p.data->>'paidDate')::date) d from recent o join app_payments p on p.user_id=u and p.obligation_id=o.id and p.data->>'status'='VALID' group by o.id,o.data having sum((p.data->>'amount')::numeric) >= (o.data->>'amount')::numeric)
   select count(*),ceil(percentile_cont(0.5) within group(order by d)) into cnt,med from diffs where d between 0 and 30;
   if cnt>=3 then n:=least(30,med::int+2); src:='MEDIAN_PAYMENT'; why:='Dựa trên lịch thanh toán đủ của các kỳ gần nhất'; else n:=7; end if;
  end if;
 end if;
 return jsonb_build_object('updateReminderDate',due-n,'updateReminderSource',src,'updateReminderReason',why);
end $$;
create or replace function public.app_due(ym text,c jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare m date; due date; lastday int; src text:='DEFAULT'; est bool:=false; dow int;
begin
 if ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Tháng không hợp lệ'; end if;
 m:=(ym||'-01')::date;
 if extract(year from m) not between 2000 and 2100 then raise exception 'Năm phải từ 2000 đến 2100'; end if;
 lastday:=extract(day from (m+interval '1 month - 1 day'));
 due:=m+least((c->>'defaultDueDay')::int,lastday)-1;
 if (c->>'defaultDueDay')::int>lastday then est:=true;src:='MONTH_END_FALLBACK';end if;
 dow:=extract(dow from due);
 if coalesce((c->>'autoWeekendShift')::bool,false) and dow in (0,6) then due:=due-case when dow=0 then 2 else 1 end;src:='WEEKEND_FRIDAY_SUGGESTION';end if;
 return jsonb_build_object('dueDay',extract(day from due)::int,'actualDueDate',due,'dueDateSource',src,'isEstimatedDue',est);
end $$;
create or replace function public.app_ensure(u uuid,ym text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; i text; d jsonb;
begin
 if ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or extract(year from (ym||'-01')::date) not between 2000 and 2100 then raise exception 'Tháng không hợp lệ';end if;
 for c in select * from app_cards where user_id=u and data->>'status'='active' and data->>'startTrackingMonth'<=ym loop
  if not exists(select 1 from app_obligations where user_id=u and card_id=c.id and month=ym) then
   i:=gen_random_uuid()::text; d:=app_due(ym,c.data);
   d:=d || app_reminder(u,c.id,(d->>'actualDueDate')::date,ym) || jsonb_build_object('id',i,'userId',u,'cardId',c.id,'month',ym,'dataState','UNUPDATED','amount',0,'firstDeclaredAt',null,'noExpenseConfirmedAt',null,'notes','','createdAt',now(),'updatedAt',now());
   insert into app_obligations values(i,u,c.id,ym,d) on conflict(user_id,card_id,month) do nothing;
  end if;
 end loop;
end $$;
create or replace function public.app_snapshot() returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); c jsonb;
begin
 if u is null then raise exception 'Vui lòng đăng nhập'; end if;
 select data into c from app_settings where user_id=u;
 return jsonb_build_object('cards',coalesce((select jsonb_agg(data order by (data->>'defaultDueDay')::int,data->>'name') from app_cards where user_id=u),'[]'::jsonb),
 'obligations',coalesce((select jsonb_agg(data order by month,id) from app_obligations where user_id=u),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(data order by data->>'paidDate',id) from app_payments where user_id=u),'[]'::jsonb),
 'notifications',coalesce((select jsonb_agg(data order by data->>'sentAt' desc,id) from app_notifications where user_id=u),'[]'::jsonb),
 'auditLogs',coalesce((select jsonb_agg(data order by data->>'createdAt' desc,id) from (select * from app_audit_logs where user_id=u order by data->>'createdAt' desc limit 500) l),'[]'::jsonb),
 'config',coalesce(c,jsonb_build_object('userId',u,'dailyDigestTime','08:00','emailEnabled',false,'targetEmail','','discreteMode',false)));
end $$;

-- Giao dịch RPC: khóa theo người dùng để không ghi trùng / trả vượt khi hai thiết bị cùng sửa.
create or replace function public.app_command(action text,args jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); i text; cid text; ym text; oldval jsonb; d jsonb; v jsonb; x jsonb; paid numeric; n numeric; j int; reason text:=coalesce(args->>'reason',''); result jsonb:='{}'; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 if u is null then raise exception 'Vui lòng đăng nhập'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if octet_length(args::text)>10000000 then raise exception 'Dữ liệu vượt giới hạn 10 MB';end if;
 if action='prepare' then
  for x in select * from jsonb_array_elements(coalesce(args->'months','[]')) loop perform app_ensure(u,x#>>'{}');end loop;
  perform app_ensure(u,to_char(today,'YYYY-MM')); perform app_ensure(u,to_char(today+interval '1 month','YYYY-MM'));
  -- Chỉ phát realtime nếu số nghĩa vụ thay đổi; tránh vòng lặp tải lại.
  return result;
 elsif action in ('create_card','update_card') then
  i:=coalesce(args->>'id',gen_random_uuid()::text);
  if action='update_card' then select data into oldval from app_cards where user_id=u and id=i; if not found then raise exception 'Không tìm thấy thẻ';end if;end if;
  d:=coalesce(oldval,jsonb_build_object('status','active','autoWeekendShift',false,'startTrackingMonth',to_char(today,'YYYY-MM'),'customReminderDays',jsonb_build_array(7,3,1,0),'createdAt',now(),'notes','')) || (args->'data');
  d:=d-'applyDueDayFromMonth'; d:=d||jsonb_build_object('id',i,'userId',u,'name',trim(d->>'name'),'bankName',trim(d->>'bankName'),'updatedAt',now());
  perform app_validate_card(d);
  insert into app_cards values(i,u,d) on conflict(id) do update set data=excluded.data where app_cards.user_id=u;
  if not found then raise exception 'ID thẻ không hợp lệ';end if;
  perform app_log(u,'CARD',i,case when oldval is null then 'CREATE' else 'UPDATE' end,oldval,d,reason);
  if action='update_card' and args->'data' ? 'applyDueDayFromMonth' then
   ym:=args->'data'->>'applyDueDayFromMonth'; perform app_due(ym,d);
   for v in select data from app_obligations where user_id=u and card_id=i and month>=ym and data->>'dueDateSource'<>'MANUAL_OVERRIDE' loop
    x:=v||app_due(v->>'month',d); x:=x||app_reminder(u,i,(x->>'actualDueDate')::date,x->>'month')||jsonb_build_object('updatedAt',now());
    update app_obligations set data=x where user_id=u and id=v->>'id'; perform app_log(u,'OBLIGATION',v->>'id','UPDATE_DUE_DATE',v,x,'Thay đổi lịch thẻ từ tháng '||ym);
   end loop;
  end if;
  if action='update_card' then
   for v in select data from app_obligations where user_id=u and card_id=i and data->>'dataState'='UNUPDATED' loop
    update app_obligations set data=v||app_reminder(u,i,(v->>'actualDueDate')::date,v->>'month') where user_id=u and id=v->>'id';
   end loop;
  end if;
  perform app_ensure(u,to_char(today,'YYYY-MM'));perform app_ensure(u,to_char(today+interval '1 month','YYYY-MM'));
  result:=d;
 elsif action='delete_cards' then
  for x in select * from jsonb_array_elements(args->'ids') loop
   i:=x#>>'{}';select data into d from app_cards where user_id=u and id=i;
   if not found then raise exception 'Không tìm thấy thẻ cần xóa';end if;
   perform app_log(u,'CARD',i,'DELETE',d,null,reason);
   delete from app_cards where user_id=u and id=i;
  end loop;
 elsif action='import_cards' then
  if jsonb_typeof(args->'cards')<>'array' or jsonb_array_length(args->'cards')=0 then raise exception 'Danh sách thẻ rỗng';end if;
  if coalesce((args->>'replaceExisting')::bool,false) then
   perform app_log(u,'CARD','IMPORT','DELETE',null,null,'Thay thế danh mục và nghĩa vụ, giao dịch cũ');
   delete from app_cards where user_id=u;delete from app_notifications where user_id=u;
  end if;
  for x in select * from jsonb_array_elements(args->'cards') loop perform app_command('create_card',jsonb_build_object('data',x));end loop;
  result:=jsonb_build_object('success',true,'count',jsonb_array_length(args->'cards'));
 elsif action in ('update_obligation','no_expense','weekend') then
  i:=args->>'id';select data,card_id,month into oldval,cid,ym from app_obligations where user_id=u and id=i;
  if not found then raise exception 'Không tìm thấy nghĩa vụ';end if;
  select coalesce(sum((data->>'amount')::numeric),0) into paid from app_payments where user_id=u and obligation_id=i and data->>'status'='VALID';
  d:=oldval;
  if action='no_expense' then
   if paid>0 then raise exception 'Đã ghi nhận thanh toán, không thể chọn Không phát sinh';end if;
   d:=d||jsonb_build_object('amount',0,'dataState','NO_EXPENSE','noExpenseConfirmedAt',now());
  elsif action='weekend' then
   j:=extract(dow from (d->>'actualDueDate')::date);
   if j not in (0,6) then raise exception 'Ngày hiện tại không rơi vào cuối tuần';end if;
   d:=d||jsonb_build_object('actualDueDate',(d->>'actualDueDate')::date-case when j=0 then 2 else 1 end,'dueDateSource','WEEKEND_FRIDAY_SUGGESTION');
  else
   v:=coalesce(args->'data','{}');
   if v ? 'amount' then
    n:=(v->>'amount')::numeric;
    if n is null or n<=0 or n<>trunc(n) or n>9007199254740991 then raise exception 'Nhập số tiền nguyên lớn hơn 0 hoặc chọn Không phát sinh';end if;
    if n<paid then raise exception 'Số tiền nghĩa vụ không được nhỏ hơn số đã thanh toán';end if;
    d:=d||jsonb_build_object('amount',n,'dataState','DECLARED','firstDeclaredAt',coalesce(d->>'firstDeclaredAt',now()::text),'noExpenseConfirmedAt',null);
   end if;
   if v ? 'actualDueDate' and v->>'actualDueDate'<>d->>'actualDueDate' then
    if coalesce(v->>'actualDueDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Ngày đến hạn không hợp lệ';end if;
    d:=d||jsonb_build_object('actualDueDate',(v->>'actualDueDate')::date,'dueDateSource','MANUAL_OVERRIDE','isEstimatedDue',false);
   end if;
   if v ? 'notes' then d:=d||jsonb_build_object('notes',v->>'notes');end if;
  end if;
  d:=d||jsonb_build_object('dueDay',extract(day from (d->>'actualDueDate')::date)::int,'updatedAt',now())||app_reminder(u,cid,(d->>'actualDueDate')::date,ym);
  update app_obligations set data=d where user_id=u and id=i;
  perform app_log(u,'OBLIGATION',i,case action when 'no_expense' then 'CONFIRM_NO_EXPENSE' when 'weekend' then 'WEEKEND_SHIFT' else 'UPDATE_AMOUNT' end,oldval,d,reason);
  result:=d;
 elsif action='batch_obligations' then
  for x in select * from jsonb_array_elements(args->'updates') loop
   if coalesce((x->>'isNoExpense')::bool,false) then
    perform app_command('no_expense',jsonb_build_object('id',x->>'id','reason',reason));
    perform app_command('update_obligation',jsonb_build_object('id',x->>'id','data',x-'amount','reason',reason));
   else perform app_command('update_obligation',jsonb_build_object('id',x->>'id','data',x,'reason',reason));end if;
  end loop;
  result:=jsonb_build_object('success',true,'updatedCount',jsonb_array_length(args->'updates'),'errors','[]'::jsonb);
 elsif action='payment' then
  if args ? 'requestId' then
   select data into x from app_payments where user_id=u and id=args->>'requestId';
   if found then
    if x->>'obligationId'<>args->>'obligationId' or (x->>'amount')::numeric<>(args->>'amount')::numeric or x->>'paidDate'<>args->>'paidDate' then raise exception 'Mã giao dịch bị trùng';end if;
    return x;
   end if;
  end if;
  i:=args->>'obligationId';select data,card_id into oldval,cid from app_obligations where user_id=u and id=i;
  if not found then raise exception 'Không tìm thấy nghĩa vụ';end if;
  if oldval->>'dataState'='UNUPDATED' and args ? 'declaredAmount' then
   perform app_command('update_obligation',jsonb_build_object('id',i,'data',jsonb_build_object('amount',args->'declaredAmount')));
   select data into oldval from app_obligations where user_id=u and id=i;
  end if;
  if oldval->>'dataState'<>'DECLARED' then raise exception 'Cần khai báo số tiền trước khi thanh toán';end if;
  n:=(args->>'amount')::numeric;
  if n is null or n<=0 or n<>trunc(n) or n>9007199254740991 then raise exception 'Số tiền thanh toán phải là số nguyên lớn hơn 0';end if;
  select coalesce(sum((data->>'amount')::numeric),0) into paid from app_payments where user_id=u and obligation_id=i and data->>'status'='VALID';
  if n+paid>(oldval->>'amount')::numeric then raise exception 'Số tiền thanh toán vượt quá số còn phải trả';end if;
  if coalesce(args->>'paidDate','') !~ '^\d{4}-\d{2}-\d{2}$' or (args->>'paidDate')::date>today then raise exception 'Ngày thanh toán không hợp lệ hoặc ở tương lai';end if;
  j:=extract(year from (args->>'paidDate')::date);if j not between 2000 and 2100 then raise exception 'Năm thanh toán không hợp lệ';end if;
  -- requestId cho phép thử lại an toàn sau khi mất kết nối, không ghi hai lần.
  v:=jsonb_build_object('obligationId',i,'amount',n,'paidDate',(args->>'paidDate')::date,'notes',coalesce(args->>'notes',''),'referenceCode',coalesce(args->>'referenceCode',''),'receiptUrl',args->'receiptUrl','status','VALID','createdAt',now(),'cardId',cid,'userId',u);
  i:=coalesce(args->>'requestId',gen_random_uuid()::text);
  select data into x from app_payments where id=i;
  if found then
   if x->>'userId'<>u::text or x->>'obligationId'<>v->>'obligationId' or x->>'amount'<>v->>'amount' or x->>'paidDate'<>v->>'paidDate' then raise exception 'Mã giao dịch bị trùng';end if;
   return x;
  end if;
  v:=v||jsonb_build_object('id',i);insert into app_payments values(i,u,v->>'obligationId',cid,v);
  perform app_log(u,'PAYMENT',i,'CREATE',null,v,reason); result:=v;
 elsif action='cancel_payment' then
  i:=args->>'id';select data into oldval from app_payments where user_id=u and id=i;
  if not found then raise exception 'Không tìm thấy thanh toán';end if;
  if length(trim(reason))=0 then raise exception 'Cần nhập lý do hủy';end if;
  d:=oldval||jsonb_build_object('status','CANCELLED','cancellationReason',reason);
  update app_payments set data=d where user_id=u and id=i;perform app_log(u,'PAYMENT',i,'CANCEL_PAYMENT',oldval,d,reason);result:=d;
 elsif action='settings' then
  select data into oldval from app_settings where user_id=u;
  d:=coalesce(oldval,jsonb_build_object('dailyDigestTime','08:00','emailEnabled',false,'targetEmail','','discreteMode',false)) || (args-'smtpPass'-'smtpHost'-'smtpUser'-'smtpPort'-'smtpSecure');
  d:=d||jsonb_build_object('userId',u);
  if coalesce(d->>'dailyDigestTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Giờ nhắc không hợp lệ';end if;
  if coalesce((d->>'emailEnabled')::bool,false) and coalesce(d->>'targetEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email nhận không hợp lệ';end if;
  insert into app_settings values(u,d) on conflict(user_id) do update set data=excluded.data;
  perform app_log(u,'SYSTEM','SETTINGS','UPDATE',oldval,d,reason);result:=d;
 elsif action in ('read_notification','read_all') then
  update app_notifications set data=data||jsonb_build_object('read',true) where user_id=u and (action='read_all' or id=args->>'id') and not coalesce((data->>'read')::bool,false);
 elsif action='check_reminders' then result:=app_check_reminders(u);
 elsif action='restore' then
  if args->>'format'<>'so-thanh-toan-the-v1' or jsonb_typeof(args->'cards')<>'array' or jsonb_typeof(args->'obligations')<>'array' or jsonb_typeof(args->'payments')<>'array' then raise exception 'Tệp sao lưu không đúng định dạng phiên bản Supabase';end if;
  delete from app_cards where user_id=u; delete from app_notifications where user_id=u;
  for x in select * from jsonb_array_elements(args->'cards') loop
   perform app_validate_card(x);d:=x||jsonb_build_object('userId',u);insert into app_cards values(d->>'id',u,d);
  end loop;
  for x in select * from jsonb_array_elements(args->'obligations') loop
   d:=x||jsonb_build_object('userId',u);perform (d->>'actualDueDate')::date;
   insert into app_obligations values(d->>'id',u,d->>'cardId',d->>'month',d);
  end loop;
  for x in select * from jsonb_array_elements(args->'payments') loop
   d:=x||jsonb_build_object('userId',u);
   if not exists(select 1 from app_obligations where user_id=u and id=d->>'obligationId' and card_id=d->>'cardId') then raise exception 'Thanh toán không khớp nghĩa vụ';end if;
   insert into app_payments values(d->>'id',u,d->>'obligationId',d->>'cardId',d);
  end loop;
  if exists(select 1 from app_obligations o join app_payments p on p.user_id=u and p.obligation_id=o.id and p.data->>'status'='VALID' where o.user_id=u group by o.id,o.data having sum((p.data->>'amount')::numeric)>(o.data->>'amount')::numeric) then raise exception 'Sao lưu có số thanh toán vượt nghĩa vụ';end if;
  if args ? 'config' then perform app_command('settings',args->'config');end if;
  perform app_log(u,'SYSTEM','BACKUP','RESTORE',null,jsonb_build_object('cards',jsonb_array_length(args->'cards')),'Khôi phục sao lưu');
 else raise exception 'Thao tác không được hỗ trợ: %',action;
 end if;
 if action in ('update_obligation','payment','cancel_payment','no_expense','weekend') then
  -- Khi cập nhật lịch sử, tính lại đề xuất nhắc cho các kỳ chưa khai báo.
  for v in select data from app_obligations where user_id=u and data->>'dataState'='UNUPDATED' loop
   x:=v||app_reminder(u,v->>'cardId',(v->>'actualDueDate')::date,v->>'month');
   if x<>v then update app_obligations set data=x where user_id=u and id=v->>'id';end if;
  end loop;
 end if;
 perform app_touch(u);return result;
end $$;

create or replace function public.app_add_notification(u uuid,k text,t text,title text,content text,obl text default null,channel text default 'IN_APP') returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare i text:=gen_random_uuid()::text; n int;
begin
 insert into app_notifications values(i,u,k,jsonb_build_object('id',i,'userId',u,'type',t,'obligationId',obl,'channel',channel,'title',title,'content',content,'isDiscrete',true,'sentAt',now(),'status',case when channel='EMAIL' then 'PENDING' else 'SUCCESS' end,'read',false)) on conflict(user_id,dedupe_key) do nothing;
 get diagnostics n=row_count;return n;
end $$;
create or replace function public.app_check_reminders(u uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; clock_text text:=to_char(now() at time zone 'Asia/Ho_Chi_Minh','HH24:MI'); o record; c jsonb; cfg jsonb; remain numeric; days int; cnt int:=0; typ text; key text; title text; detail text; digest text:='';
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform app_ensure(u,to_char(today,'YYYY-MM'));perform app_ensure(u,to_char(today+interval '1 month','YYYY-MM'));
 select data into cfg from app_settings where user_id=u;
 for o in select ob.*,ca.data carddata from app_obligations ob join app_cards ca on ca.user_id=u and ca.id=ob.card_id where ob.user_id=u loop
  typ:=null;days:=(o.data->>'actualDueDate')::date-today;c:=o.carddata;
  if o.data->>'dataState'='UNUPDATED' and c->>'status'='active' and today>=(o.data->>'updateReminderDate')::date then typ:='MISSING_UPDATE'; title:='Nhắc cập nhật: '||(c->>'name'); detail:='Tháng '||o.month||': nhập số tiền hoặc xác nhận Không phát sinh.';
  elsif o.data->>'dataState'='DECLARED' then
   select (o.data->>'amount')::numeric-coalesce(sum((data->>'amount')::numeric),0) into remain from app_payments where user_id=u and obligation_id=o.id and data->>'status'='VALID';
   if remain>0 then
    if days<0 then typ:='OVERDUE_ALERT';title:='Quá hạn: '||(c->>'name');
    elsif days=0 or exists(select 1 from jsonb_array_elements_text(coalesce(nullif(c->'customReminderDays','null'::jsonb),'[7,3,1,0]')) d where d::int=days) then typ:='PAYMENT_REMINDER';title:='Nhắc thanh toán: '||(c->>'name');end if;
    detail:='Tháng '||o.month||', hạn '||(o.data->>'actualDueDate')||'. Vui lòng mở ứng dụng để kiểm tra số còn phải trả.';
   end if;
  end if;
  if typ is not null then
   key:=today::text||':'||o.id||':'||typ;
   cnt:=cnt+app_add_notification(u,key,typ,title,detail,o.id);
   digest:=digest||title||E'\n'||detail||E'\n\n';
  end if;
 end loop;
 -- Bản tin gửi đúng lịch theo múi giờ Việt Nam, không gắn SUCCESS giả cho email.
 if digest<>'' and clock_text>=coalesce(cfg->>'dailyDigestTime','08:00') then
  cnt:=cnt+app_add_notification(u,today::text||':DIGEST','DAILY_DIGEST','Tổng hợp thanh toán ngày '||today,digest,null,case when coalesce((cfg->>'emailEnabled')::bool,false) then 'EMAIL' else 'IN_APP' end);
 end if;
 if cnt>0 then perform app_touch(u);end if;
 return jsonb_build_object('generatedCount',cnt);
end $$;
create or replace function public.app_scheduled_reminders() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid;
begin for u in select distinct user_id from app_cards loop perform app_check_reminders(u);end loop;end $$;
-- Helper không được gọi trực tiếp từ trình duyệt để giả mạo user_id.
revoke all on function public.app_touch(uuid),public.app_log(uuid,text,text,text,jsonb,jsonb,text),public.app_validate_card(jsonb),public.app_reminder(uuid,text,date,text),public.app_due(text,jsonb),public.app_ensure(uuid,text),public.app_add_notification(uuid,text,text,text,text,text,text),public.app_check_reminders(uuid),public.app_scheduled_reminders() from public,anon,authenticated;
revoke all on function public.app_command(text,jsonb),public.app_snapshot() from public,anon;
grant execute on function public.app_command(text,jsonb),public.app_snapshot() to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='app_changes') then alter publication supabase_realtime add table public.app_changes;end if;
end $$;
commit;
