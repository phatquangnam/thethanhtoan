-- Chạy SAU tệp 01. Chạy tại SQL Editor bằng tài khoản chủ dự án.
create extension if not exists pg_cron;
select cron.schedule('so-the-reminders','*/10 * * * *','select public.app_scheduled_reminders();');
-- Kiểm tra lịch:
select jobid,jobname,schedule,active from cron.job where jobname='so-the-reminders';
-- Giờ tổng hợp của người dùng được tính theo Asia/Ho_Chi_Minh trong hàm SQL.
-- Lịch cần dự án Supabase đang hoạt động; Free có thể bị pause.
