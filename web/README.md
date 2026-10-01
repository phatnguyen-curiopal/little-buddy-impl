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
npm test             # kiểm tra logic thuần: route, thống kê, định dạng, cảm xúc, đủ bản dịch, chữ ký LB1, âm thanh, VAD, máy trạng thái
npm run build        # build tĩnh vào dist/
```

Backend không bật CORS: dev server proxy `/api` và `/v1` (kể cả WebSocket
`/v1/stream`, `ws: true`) sang backend cùng origin. Khi triển khai thật,
reverse proxy làm việc tương tự (nhớ chuyển tiếp cả WebSocket). Trỏ sang
backend khác bằng biến `BACKEND_URL`.

## Trang

| Đường dẫn | Nội dung |
|---|---|
| `/` | Trang giới thiệu: hero có Buddy tương tác (tự đổi khuôn mặt khi rảnh, chạm nút để thử), cách hoạt động, 14 cảm xúc, tính năng, an toàn, bảng giá (lấy từ API), hỏi đáp |
| `/login`, `/register` | Đăng nhập, tạo tài khoản gia đình (tặng 10 lượt) |
| `/app` | Tổng quan: số lượt còn lại, biểu đồ câu trả lời 7 ngày, đồ chơi, hoạt động gần đây |
| `/app/toys` | Đồ chơi; bấm vào một Buddy để mở bảng chi tiết (hồ sơ và sửa hồ sơ, cài đặt trò chuyện, cho nghỉ, đánh thức, đổi bé, gỡ khỏi gia đình, "Trò chuyện với {tên}") |
| `/app/talk?toy=<id>` | Trò chuyện với Buddy ngay trên trình duyệt (trình duyệt đóng vai đồ chơi). Chỉ hiện khi backend bật `WEB_TOY` |
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
`confused`, `sad`, `sleepy`. Giá trị lạ hiển thị `neutral`. Khi dùng brain, mô
hình tự gắn cảm xúc cho mỗi câu trả lời; chế độ mock chỉ gửi `listening`,
`happy`, `sleepy`, `confused`. Danh sách giống `backend/docs/device_auth.md` mục 7.

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

## Thêm Buddy và hồ sơ của Buddy

Thêm đồ chơi là một chuỗi màn hình, mỗi màn một việc:

1. Nhập mã in trên thẻ.
2. Chọn bé (hoặc "Để sau"). Bấm tiếp là **ghép ngay** với hồ sơ mặc định
   (Buddy / bạn thân / ENFP), nên mã sai bị phát hiện ở đây, trước khi làm hồ sơ.
3. Đặt tên (gợi ý sẵn vài tên, nút "Gợi ý tên khác" chọn ngẫu nhiên).
4. Cách Buddy xưng hô với bé: bạn thân (tớ, cậu), bố, mẹ, cô giáo (con).
5. Tính cách: **làm trắc nghiệm** 12 câu về người bạn mình muốn cho bé, mỗi câu
   một màn (3 câu mỗi trục E/I, S/N, T/F, J/P, số lẻ nên luôn có đa số), hoặc
   **tự chọn** trong 16 tính cách chia 4 nhóm.
6. Xem lại, "Sửa" từng mục, rồi "Lưu hồ sơ" (một lệnh `PATCH`).

Huỷ giữa chừng:

- Trước bước 2: không có gì được ghi, đồ chơi vẫn chưa được ghép.
- Đang gửi yêu cầu: không đóng được cửa sổ.
- Từ bước 3 đến 6: đóng (✕, Esc, bấm ra ngoài, "Để sau") sẽ hỏi lại. "Làm tiếp"
  quay lại, "Lưu và đóng" lưu những gì đã chọn (nếu có thay đổi). Đồ chơi đã
  thuộc gia đình, hồ sơ hoàn tất sau được trong bảng chi tiết.
- Mất phản hồi khi ghép: gửi lại mã sẽ nhận lại đúng đồ chơi (backend coi là
  thao tác lặp lại của cùng gia đình).

Bảng chi tiết của đồ chơi sửa hồ sơ trên một trang. Logic thuần (câu hỏi, chấm
điểm, gợi ý tên) ở `src/lib/personality.js`, giao diện ở
`src/dashboard/profile.jsx`, trình tự các bước ở `AddToyModal` trong
`src/dashboard/layers.jsx`.

### Cài đặt trò chuyện (trong bảng chi tiết)

Phần "Khi trò chuyện" dưới hồ sơ, lưu cùng lệnh `PATCH /api/devices/:id/profile`:

- **Ngôn ngữ trò chuyện** (Tiếng Việt / English): ngôn ngữ Buddy nói và nghe,
  không phụ thuộc ngôn ngữ giao diện của trang web.
- **Giọng nói**: danh sách từ `GET /api/voices`. "Mặc định" gửi `voice_id: null`,
  nên khi đổi giọng mặc định ở máy chủ, mọi Buddy chưa chọn giọng đều theo.
- **Học từ các cuộc trò chuyện**: mặc định tắt. Tắt thì Buddy không lưu gì
  bé nói.
- **Tâm trạng của Buddy**: "Tự động" (mỗi ngày Buddy tự có tâm trạng) hoặc
  "Ghim" với thanh trượt 0 đến 100. Tâm trạng ghim giữ nguyên cho đến khi chọn
  lại "Tự động" (gửi `mood_pin: null`).

Chuỗi màn hình thêm đồ chơi không hỏi những mục này: Buddy mới dùng giá trị
mặc định. Giá trị mặc định và kiểm tra nằm ở `src/lib/toySettings.js`.

## Trò chuyện với Buddy trên web (`/app/talk`)

Trình duyệt đóng vai đồ chơi: nó nói đúng giao thức thiết bị như firmware
(`backend/docs/device_auth.md`), nên cổng kiểm tra lượt, lượt hỏi và hội
thoại là thật. Mỗi câu trả lời trừ 1 lượt như Buddy thật; lượt bị từ chối,
bé không nói gì, hay huỷ giữa chừng thì không trừ.

- **Khoá bí mật của đồ chơi**: lấy qua `POST /api/devices/:id/secret` (chỉ gia
  đình sở hữu, chỉ khi Buddy đang thức). Chỉ giữ trong bộ nhớ của trang, mất
  khi tải lại trang và bị xoá khi đăng xuất. Không bao giờ ghi vào
  `localStorage` hay log.
- **Kết nối**: trước mỗi lần kết nối đều hỏi `/v1/time` để chữ ký không lệch
  giờ, rồi mở `/v1/stream` đã ký (chữ ký nằm trong query string, giống
  firmware). **Không gửi heartbeat**, nên "kết nối lần cuối" và phiên bản phần
  mềm trên bảng điều khiển vẫn là của đồ chơi thật.
- **Mất kết nối**: thử lại tối đa 3 lần (chờ 1, 2, 4 giây), sau đó xin lại khoá
  bí mật một lần (có thể khoá đã được đổi), rồi mới báo lỗi kèm nút "Kết nối
  lại".
- **Cho nghỉ trong lúc trò chuyện**: máy chủ đóng socket với mã 4003. Buddy
  hiện khuôn mặt buồn ngủ, không tự kết nối lại; khi Buddy được đánh thức,
  trang tự kết nối.
- **Micro là công tắc**: chạm nút xanh để mở micro, Buddy tự nhận ra khi bé
  ngừng nói (khoảng lặng 1,3 giây sau khi đã nói), hoặc bé chạm lần nữa. Nếu
  8 giây không ai nói, lượt được trả lại (không trừ lượt). Mỗi lượt tối đa
  khoảng 2 phút. Chạm trong lúc Buddy đang nghĩ thì bỏ qua; chạm khi Buddy
  đang nói thì Buddy thôi nói và nghe câu mới.
- **Âm thanh gửi đi**: `getUserMedia` với khử tiếng vọng và lọc ồn; một
  AudioWorklet (module tạo từ Blob ngay trong trang) lọc thông thấp, hạ mẫu
  xuống 16 kHz Int16 và cắt thành khung 640 byte (20 ms). Khung chỉ được gửi
  sau `turn_accepted`; phần bé nói ngay lúc chạm được giữ tạm (tối đa 1 giây)
  rồi gửi bù. Vòng sáng quanh nút theo âm lượng micro.
- **Âm thanh nhận về**: `answer` (kèm `heard`, câu Buddy nghe được), rồi
  `audio`, các khung PCM16, `audio_end`, rồi `turn_done`. AudioContext được
  bật khi chạm nút hoặc bấm Gửi (trình duyệt chỉ cho phát âm thanh sau một
  thao tác của người dùng).
- **Cửa sổ trò chuyện**: bong bóng câu bé nói (lượt nói hiện câu Buddy nghe
  được, để phát hiện nghe nhầm) và câu Buddy trả lời, dấu ba chấm khi Buddy
  đang nghĩ, ô nhắn tin, nút "Cuộc trò chuyện mới", chọn Buddy (khi có hơn một
  Buddy đang thức), đổi ngôn ngữ trò chuyện và số lượt còn lại. Sau mỗi lượt,
  dữ liệu gia đình được tải lại (số lượt, Hoạt động).

**Cần secure context**: trình duyệt chỉ cho dùng micro và WebCrypto (để ký
kết nối `/v1/stream`) trên `https://` hoặc `http://localhost`. Mở trang qua
địa chỉ IP trong mạng LAN bằng `http://` thì không trò chuyện được, cả nói lẫn
nhắn tin: trang báo rõ và không xin khóa bí mật của đồ chơi. Trên secure
context mà trình duyệt thiếu micro hoặc AudioWorklet thì vẫn nhắn tin được.

