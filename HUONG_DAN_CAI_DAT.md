# Sổ theo dõi thanh toán thẻ — Bộ triển khai Supabase + Vercel

Bản này giữ các màn hình của tài liệu nguồn, thay máy chủ Express/JSON/Firebase bằng Supabase. Dùng cho dữ liệu cá nhân, đăng nhập bằng email và mật khẩu. Không có dữ liệu ngân hàng hoặc giao dịch mẫu được tạo tự động.

## Chặng hiện tại: tạo cơ sở dữ liệu

1. Mở dự án `so-thanh-toan-the` trong Supabase.
2. Ở thanh bên trái, chọn SQL Editor, biểu tượng ô vuông có dấu `>_`. Khi rê chuột sẽ thấy tên.
3. Chọn New query.
4. Mở `supabase/01_TAO_CO_SO_DU_LIEU.sql` bằng Notepad. Nhấn Ctrl+A, Ctrl+C.
5. Quay về ô soạn thảo trong SQL Editor, nhấn Ctrl+V rồi bấm Run.
6. Kết quả mong đợi: lệnh chạy thành công, thường hiển thị Success / No rows returned. Nếu báo lỗi, gửi ảnh nguyên thông báo lỗi; không chạy thêm các đoạn sửa từ nguồn khác.
7. Mở Table Editor. Cần thấy 7 bảng: app_cards, app_obligations, app_payments, app_audit_logs, app_settings, app_notifications, app_changes. Các bảng có thể còn trống, đây là đúng.
8. Có thể chạy lại tệp 01 trên cơ sở dữ liệu này: không xóa các bản ghi đã có. Đây là bộ cài mới, không chuyển trực tiếp dữ liệu từ một ứng dụng cũ khác.

## Tạo tài khoản để đăng nhập ứng dụng

1. Vào Authentication ở thanh bên trái, rồi Users.
2. Chọn Add user, tiếp đến Create new user nếu có menu con.
3. Nhập email anh dùng và mật khẩu mới từ 12 ký tự. Không dùng mật khẩu cơ sở dữ liệu.
4. Bật Auto Confirm User nếu có, rồi Create user. Tài khoản cá nhân này không cần chờ email xác nhận.
5. Kiểm tra email xuất hiện trong danh sách Users.
6. Trong phần cài đặt Authentication, tìm Allow new users to sign up và tắt đăng ký mới vì ứng dụng này phục vụ cá nhân. Tên/vị trí tùy giao diện. Tài khoản đã tạo bằng Dashboard vẫn đăng nhập được.
7. Ứng dụng không có nút tự đăng ký; muốn thêm tài khoản, chủ dự án tạo thêm trong Dashboard. Mỗi tài khoản có dữ liệu riêng.
8. Nếu quên mật khẩu, có thể cập nhật mật khẩu người dùng qua Dashboard nếu giao diện hỗ trợ. Tính năng gửi email khôi phục mật khẩu chưa được tích hợp trong giao diện bản này.

## Bật lịch nhắc trong ứng dụng

1. Trong SQL Editor, tạo truy vấn mới.
2. Mở `supabase/02_BAT_LICH_NHAC.sql`, sao chép toàn bộ, dán và Run.
3. Kết quả truy vấn cuối phải có dòng so-the-reminders, lịch */10 * * * *, active = true.
4. Lịch chạy mỗi 10 phút trên Supabase, không phụ thuộc trình duyệt. Thông báo sẽ hiển thị khi mở ứng dụng. Bản tin tổng hợp được tạo trong lượt chạy đầu tiên sau giờ anh chọn, theo giờ Việt Nam.
5. Lịch chỉ hoạt động khi dự án Supabase đang chạy. Dự án Free có thể tạm dừng khi ít hoạt động; không cam kết vận hành không gián đoạn.
6. Trong Cron / Jobs hoặc bảng cron.job_run_details có thể kiểm tra các lần chạy. Không có email/Telegram tự động nếu chưa cấu hình phần gửi ra bên ngoài.

## Tải mã nguồn lên GitHub

1. Giải nén bộ ZIP này trên máy tính.
2. Mở kho Private `so-thanh-toan-the` đã tạo.
3. Chọn Add file → Upload files, hoặc uploading an existing file nếu kho còn trống.
4. Kéo NỘI DUNG bên trong thư mục `so-thanh-toan-the` lên. Không tải file ZIP đơn lẻ, không đặt thêm một cấp thư mục chứa mã.
5. Ở cấp ngoài cùng cần có package.json, package-lock.json, index.html, vite.config.ts, tsconfig.json, vercel.json và thư mục src. Các thư mục supabase và tests được giữ nguyên. Hướng dẫn có thể giữ trong kho.
6. Không tải node_modules hoặc dist. Nếu dùng chức năng chạy cục bộ, không tải .env.local. Không tải mật khẩu, Secret key, sao lưu JSON hoặc tệp Excel chứa dữ liệu thực tế.
7. Nhập nội dung lưu phiên bản ở Commit changes rồi xác nhận.

