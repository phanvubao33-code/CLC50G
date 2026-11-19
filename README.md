# Ký ức chúng ta

Trang kỷ yếu một trang, giao diện tiếng Việt, cùng CMS riêng tại `/admin/`. Trang công khai không hiển thị nút quản trị. Ảnh được lưu ở Cloudflare R2; nội dung và siêu dữ liệu ảnh nằm trong D1.

## Chạy tại máy

1. Cài Node.js và đăng nhập Cloudflare Wrangler (`npx wrangler login`).
2. Tạo file `.dev.vars` từ `.dev.vars.example`, rồi đổi email và mật khẩu mẫu thành thông tin riêng cho môi trường thử nghiệm.
3. Chạy migration D1 cục bộ và mở trang:

   ```sh
   npx wrangler d1 migrations apply our-memories --local
   npx wrangler pages dev ./public
   ```

   Mở trang công khai ở `http://localhost:8788/` và trang quản trị ở `http://localhost:8788/admin/`.

## Cấu hình Cloudflare

1. Tạo Pages project, D1 database và R2 bucket riêng tư:

   ```sh
   npx wrangler pages project create <ten-pages-project>
   npx wrangler d1 create our-memories
   npx wrangler r2 bucket create our-memories-images
   ```

2. Thay `database_id` mẫu trong `wrangler.toml` bằng ID D1 vừa tạo. Giữ tên binding `DB` và `IMAGES` như hiện tại.
3. Tạo R2 API token có quyền đọc/ghi bucket để Worker ký URL PUT ngắn hạn. Đặt thêm các secrets sau (không đặt `CMS_R2_PRESIGN_MODE=local` ở production):

   ```sh
   npx wrangler pages secret put CMS_R2_ACCOUNT_ID --project-name <ten-pages-project>
   npx wrangler pages secret put CMS_R2_ACCESS_KEY_ID --project-name <ten-pages-project>
   npx wrangler pages secret put CMS_R2_SECRET_ACCESS_KEY --project-name <ten-pages-project>
   ```

4. Cấu hình CORS của bucket để cho phép `PUT` và `Content-Type` từ Pages domain và domain riêng. Sao chép `r2-cors.example.json`, thay domain mẫu, rồi chạy:

   ```sh
   npx wrangler r2 bucket cors set our-memories-images --file r2-cors.json
   ```

5. Áp dụng schema, đặt thông tin đăng nhập admin, rồi deploy:

   ```sh
   npx wrangler d1 migrations apply our-memories --remote
   npx wrangler pages secret put CMS_ADMIN_USERNAME --project-name <ten-pages-project>
   npx wrangler pages secret put CMS_ADMIN_PASSWORD --project-name <ten-pages-project>
   npx wrangler pages deploy ./public --project-name <ten-pages-project>
   ```

   Wrangler sẽ hỏi giá trị từng secret trong terminal. Dùng username `vubao07` và mật khẩu của bạn; mật khẩu cần ít nhất 16 ký tự. Không ghi mật khẩu vào mã nguồn hay commit `.dev.vars`.

## CMS

- Đăng nhập tại `/admin/` bằng `CMS_ADMIN_USERNAME` và `CMS_ADMIN_PASSWORD` đã đặt trong Cloudflare Secrets. Đăng nhập thành công sẽ tự cấp quyền `admin` cho tài khoản trên D1; không cần luồng đăng ký. Mật khẩu chỉ được giữ trong Cloudflare Secret, không lưu vào mã nguồn.
- Chọn, thay hoặc xóa ảnh JPEG, PNG, WebP tối đa 12 MB. Worker cấp URL PUT có chữ ký hết hạn sau 5 phút; trình duyệt tải thẳng lên R2. Worker xác thực phiên, hạn mức, MIME và chữ ký tệp trước khi sao chép sang khóa ảnh bất biến và cập nhật D1.
- Chỉnh chú thích, ngày tháng và điểm lấy nét ảnh; vị trí ngang/dọc dùng phần trăm.
- Thêm, sửa, xóa và sắp xếp khoảnh khắc, mốc hành trình, thành viên và lời nhắn.
- Chỉnh lời mở đầu và đoạn kết. Các thay đổi xuất hiện trên trang công khai qua API D1.

## Bảo mật và triển khai

- Phiên quản trị được ký bằng token ngẫu nhiên, lưu dạng băm trong D1 và gửi bằng cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- API quản trị kiểm tra phiên ở máy chủ và từ chối yêu cầu ghi khác origin. Đăng nhập giới hạn số lần thử theo địa chỉ IP đã băm.
- Bucket R2 giữ riêng tư. URL tải lên chỉ cho phép PUT vào một object tạm với hạn dùng ngắn; Worker kiểm tra object bằng binding R2 rồi mới gắn vào metadata D1. Worker chỉ phân phối object hoàn tất đang được một ô ảnh tham chiếu.
- Các object tải chưa hoàn tất nằm dưới tiền tố `pending/`. Có thể đặt lifecycle rule xóa tiền tố này sau một ngày để thu dọn trường hợp người dùng đóng trang giữa lúc tải.
- Repo `CLC50G` có thư mục dự án ngay tại gốc repo. Khi kết nối Cloudflare Pages trực tiếp với repo này, để **Root directory** trống và đặt **Build output directory** là `public`. Đây là trang HTML/CSS/JS tĩnh, không có bước build. Nếu Cloudflare yêu cầu Build command để chạy Pages Functions, dùng `exit 0`; không dùng `wrangler pages deploy` làm Build command vì đó là lệnh deploy thủ công.
- `wrangler.toml` khai báo D1 và R2 làm nguồn cấu hình cho Pages Functions. Trước khi deploy production, tạo database/bucket thật, thay `database_id` mẫu bằng D1 ID thật và giữ bucket name khớp với R2 bucket đã tạo. Thiếu binding thật sẽ làm Functions không hoạt động hoặc khiến cấu hình deploy bị từ chối.
- Lệnh `npx wrangler pages deploy ./public --project-name <ten-pages-project>` ở trên chỉ dùng khi tự deploy thủ công bằng Wrangler CLI. Nếu dùng Git integration, push commit lên `main` để Cloudflare tự deploy theo build settings.

Khi chưa có bindings hoặc migration, trang công khai vẫn hiện nội dung mẫu và placeholder; CMS sẽ báo chưa cấu hình thay vì giả vờ lưu dữ liệu.

### Kiểm thử phát triển cục bộ

`CMS_R2_PRESIGN_MODE=local` trong `.dev.vars.example` mô phỏng URL PUT có chữ ký ngắn hạn trên binding R2 cục bộ. Chế độ này chỉ dành cho `wrangler pages dev`; production phải dùng API credentials R2 và endpoint S3 thật.