Logic thuần có test: `src/talk/signing.js` (bản sao của
`frontend/src/signing.js`, kiểm tra với `backend/tests/fixtures/hmac_vectors.json`),
`src/talk/dsp.js` (lọc, hạ mẫu, cắt khung, giải mã PCM), `src/talk/vad.js`
(nhận biết hết câu), `src/talk/machine.js` (máy trạng thái, kế hoạch kết nối
lại). Phần gắn với trình duyệt: `src/talk/useWebToy.js`, `mic.js`, `player.js`;
giao diện ở `src/dashboard/Talk.jsx`; thân đồ chơi dùng chung với hero ở
`src/components/ToyShell.jsx`.

## Cấu trúc

```
src/lib/        routes (thuần), router, api (token + refresh), auth, i18n, translate, format, stats, emotions, motion, personality, toySettings
src/i18n/       vi.js, en.js (mọi câu chữ)
src/components/ Face, Toy (hero), ToyShell (thân đồ chơi dùng chung), Confetti, ui (Layer, Toast, Pill, LangSwitch...)
src/talk/       đồ chơi trên web: signing, dsp, vad, machine (thuần), useWebToy, mic, player
src/marketing/  MarketingPage
src/auth/       AuthPage
src/dashboard/  AppShell, screens, Talk, layers (drawer, thêm đồ chơi, mua lượt), profile (hồ sơ, trắc nghiệm, cài đặt trò chuyện), WeekChart, parts, data
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
