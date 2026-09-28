# Hướng dẫn đưa Sổ theo dõi thanh toán thẻ lên website

Bản này dùng Vercel để chạy giao diện và API, Supabase Auth để đăng nhập, Supabase PostgreSQL để lưu dữ liệu. Khi mở cùng một tài khoản trên hai thiết bị, các thay đổi sẽ được báo qua Supabase Realtime và màn hình tự tải lại. Chưa có website trực tuyến sẵn; anh cần tạo hai tài khoản dịch vụ và làm theo các bước dưới đây.

## Trước khi bắt đầu

Anh cần một email để đăng ký Supabase, Vercel và GitHub; máy Windows có trình duyệt, phần mềm giải nén ZIP và GitHub Desktop. Nên lưu riêng tệp `So_lieu_cu_de_nhap.json` mà tôi cung cấp. Tệp này chứa dữ liệu thanh toán thật, **không đưa lên GitHub**, không chụp màn hình hoặc chia sẻ công khai. Bản ZIP mã nguồn mới không chứa `data/db.json` và không chứa dữ liệu thật.

Trong bản ZIP có `supabase/schema.sql`, `vercel.json`, `.env.example` và `api/index.ts`. Hãy giải nén ZIP thành một thư mục, chẳng hạn `book-card-credit-vercel`. Mỗi lần hướng dẫn nói “thư mục dự án” là thư mục có `package.json` ở ngay bên trong.

## 1. Tạo Supabase

