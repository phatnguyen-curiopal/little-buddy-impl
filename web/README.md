# Little Buddy: website cho phụ huynh

Trang giới thiệu sản phẩm (`/`) và bảng điều khiển cho phụ huynh sau khi đăng
nhập (`/app`). Song ngữ tiếng Việt và tiếng Anh. Khác với `frontend/` (console
kiểm thử nội bộ), đây là sản phẩm dành cho phụ huynh.

## Chạy

Backend phải đang chạy ở `http://localhost:3000` (xem `backend/README.md`).

```powershell
cd web
npm install
npm run dev          # http://localhost:5174
npm test             # kiểm tra logic thuần: route, thống kê, định dạng, cảm xúc, đủ bản dịch
npm run build        # build tĩnh vào dist/
```

Backend không bật CORS: dev server proxy `/api` sang backend cùng origin. Khi
triển khai thật, reverse proxy làm việc tương tự. Trỏ sang backend khác bằng
biến `BACKEND_URL`.

## Trang

| Đường dẫn | Nội dung |
|---|---|
| `/` | Trang giới thiệu: hero có Buddy tương tác (tự đổi khuôn mặt khi rảnh, chạm nút để thử), cách hoạt động, 14 cảm xúc, tính năng, an toàn, bảng giá (lấy từ API), hỏi đáp |
| `/login`, `/register` | Đăng nhập, tạo tài khoản gia đình (tặng 10 lượt) |
| `/app` | Tổng quan: số lượt còn lại, biểu đồ câu trả lời 7 ngày, đồ chơi, hoạt động gần đây |
| `/app/toys` | Đồ chơi; bấm vào một Buddy để mở bảng chi tiết (cho nghỉ, đánh thức, đổi bé, gỡ khỏi gia đình) |
| `/app/credits` | Mua lượt (thanh toán demo), lịch sử giao dịch |
| `/app/activity` | Câu trả lời của Buddy và lý do khi Buddy không trả lời |
| `/app/family` | Các bé, tài khoản, ngôn ngữ, đăng xuất |

Vào `/app/...` khi chưa đăng nhập sẽ chuyển tới `/login?next=...` rồi quay lại
sau khi đăng nhập (chỉ chấp nhận đường dẫn trong `/app`).

## Micro: chạm để bật, Buddy tự biết khi bé nói xong

Micro là công tắc, không phải giữ để nói. Bé chạm nút một lần rồi nói; đồ chơi
tự nhận ra khoảng lặng khi bé ngừng nói (VAD trên thiết bị) và kết thúc lượt.
Chạm lần nữa khi Buddy đang nghe cũng kết thúc lượt. Hero trên trang giới thiệu
mô phỏng đúng hành vi này.

## Cảm xúc của Buddy

14 cảm xúc, mỗi cảm xúc có chuyển động riêng (`src/components/Face.jsx`,
`src/styles/motion.css`): `neutral`, `listening`, `thinking`, `happy`,
`excited`, `laughing`, `love`, `curious`, `surprised`, `wink`, `shy`,
`confused`, `sad`, `sleepy`. Giá trị lạ hiển thị `neutral`. Backend hiện gửi
`listening`, `happy`, `sleepy`, `confused`; các cảm xúc còn lại dùng khi có mô
hình thật. Danh sách giống `backend/docs/device_auth.md` mục 7.

## Hiệu ứng

Chỉ giữ hiệu ứng thuộc về cách một thành phần hoạt động; không có hiệu ứng khi
trang hay nội dung vừa tải (không trượt vào, không hiện dần khi cuộn, cột biểu
đồ đứng yên, số lượt hiện ngay).

Hiệu ứng được giữ: Buddy ở hero lơ lửng, tự đổi khuôn mặt khoảng mỗi 3 giây khi
rảnh, mắt nhìn theo con trỏ, và chạy thử một lượt hỏi khi chạm nút; mọi chuyển
động của khuôn mặt; ký hiệu và ánh sáng nền ở hero; thẻ nhấc lên khi rê chuột,
thẻ giá nghiêng theo chuột; số lượt đếm khi thay đổi (sau khi mua); hộp thoại,
ngăn kéo, thông báo và pháo giấy khi mua lượt hoặc thêm đồ chơi. Tất cả tắt khi
hệ điều hành bật "giảm chuyển động".

## Cấu trúc

```
src/lib/        routes (thuần), router, api (token + refresh), auth, i18n, translate, format, stats, emotions, motion
src/i18n/       vi.js, en.js (mọi câu chữ)
src/components/ Face, Toy, Confetti, ui (Layer, Toast, Pill, LangSwitch...)
src/marketing/  MarketingPage
src/auth/       AuthPage
src/dashboard/  AppShell, screens, layers (drawer, thêm đồ chơi, mua lượt), WeekChart, parts, data
src/styles/     tokens, base, motion, marketing, app
tests/          node --test cho các module thuần
```

## Lưu ý

- Refresh token được lưu trong `localStorage` để phụ huynh không phải đăng nhập
  lại mỗi lần mở trang; access token chỉ nằm trong bộ nhớ. Khi lên production
  nên chuyển refresh token sang cookie httpOnly.
- Không dùng thư viện router, hiệu ứng hay UI: chỉ React. Router nhỏ ở
  `src/lib/router.js`.
- Thêm câu chữ mới: thêm khoá vào cả `vi.js` và `en.js`; `npm test` báo lỗi nếu
  thiếu khoá ở một ngôn ngữ hoặc code dùng khoá không tồn tại.
