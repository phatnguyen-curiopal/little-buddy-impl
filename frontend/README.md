# Little Buddy: console kiểm thử dev

Trang web để bấm thử mọi tính năng của backend từ trình duyệt. Đây **không**
phải dashboard phụ huynh của sản phẩm; nó gom cả ba phía (phụ huynh, thiết bị
mô phỏng, vận hành) vào một trang để thấy chúng tương tác với nhau.

## Chạy

Backend phải đang chạy ở `http://localhost:3000` (xem `backend/README.md`).

```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173
npm test             # kiểm tra bộ ký chữ ký với vector chuẩn của backend
npm run build        # build tĩnh vào dist/
```

Backend không bật CORS, nên dev server của Vite proxy các tiền tố `/api`,
`/admin`, `/healthz`, `/v1` (kể cả WebSocket `/v1/stream`) sang backend cùng
origin. Trỏ sang backend khác bằng biến `BACKEND_URL`.

## Ba làn

**Parent** (`/api`): đăng nhập (điền sẵn tài khoản demo từ `npm run seed`),
đăng ký, `/api/me`, làm mới token (có ô "dùng lại refresh token cũ" để thấy
`refresh_token_reused` thu hồi toàn bộ phiên), đăng xuất; thêm và liệt kê trẻ;
ghép thiết bị bằng mã in trên thẻ; bảng thiết bị với gán trẻ, tạm dừng, bật
lại, gỡ ghép, và nút Simulate đưa `device_id` sang làn Toy.

**Toy** (`/v1`): dán `device_id` và `secret_hex` (từ output của `npm run seed`
hoặc manifest nhà máy). Trang ký từng request bằng WebCrypto đúng như firmware
(HMAC-SHA256 trên chuỗi canonical LB1), heartbeat theo chu kỳ server trả về
(5 s khi chưa ghép, 60 s khi đã ghép), tự sửa lệch giờ từ `server_time`, và mở
WebSocket `/v1/stream` với chữ ký trong query string. Ô "deliberate skew" để cố
tình gây `auth_ts_skew` và xem lần thử lại tự động. Khi phụ huynh hoặc vận hành
tắt thiết bị trong lúc stream đang mở, socket bị đóng với mã `4003`.

**Admin** (`/admin`): token vận hành (mặc định dev điền sẵn), danh sách lô, tìm
thiết bị theo trạng thái / lô / gia đình, tắt cưỡng bức, bật, thu hồi, cấp lại
mã ghép (hiển thị một lần, không ghi vào log request, có nút gửi thẳng sang ô
ghép của làn Parent).

Bảng **Requests** bên phải ghi mọi request: method, đường dẫn, mã trạng thái,
thời gian, và body request / response khi bấm vào.

## Đi một vòng

1. `npm run seed` ở backend, giữ lại output.
2. Parent: Login. Bảng thiết bị hiện đồ chơi đã ghép, trẻ `Bông`.
3. Claim: dán mã của đồ chơi chưa ghép, chọn `Bông`.
4. Toy: dán `device_id` và `secret_hex` của đồ chơi đã ghép, Start. Log hiện
   `GET /v1/time 200` rồi `POST /v1/heartbeat 200`, màn hình `:) normal face`.
5. Open stream: nhận `ready`; Ping: `pong`; gửi 50 khung audio.
6. Parent: Pause đồ chơi đang stream. Toy: socket đóng `4003 disabled`,
   heartbeat kế tiếp trả `disabled`. Resume, mở lại stream.
7. Admin: Force disable; Parent Resume bị từ chối (`disabled_by_operator`);
   Admin Enable.
8. Parent: Unpair; Admin lọc `provisioned`, Reissue claim code, gửi sang Parent,
   ghép lại.
9. Admin: Revoke (`lost`); Toy trên thiết bị đó nhận `403 device_revoked`.

## Lưu ý

- Bí mật dán vào trang chỉ nằm trong `sessionStorage` của tab này.
- Giới hạn tần suất của backend áp dụng cho console: đăng ký 5 lần/giờ mỗi IP,
  đăng nhập 10 lần/15 phút, ghép 10 lần/giờ mỗi phụ huynh, xác thực thiết bị
  hỏng 30 lần/phút mỗi thiết bị. Dùng tài khoản demo thay vì đăng ký nhiều lần.
- `frontend/src/signing.js` phải giữ tương thích từng byte với
  `backend/devices/signing.js`; cả hai được kiểm tra bằng cùng một fixture
  (`backend/tests/fixtures/hmac_vectors.json`).
