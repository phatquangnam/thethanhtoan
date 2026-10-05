-- TÙY CHỌN: KHÔNG CHẠY trong bước cài đặt ban đầu.
-- Chỉ chạy khi send-digest đã triển khai và có CRON_SECRET trong Edge Function Secrets.
-- CRON_SECRET chỉ đặt trên máy chủ, không đặt vào biến VITE_ hay GitHub.
create extension if not exists pg_net with schema extensions;
-- Thay hai giá trị bên dưới trong SQL Editor, không lưu bản chứa bí mật lên GitHub.
select vault.create_secret('THAY_BANG_URL_EDGE_FUNCTION_SEND_DIGEST','so_the_email_url');
select vault.create_secret('THAY_BANG_CRON_SECRET','so_the_email_cron_secret');
select cron.schedule('so-the-email','*/10 * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='so_the_email_url' limit 1),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='so_the_email_cron_secret' limit 1)),
  body := '{}'::jsonb
 );
$job$);
