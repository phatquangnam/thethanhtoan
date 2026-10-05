# Sổ theo dõi thanh toán thẻ

React + Vite + Tailwind + Supabase Auth/Postgres/Realtime. Triển khai Vercel.

Bắt đầu bằng `HUONG_DAN_CAI_DAT.md` hoặc mở `HUONG_DAN_MINH_HOA.html` trong trình duyệt.

Tạo database: supabase/01_TAO_CO_SO_DU_LIEU.sql.
Bật lịch thông báo trong ứng dụng: supabase/02_BAT_LICH_NHAC.sql.
Email là phần tùy chọn, xem hướng dẫn. Không đưa Secret key vào VITE_.

Không có dữ liệu mẫu tự động. Tạo user trong Supabase Authentication → Users, đăng nhập và nhập thẻ.

Kiểm thử: npm ci && npm test.
Build: npm run build.