## Tạo website trên Vercel

1. Đăng nhập Vercel bằng GitHub. Chọn tài khoản cá nhân Hobby nếu phù hợp điều kiện sử dụng.
2. Add New → Project → Import kho `so-thanh-toan-the`.
3. Nếu chưa thấy kho, cấu hình quyền GitHub để Vercel đọc đúng kho Private này.
4. Chọn Framework Preset = Vite. Root Directory là thư mục có package.json. Nếu anh tải đúng cấp, để mặc định.
5. Build Command = npm run build. Output Directory = dist. Install Command để mặc định; có thể dùng npm ci.
6. Mở Environment Variables, thêm đúng hai biến:

| Name | Value |
|---|---|
| VITE_SUPABASE_URL | Giá trị SUPABASE_URL lấy từ Connect |
| VITE_SUPABASE_PUBLISHABLE_KEY | Giá trị SUPABASE_PUBLISHABLE_KEY lấy từ Connect |

7. Chọn áp dụng Production và Preview nếu có. KHÔNG thêm SUPABASE_SECRET_KEY / service_role vào các biến VITE_.
8. Deploy. Đợi trạng thái Ready rồi mở đường dẫn website.
9. Nếu chỉnh thông tin kết nối sau khi deploy, phải Redeploy để Vite đóng gói lại biến môi trường.
10. Trong Supabase → Authentication → URL Configuration, đặt Site URL bằng đường dẫn Vercel chính thức. Đăng nhập bằng mật khẩu bản này không cần callback OAuth.
11. Đăng nhập bằng email/mật khẩu đã tạo trong Authentication → Users.
12. Đúng kết quả: hiện danh mục trống. Không có 40 thẻ giả hoặc số tiền giả.

## Thử bằng một thẻ trước khi nhập danh mục thật

1. Danh mục thẻ → Thêm thẻ. Tên THẺ KIỂM TRA, ngân hàng THỬ NGHIỆM, ngày đến hạn phù hợp, tháng bắt đầu là tháng hiện tại.
2. Tổng quan / Cập nhật nhanh: ban đầu là Chưa cập nhật. Không có nghĩa vụ được khai báo tự động bằng 0.
3. Chọn Không phát sinh, lưu và kiểm tra trạng thái.
4. Đổi sang số tiền 5.000.000 đồng. Ghi thanh toán lần một 2.000.000 đồng với ngày hôm nay. Còn lại 3.000.000 đồng.
5. Ghi lần hai 3.000.000 đồng. Tổng còn lại bằng 0, trạng thái đã trả đủ.
6. Thử số tiền trả vượt còn lại: phải bị chặn. Thử giảm nghĩa vụ thấp hơn số đã trả: phải bị chặn.
7. Mở cùng tài khoản trên điện thoại và máy tính. Sửa ghi chú trên điện thoại. Khi kết nối realtime hoạt động, máy tính tự cập nhật. Nếu realtime gián đoạn, ứng dụng tải lại mỗi phút hoặc khi quay lại cửa sổ.
8. Ma trận 12 tháng hiển thị dữ liệu riêng từng tháng; ngày 31 trong tháng ngắn tự đánh dấu hạn dự kiến. Khi dời thứ Sáu sang tháng trước, kỳ nghĩa vụ vẫn giữ nguyên. Lịch/ma trận ngày không đặt khoản đó vào một ngày sai của tháng hiện tại.
9. Đóng/mở lại trình duyệt: dữ liệu còn nguyên.
10. Cài đặt & Sao lưu → Tải sao lưu JSON. Khôi phục trong giai đoạn thử và kiểm tra lại tổng tiền. Khôi phục thay thế thẻ/nghĩa vụ/giao dịch/cấu hình hiện tại, giữ nhật ký hiện có và ghi thêm thao tác RESTORE. Không khôi phục thông báo cũ hoặc toàn bộ nhật ký từ máy khác.
11. Đăng xuất rồi thử tài khoản khác: không thấy dữ liệu của tài khoản đầu.
12. Sau khi đạt, xóa thẻ thử rồi nhập danh mục thật từ Excel/CSV. Mặc định thêm vào danh mục. Nếu chọn thay thế, phải sao lưu trước: thao tác sẽ xóa thẻ, nghĩa vụ và giao dịch cũ của tài khoản.

## Email nhắc ngoài ứng dụng — phần tùy chọn nâng cao

Thông báo trong ứng dụng và email là hai cơ chế khác nhau. Bản nền tảng chạy được mà không cần email. Không nhập SMTP hay mật khẩu email vào giao diện.

Có mã gửi bản tin ở `supabase/functions/send-digest/index.ts`. Hàm dùng Resend, kiểm tra bí mật CRON_SECRET, giữ trạng thái PENDING khi lỗi tạm thời, dùng mã chống gửi lặp và chỉ đánh dấu SUCCESS khi nhà cung cấp chấp nhận. Đây không phải xác nhận email đã vào hộp thư.

