# Kết quả kiểm tra bộ triển khai

Ngày hoàn thiện: 05/10/2026.

16 tình huống kiểm thử nghiệp vụ và cơ sở dữ liệu đã đạt. PostgreSQL được thực thi cục bộ bằng PGlite với mô phỏng auth.uid và vai trò anon/authenticated. Nội dung bao gồm: nghĩa vụ từng tháng, ngày cuối tháng/năm nhuận, dời hạn sang tháng trước, chưa cập nhật/không phát sinh, nhiều lần thanh toán, chặn trả vượt, chặn sửa nghĩa vụ thấp hơn số đã trả, chống lặp khi thử lại giao dịch, lý do hủy, rollback cập nhật hàng loạt và nhập thay thế, nhắc không trùng, dự đoán từ lịch sử, sao lưu/khôi phục, revision khi xóa và RLS giữa hai người dùng. Kiểm tra tổng hợp dòng tiền theo ngày thực chi khác kỳ nghĩa vụ, ma trận đúng ngày và múi giờ Việt Nam.

TypeScript và build Vite đạt. Các thư viện lớn được chia thành các gói riêng. Chưa chạy kiểm tra trình duyệt vì môi trường không có trình duyệt cục bộ phù hợp. Không dùng dự án hay mật khẩu của người dùng.

Chưa kiểm tra kết nối với Supabase/Vercel thực tế, publication realtime qua mạng, extension pg_cron trên tài khoản người dùng hoặc email Resend. Phần email là tùy chọn, cần cấu hình và thử riêng. Ứng dụng không cam kết hoạt động liên tục trên gói miễn phí. Không có chức năng tự truy cập ngân hàng, đọc sao kê ngân hàng hoặc tự chuyển tiền.