1. Mở [supabase.com](https://supabase.com/), chọn **Start your project**, đăng ký và tạo **New project**. Đặt tên dễ nhớ, ví dụ `so-the-ca-nhan`. Chọn vùng gần Việt Nam nếu giao diện cho phép. Đặt mật khẩu cơ sở dữ liệu mạnh và lưu ở trình quản lý mật khẩu. Mật khẩu này không phải mật khẩu đăng nhập ứng dụng.
2. Chờ dự án tạo xong. Trong menu trái chọn **SQL Editor**, chọn **New query**. Trên máy, mở `supabase/schema.sql` bằng Notepad, chọn toàn bộ nội dung, sao chép vào ô SQL rồi bấm **Run**. Cần thấy thông báo chạy thành công. SQL tạo nơi lưu dữ liệu riêng theo tài khoản, chính sách chỉ được xem tín hiệu realtime của chính mình, và bật realtime cho bảng `app_changes`.
3. Mở **Project Settings** → **API** (một số giao diện ghi **Connect** → **App Frameworks**). Ghi lại **Project URL** và **publishable key** (hoặc `anon` key). Hai giá trị này sẽ đi vào biến `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. **Không dùng `service_role` key**.
4. Chọn nút **Connect** của dự án Supabase, chọn **Transaction pooler**. Sao chép connection string PostgreSQL có cổng `6543`. Thay `[YOUR-PASSWORD]` bằng mật khẩu cơ sở dữ liệu đã đặt. Đây là `DATABASE_URL`. Nếu mật khẩu có ký tự đặc biệt như `@`, `#`, `/`, `:`, cần mã hóa URL; cách đơn giản khi mới thiết lập là chọn mật khẩu mạnh chỉ gồm chữ và số. **Chỉ đặt `DATABASE_URL` trong Vercel Environment Variables, không ghi nó vào tệp mã nguồn hay GitHub.**
5. Trong **Authentication** → **Providers**, bảo đảm **Email** được bật. Có thể để xác nhận email bật. Khi đăng ký trong ứng dụng, anh sẽ phải bấm liên kết trong email rồi mới đăng nhập. Ứng dụng không còn cách đăng nhập chỉ bằng email như bản cũ.

## 2. Đưa mã nguồn lên GitHub ở chế độ riêng tư

1. Cài [GitHub Desktop](https://desktop.github.com/) và đăng nhập tài khoản GitHub.
2. Trên máy, giải nén `book-card-credit-vercel.zip`. Kiểm tra thấy `package.json`, `server.ts`, `src`, `api`, `supabase` và `vercel.json` trong cùng thư mục. **Không chép `So_lieu_cu_de_nhap.json` hoặc tệp ZIP gốc vào thư mục này.**
3. Trong GitHub Desktop chọn **File** → **Add Local Repository** → **Choose** rồi chọn thư mục dự án. Nếu chương trình báo đây chưa phải repository, bấm **Create a repository** tại thư mục đó.
4. Ở khung thay đổi, kiểm tra danh sách không có `data/db.json`, tệp `.env.local`, hay tệp sao lưu dữ liệu. Chọn **Commit to main** rồi **Publish repository**. Chọn **Keep this code private** trước khi bấm Publish.

Tệp `.env.example` chỉ là mẫu ký hiệu, không có mật khẩu thật. Không sửa mẫu này để điền khóa thật rồi đẩy lên GitHub.

## 3. Kết nối Vercel và nhập ba biến cấu hình

1. Mở [vercel.com](https://vercel.com/), đăng nhập. Chọn **Add New** → **Project** → **Import Git Repository**. Nếu cần, cấp quyền Vercel nhìn thấy repository riêng tư vừa tạo.
2. Chọn đúng repository. Ở phần cấu hình, **Framework Preset: Vite**; **Root Directory:** để mặc định nếu `package.json` ở thư mục gốc; **Build Command:** `npm run build`; **Output Directory:** `dist`. Chưa bấm Deploy nếu chưa điền biến.
3. Mở **Environment Variables** và tạo đúng ba dòng sau. Mỗi dòng: ô Name là tên bên trái, ô Value là giá trị riêng anh đã ghi từ Supabase. Chọn ít nhất môi trường **Production**.

   | Name | Value lấy ở đâu | Có được đưa lên GitHub? |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL của Supabase | Chỉ khai báo ở Vercel |
   | `VITE_SUPABASE_ANON_KEY` | Publishable/anon key của Supabase | Chỉ khai báo ở Vercel |
   | `DATABASE_URL` | Connection string Transaction pooler cổng 6543, đã thay mật khẩu | **Tuyệt đối không** |

4. Bấm **Deploy**. Chờ dòng trạng thái **Ready**, mở địa chỉ dạng `https://ten-du-an.vercel.app`. Nếu trang báo thiếu biến môi trường, vào **Project** → **Settings** → **Environment Variables** kiểm tra chính tả, sau đó vào **Deployments** và bấm **Redeploy**. Biến `VITE_...` cần có mặt lúc build.
5. Quay lại Supabase → **Authentication** → **URL Configuration**. Đặt **Site URL** thành địa chỉ Vercel thực tế, ví dụ `https://ten-du-an.vercel.app`. Trong **Redirect URLs**, thêm địa chỉ đó với `/**` ở cuối nếu giao diện yêu cầu, ví dụ `https://ten-du-an.vercel.app/**`. Điều này giúp liên kết xác nhận email và đặt lại mật khẩu quay về đúng website.

Nếu dùng tên miền riêng về sau, thêm tên miền đó vào Redirect URLs rồi cập nhật Site URL tương ứng. Google sign-in đang ẩn theo mặc định; dùng email và mật khẩu là đủ để chạy.

## 4. Tạo tài khoản và chuyển dữ liệu cũ

1. Truy cập website Vercel vừa triển khai, chọn **Đăng ký**, nhập email, tên và mật khẩu tối thiểu 8 ký tự. Nếu Supabase yêu cầu xác nhận, mở email và bấm liên kết rồi trở lại website đăng nhập. Mật khẩu cũ của bản ứng dụng JSON không tự chuyển sang Supabase; đây là tài khoản mới.
2. Sau đăng nhập, vào **Cài đặt** → **Sao lưu & Quản lý dữ liệu** → **Phục hồi từ file JSON**. Chọn riêng tệp `So_lieu_cu_de_nhap.json` đã tải từ câu trả lời của tôi, xác nhận phục hồi. Trang sẽ tải lại.
3. Kiểm tra **Danh mục thẻ** có 40 thẻ, xem ma trận tháng và vài khoản đã trả. Tệp chuyển dữ liệu có 40 thẻ, 160 nghĩa vụ tháng, 32 khoản thanh toán, 57 mục nhật ký và 136 thông báo từ bản gốc. Không cần tự nhập lại các khoản này.
4. Sau khi kiểm tra, bấm **Tải file sao lưu JSON** để lấy bản sao lưu mới. Cất tệp này ở nơi riêng tư. Không đưa file sao lưu lên GitHub hoặc vào thư mục mã nguồn.

Phục hồi sẽ thay thế dữ liệu hiện có của tài khoản đang đăng nhập. Vì vậy, hãy thực hiện lần nhập dữ liệu cũ trước khi bắt đầu cập nhật khoản mới.

## 5. Kiểm tra cập nhật theo thời gian thực

Mở website trên máy tính và trên điện thoại, đăng nhập **cùng tài khoản**. Giữ cả hai trang đang mở. Trên máy tính, sửa một khoản cần thanh toán của tháng hiện tại rồi lưu. Trong vài giây, điện thoại sẽ tải lại số liệu; nếu chưa thấy, chuyển ra rồi quay lại tab để kích hoạt tải lại khi cửa sổ có tiêu điểm. Làm chiều ngược lại với ghi nhận thanh toán. Cuối cùng tải lại cả hai trang để chắc số liệu đã nằm trong cơ sở dữ liệu.

Nếu trang báo `401`, đăng xuất rồi đăng nhập lại. Nếu báo `503`, kiểm tra `DATABASE_URL`, SQL đã chạy thành công và trạng thái dự án Supabase. Nếu trang trắng, kiểm tra hai biến `VITE_...`, Redeploy, rồi mở lại. Nếu dữ liệu cập nhật sau tải lại nhưng không tự hiện ở thiết bị kia, kiểm tra SQL đã bật `app_changes` trong publication `supabase_realtime` và chính sách RLS đã tạo.

## Phạm vi hiện tại

Thông báo trong ứng dụng được kiểm tra khi mở app hoặc bấm **Chạy quét nhắc việc ngay**. Bản này chưa gửi email tự động và chưa gửi push notification khi website đóng. “Thời gian thực” nghĩa là dữ liệu giữa những trang đang mở đồng bộ qua Supabase Realtime. Ứng dụng lưu một tài liệu JSON cho mỗi tài khoản trong PostgreSQL, phù hợp quy mô sổ thẻ cá nhân này; các cập nhật cùng tài khoản được khóa trong giao dịch để tránh ghi đè.

Tôi đã kiểm tra mã bằng `npm run lint`, `npm run build`, và bộ nghiệp vụ 19/19 trường hợp. Việc triển khai thật và kiểm tra hai thiết bị cần Supabase và Vercel của anh; không nên coi website hoạt động hoàn chỉnh trước bước 5.

Tài liệu chính thức: [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Supabase kết nối PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase Auth](https://supabase.com/docs/guides/auth), [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