Chỉ cấu hình phần này sau khi website và dữ liệu đã chạy ổn định. Cần tài khoản Resend và địa chỉ gửi hợp lệ. Nếu cần tên miền gửi riêng, chi phí tên miền nằm ngoài gói miễn phí. Với địa chỉ thử nghiệm của nhà cung cấp, giới hạn người nhận cần được kiểm tra trên tài khoản thực tế.

1. Supabase → Edge Functions → Secrets: thêm RESEND_API_KEY, EMAIL_FROM, APP_URL và CRON_SECRET là chuỗi ngẫu nhiên dài. Các biến này chỉ ở máy chủ, không ở Vercel frontend.
2. Tạo Edge Function `send-digest`, dùng mã index.ts. Tắt kiểm tra JWT tích hợp cho hàm này theo config.toml, vì hàm kiểm tra CRON_SECRET riêng. Nếu dùng CLI: `supabase functions deploy send-digest --no-verify-jwt`.
3. SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY được môi trường Edge Functions cung cấp. Không sao chép các giá trị này lên frontend.
4. Trong SQL Editor, đọc `supabase/03_EMAIL_TUY_CHON.sql`, thay URL bằng URL hàm vừa deploy và thay CRON_SECRET bằng đúng bí mật đã cấu hình. Không chạy tệp còn nguyên placeholder.
5. Tệp này tạo bí mật trong Vault và lịch gọi phía máy chủ; khi cấu hình lại, cập nhật bí mật Vault hiện có thay vì tạo trùng tên.
6. Cài đặt ứng dụng → nhập email nhận → bật hàng đợi email → lưu.
7. Thử gửi trong lúc website đóng, kiểm tra Edge Function Logs và hộp thư. Bản tin mặc định không chứa số tiền; anh mở website để xem số liệu mới nhất.
8. Nếu email bị đánh dấu FAILED, kiểm tra cấu hình trước; các email lỗi cố định không tự gửi lại. Bản tin cũ hơn 24 giờ không được gửi. Nếu không cần email, giữ emailEnabled = false.

## Các lỗi thường gặp

| Biểu hiện | Cách xử lý |
|---|---|
| Chưa nhập thông tin kết nối | Kiểm tra tên hai biến VITE_, giá trị URL/Publishable key, rồi Redeploy |
| Chưa tạo cơ sở dữ liệu / Could not find function | Chạy đầy đủ tệp 01 trong đúng dự án Supabase |
| Invalid login credentials | Kiểm tra tài khoản trong Authentication → Users; dùng mật khẩu người dùng, không phải mật khẩu database |
| Connection gián đoạn | Kiểm tra internet và trạng thái Supabase; app_changes phải được bật trong publication supabase_realtime; RLS vẫn phải giữ |
| Upload GitHub chỉ có một file ZIP | Giải nén và tải các tệp mã nguồn đúng cấu trúc |
| Vercel không tìm thấy package.json | Root Directory chưa trỏ đúng thư mục mã nguồn |
| Không nhận email | Chưa hoàn thành phần Edge Function/Resend/lịch gửi hoặc email đang PENDING/FAILED; chỉ bật checkbox chưa đủ |
| SQL tệp 02 báo pg_cron chưa bật | Bật Cron/pg_cron trong Supabase Integrations/Extensions rồi chạy lại tệp 02 |

## Phạm vi kiểm tra của bộ cài

Mã nguồn đã được kiểm tra biên dịch TypeScript và build Vite. Bộ kiểm thử chạy trên PostgreSQL cục bộ bằng PGlite, kiểm tra nghiệp vụ, rollback, không vượt nghĩa vụ, kiểm soát truy cập và sao lưu. Chưa chạy kiểm tra giao diện trên trình duyệt trong môi trường này. Cần kiểm tra các màn hình trên máy tính và điện thoại sau khi triển khai.

Chưa triển khai hoặc kiểm tra với dự án Supabase/Vercel thực tế của anh. Lịch pg_cron, realtime qua mạng và email cần được xác nhận sau khi anh cấu hình. Không đảm bảo chi phí 0 đồng mãi mãi hoặc hoạt động không gián đoạn trên các gói miễn phí.

## Chạy cục bộ cho người hỗ trợ kỹ thuật

Cài Node.js LTS phù hợp với các phiên bản trong package-lock.json, sau đó `npm ci`. Sao chép `.env.example` thành `.env.local`, điền URL và Publishable key. `npm run dev` để chạy, `npm run build` để biên dịch, `npm test` để chạy kiểm thử. Không chứa máy chủ Express hoặc Firebase; các thao tác ghi được xử lý trong RPC SQL với khóa giao dịch theo người dùng.

Nguồn kỹ thuật chính: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs ; https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/realtime/postgres-changes ; https://supabase.com/docs/guides/cron ; https://vercel.com/docs/frameworks/frontend/vite .
