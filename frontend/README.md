# Little Buddy: website cho phụ huynh

Trang giới thiệu sản phẩm (`/`) và bảng điều khiển cho phụ huynh sau khi đăng
nhập (`/app`). Song ngữ tiếng Việt và tiếng Anh. Đây là frontend duy nhất được
build và triển khai; các endpoint vận hành không có giao diện. Giao diện cũ
(trước khi làm lại theo kiểu game thú cưng biết nói) được giữ nguyên trong
`../frontend-legacy/` để tham khảo.

Trang chạy trên **backend-v2** (`../backend-v2/`), gọi mọi thứ dưới `/v2`.
Hợp đồng giữa hai bên (mọi lệnh gọi, dữ liệu trả về, mã lỗi, cách trang hiểu mô
hình của backend-v2 và giao thức của Buddy trên trình duyệt) nằm ở
[`docs/backend-v2.md`](docs/backend-v2.md).

## Giao diện

Lấy cảm hứng từ các game thú cưng biết nói, giữ nguyên bảng màu của trang
(`src/styles/tokens.css`):

- Buddy đứng trong căn phòng của mình (`src/components/Room.jsx`: tường chấm
  bi, cửa sổ ban đêm, sàn, tấm thảm dưới chân), xung quanh là các nút tròn.
- Nút và thẻ "đồ chơi": có viền đáy đậm, bấm vào thì lún xuống.
- Lượt hỏi hiện như bộ đếm đồng xu vàng, có nút cộng để mua thêm (khi backend
  cho mua).
- Phông chữ Baloo 2 (tiêu đề, nút) và Nunito (nội dung).
- Trên điện thoại: thanh trên cùng và thanh tab dưới đáy (Trang chủ, Đồ chơi,
  Trò chuyện, Chăm sóc, Lượt hỏi) với nút Trò chuyện tròn to ở giữa; Hoạt động
  mở từ "Xem tất cả" ở trang chủ, Gia đình từ thanh trên cùng. Từ 900px: thanh
  điều hướng bên trái có đủ mọi mục.
- Chế độ tối theo hệ điều hành.

## Chạy

Cần Node 23.6 trở lên cho backend-v2 (nó chạy thẳng file `.ts`).

```bash
cd backend-v2
npm install
npm run dev:lite     # API :3100, dịch vụ giọng nói :3101, worker; dữ liệu PGlite trong .pglite/
```

`dev:lite` không cần máy chủ PostgreSQL. Không có khoá OpenAI hay ElevenLabs
thì backend-v2 dùng `GATEWAY=fake`: mọi đoạn âm thanh dài hơn 0,1 giây đều
được "nghe" thành một câu cố định và Buddy trả lời bằng giọng giả, đủ để thử
trọn vòng trên trang. Xoá `.pglite/` để làm lại từ đầu.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5174
npm test             # logic thuần: route, lớp gọi API, Buddy, trình thêm Buddy, Chăm sóc, thống kê, định dạng, cảm xúc, đủ bản dịch, chữ ký, khung âm thanh, VAD, máy trạng thái, lịch phát giọng
npm run build        # build tĩnh vào dist/
```

backend-v2 không bật CORS: dev server proxy `/v2` sang API (`/v1`) và
WebSocket `/v2/device` sang dịch vụ giọng nói (`/v1/device`), cùng origin.
Trỏ sang chỗ khác bằng `BACKEND_V2_URL` và `BACKEND_V2_VOICE_URL`. Khoá proxy
của socket là biểu thức chính quy `^/v2/device(?:[?#]|$)`, vì một khoá thường
khớp theo tiền tố và sẽ đưa nhầm `GET /v2/devices` sang dịch vụ giọng nói.
Khi triển khai, nginx làm việc tương tự (`location /v2/` và
`location = /v2/device`, xem `../deploy/`).

## Trang

| Đường dẫn | Nội dung |
|---|---|
| `/` | Trang giới thiệu: hero có Buddy tương tác (tự đổi khuôn mặt khi rảnh, chạm nút để thử), cách hoạt động, 14 cảm xúc, tính năng, an toàn, bảng giá (lấy từ API), hỏi đáp |
| `/login`, `/register` | Đăng nhập bằng email và mật khẩu, tạo tài khoản gia đình (giai đoạn demo tặng 1000 lượt) |
| `/app` | Trang chủ: cảnh báo an toàn chưa xem của từng bé, căn phòng của Buddy, các đồ chơi, số lượt, biểu đồ câu trả lời 7 ngày, câu trả lời gần đây |
| `/app/toys` | Đồ chơi; "Quản lý" mở bảng chi tiết (Buddy và sửa Buddy, đổi nhân vật, cho nghỉ, đánh thức, gỡ khỏi gia đình, sang Chăm sóc, "Trò chuyện với {tên}") |
| `/app/talk?toy=<id>` | Trò chuyện với một Buddy sống trên trình duyệt. Chỉ hiện khi backend bật `web_toy` |
| `/app/care?child=<id>&tab=` | Chăm sóc, từng bé một: Điều Buddy biết, An toàn, Bản tin tuần, Quy tắc |
| `/app/credits` | Số lượt, các gói (mua bằng thanh toán demo khi backend cho), lịch sử giao dịch |
| `/app/activity` | Buddy đã làm gì với bé (kể chuyện, an ủi, chơi...), không bao giờ có lời bé nói |
| `/app/family` | Các bé (thêm bé, tuổi, ngôn ngữ, Buddy, đồ chơi, bước còn thiếu), tên gia đình, email, ngôn ngữ trang, đăng xuất |

Vào `/app/...` khi chưa đăng nhập sẽ chuyển tới `/login?next=...` rồi quay lại
sau khi đăng nhập, giữ cả query (ví dụ `/app/care?tab=safety&child=...`); chỉ
chấp nhận đường dẫn trong `/app`.

## Buddy của bé

Mô hình của backend-v2 (`src/lib/buddy.js`, thuần, có test):

- Đồ chơi thuộc về một bé, mỗi bé có **một** Buddy, nên mặt và tên của một đồ
  chơi là Buddy của bé đó (`toyView`). Mỗi bé có tối đa một đồ chơi đang thức.
- Buddy là một trong ba nhân vật, chọn qua bảng hỏi: **Bo** (vẽ bằng Orbit),
  **Pip** (Volt), **Luna** (Glim). Tên của Buddy là tên nhân vật, ngoại hình là
  của nhân vật (`CHARACTER_DESIGNS`); không còn đặt tên riêng hay chọn ngoại
  hình. Chỗ nào vẽ Buddy mà không gắn với đồ chơi cụ thể thì dùng Miu.
- Cách xưng hô: bạn thân (tớ, cậu), anh chị (anh, em), như cô chú trong nhà
  (cô, con; không bao giờ nhận là bố mẹ), cô giáo (cô, con).
- Ngôn ngữ: tiếng Việt, tiếng Anh hoặc song ngữ (trả lời bằng ngôn ngữ bé vừa
  dùng).
- Tính cách: một trong 16 kiểu (trắc nghiệm 12 câu hoặc tự chọn trong lưới),
  đặt các núm tính cách của nhân vật.
- Giọng nói: Buddy chỉ nói thành tiếng bằng một ngôn ngữ (`speechLanguage`:
  ngôn ngữ của Buddy, hoặc với Buddy song ngữ là ngôn ngữ đầu tiên của bé), nên
  danh sách giọng chỉ có giọng của ngôn ngữ đó; backend-v2 từ chối giọng của
  ngôn ngữ khác. Giọng riêng của nhân vật là mặc định, chọn nó thì lưu `null`.
  Bản nghe thử là file tĩnh `public/voice-samples/<id>.wav`.
- Việc học từ trò chuyện (cần bố mẹ đồng ý) và tâm trạng ghim thuộc về bé, nằm
  ở Chăm sóc, không thuộc về đồ chơi.

### Thêm Buddy (`AddToyModal` trong `src/dashboard/layers.jsx`)

Mỗi bước một màn hình, Buddy giới thiệu bước đó trong bong bóng lời thoại:

1. Mã in trên thẻ (bỏ qua khi làm Buddy trên web).
2. Chọn bé hoặc thêm bé. Bấm tiếp là **làm đồ chơi ngay** (ghép thẻ, hoặc tạo
   Buddy trên web), nên mã sai hiện ra ở đây, trước mọi bước về Buddy. Bé đang
   có đồ chơi thức thì không chọn được.
3. Tính cách: trắc nghiệm hoặc tự chọn.
4. Cách xưng hô.
5. Ngôn ngữ.
6. Nhân vật: ba nhân vật, hợp nhất đứng đầu và được chọn sẵn ("Hợp nhất").
   Bảng hỏi gửi lên được suy ra từ lựa chọn của bố mẹ (`questionnaireAnswers`
   trong `src/lib/wizard.js`) và chỉ hỏi lại khi có câu trả lời đổi.
7. Giọng nói.
8. Xem lại rồi lưu: tạo Buddy, sau đó một lệnh `PATCH` chỉ với những gì khác.

Đóng giữa chừng: trước khi có đồ chơi thì đóng luôn. Có đồ chơi mà chưa chọn
nhân vật thì chỉ đóng được, thẻ đồ chơi sẽ mời "Hoàn tất thiết lập Buddy" (mở
lại đúng bé đó). Đã chọn nhân vật thì "Lưu và đóng" tạo Buddy. Bé đã có Buddy
thì trình thêm chỉ cho xem Buddy đó, không bao giờ ghi đè.

Bảng chi tiết sửa Buddy trên một trang (xưng hô, tính cách, ngôn ngữ, giọng).
Đổi nhân vật là thao tác riêng, hỏi lại trước, vì nó bắt đầu một tình bạn mới
(ký ức của bé vẫn giữ); tính cách đã chọn được giữ. Khi lưu gặp `stale_write`
(ai đó vừa sửa), trang tải Buddy mới nhất, giữ những gì bố mẹ đã sửa và báo
để lưu lại.

## Chăm sóc (`src/dashboard/care/`)

Từng bé một, địa chỉ ghi lại bé và mục (`?child=&tab=`), nên tải lại hay bấm
quay lại vẫn đúng chỗ. Thiếu một trong hai thì trang mở bé đầu tiên có cảnh báo
chưa xem ở mục An toàn, không thì bé đầu tiên ở mục Điều Buddy biết.

- **Điều Buddy biết**: công tắc ghi nhớ (hỏi bố mẹ đồng ý trước), tóm tắt,
  người thân, điều đã biết, sự kiện, chuyện riêng giữa bé và Buddy, từ đang
  học, cách bé nói, tính khí, "Quên hết".
- **An toàn**: cảnh báo kèm nguyên văn lời bé (nơi duy nhất bố mẹ thấy lời bé)
  và gợi ý cho bố mẹ, nút đánh dấu đã xem. Cảnh báo đã xem thì xoá được, xoá
  luôn lời bé (hỏi lại trước). Lần làm mới 30 giây thấy số cảnh báo chưa xem
  khác đi thì danh sách tự tải lại trang đầu, nên cảnh báo mới hiện ra mà
  không cần tải lại trang.
- **Bản tin tuần**: từng tuần, thứ Hai đến Chủ nhật.
- **Quy tắc**: giới hạn mỗi ngày, giờ yên lặng, giờ đi ngủ, chủ đề tránh, tâm
  trạng của Buddy, trò chơi bất ngờ, Buddy chào trước, lời nhắc và mục tiêu.
  Công tắc "Buddy chào trước" chỉ hiện khi `GET /v2/me` trả `speak_first:
  true`; production trả `false` (dịch vụ giọng nói không cho Buddy chào
  trước) nên công tắc ẩn, và mỗi lần lưu vẫn gửi lại nguyên giá trị đã lưu.
  Lời nhắc quá hạn mà chưa dùng nằm riêng dưới "Đã hết hạn" và xoá được.

Logic thuần ở `src/lib/care.js`.

## Micro: Buddy tự biết khi bé nói xong

Trên đồ chơi thật, micro là công tắc, không phải giữ để nói: bé chạm nút một
lần rồi nói, đồ chơi tự nhận ra khoảng lặng khi bé ngừng nói và kết thúc lượt.
Hero trên trang giới thiệu mô phỏng đúng hành vi này.

Buddy trên web (`/app/talk`) thì rảnh tay: micro mở khi Buddy đã đăng nhập vào
máy chủ, lượt bắt đầu khi bé cất tiếng (gửi kèm 300 ms ngay trước đó để không
mất âm đầu) và kết thúc sau 2 giây im lặng. Khi Buddy đang nghĩ, đang nói và
một lúc sau đó thì micro được bỏ qua, nên giọng của Buddy không tự mở lượt mới.
Nút to dùng để tắt micro, gửi ngay, hoặc ngắt lời Buddy.

## Cảm xúc của Buddy

Bốn ngoại hình (`src/lib/designs.js`): **Miu** (mèo con biết nói, mặc định),
**Orbit** (nhà thám hiểm không gian), **Volt** (chú mèo robot), **Glim** (đốm
sáng trong lọ thủy tinh). Mọi nơi vẽ Buddy qua `src/components/Buddy.jsx`:
`BuddyFigure` (cả thân) và `BuddyAvatar` (mặt nhỏ trong danh sách).

**Miu** là một hình SVG (`src/components/Miu.jsx`):

- Bảng tư thế cho từng cảm xúc ở `src/lib/miu.js` (thuần, có test): mắt,
  lông mày, miệng, tai, tay, má hồng và hình phụ như dấu hỏi, chữ z, giọt
  nước mắt.
- Chuyển động bằng CSS trong `src/styles/miu.css`: đổi tư thế mượt, thở, vẫy
  đuôi, chớp mắt, nút trên bụng sáng theo micro khi đang nghe.

**Ba robot** vẽ bằng `src/components/ToyShell.jsx` (thân) và
`src/components/buddy/BuddyScreen.jsx` (mặt), chuyển động toàn bộ bằng CSS
trong `src/styles/buddy.css`. Mắt và miệng là đa giác `clip-path` cùng số điểm
(`src/styles/buddy-shapes.css`, sinh bởi `node scripts/buddy_shapes.js`) nên
mặt chuyển mượt từ cảm xúc này sang cảm xúc khác.

14 cảm xúc: `neutral`, `listening`, `thinking`, `happy`, `excited`, `laughing`,
`love`, `curious`, `surprised`, `wink`, `shy`, `confused`, `sad`, `sleepy`.
backend-v2 còn gửi ba khuôn mặt mà bản vẽ chưa có: `proud` hiện như `happy`,
`worried` như `sad`, `calm` như `neutral` (`src/lib/emotions.js`; test đọc
danh sách của backend-v2 nên một khuôn mặt mới không thể lặng lẽ thành
`neutral`). Giá trị lạ hiển thị `neutral`.

## Hiệu ứng

Chỉ giữ hiệu ứng thuộc về cách một thành phần hoạt động; không có hiệu ứng khi
trang hay nội dung vừa tải (không trượt vào, không hiện dần khi cuộn, cột biểu
đồ đứng yên, số lượt hiện ngay).

Hiệu ứng được giữ:

- Buddy ở hero: tự đổi khuôn mặt khi rảnh, mắt nhìn theo con trỏ, chạy thử một
  lượt hỏi khi chạm nút micro.
- Miu: thở, vẫy đuôi, chớp mắt; mọi chuyển động khi đổi cảm xúc.
- Nút lún xuống khi bấm; vòng sáng quanh nút micro theo âm lượng khi đang nghe.
- Số lượt đếm khi thay đổi (sau khi mua).
- Hộp thoại, ngăn kéo, bảng trượt từ dưới lên, thông báo.
- Pháo giấy khi mua lượt hoặc có Buddy mới.

Tất cả tắt khi hệ điều hành bật "giảm chuyển động".

## Lượt hỏi

Mỗi câu Buddy trả lời trừ 1 lượt; Buddy chào trước hay hỏi lại khi chưa nghe rõ
thì không trừ. Hết lượt thì đồ chơi chỉ phát đoạn "Buddy đang ngủ", nên trang
tự báo ví đang trống. Chỉ mua được khi `GET /v2/me` trả `payments: 'demo'`
(thanh toán demo, có ô giả lập thẻ bị từ chối); khi `disabled` (production)
mọi nút mua đều ẩn và trang báo "sắp có".

## Trò chuyện với Buddy trên web (`/app/talk`)

Buddy trên web là một đồ chơi riêng của backend-v2 (`hardware_rev: 'web'`):
trình duyệt nói đúng giao thức đồ chơi như firmware, nên cổng kiểm tra, lượt
hỏi và các quy tắc trò chuyện là thật.

- **Khoá bí mật**: lấy qua `POST /v2/devices/:id/credential` (chỉ gia đình sở
  hữu, chỉ khi Buddy đang thức). Chỉ giữ trong bộ nhớ của trang và bị xoá khi
  đăng xuất; không bao giờ ghi vào `localStorage` hay log.
- **Kết nối**: mở `/v2/device`; máy chủ gửi `challenge`, trang trả `hello` có
  chữ ký HMAC-SHA256 trên `nonce.device_id.server_time` (giờ của máy chủ, nên
  đồng hồ trình duyệt lệch cũng không sao), rồi chờ `ready`. Quá 15 giây không
  có `ready` thì đóng và thử lại.
- **Một lượt**: `turn_start`, các khung âm thanh (4 byte đầu: phiên bản, chiều,
  số thứ tự; rồi 640 byte PCM16 16 kHz, tức 20 ms), `turn_end` với lý do
  `silence`, `tap` hoặc `cap` (tối đa khoảng 29,5 giây). Máy chủ gửi `face`
  (khuôn mặt và pha), âm thanh của Buddy, `audio_end`, `play_clip` (hiện thành
  một dòng chữ), `buddy_turn` khi Buddy nói trước, và luôn có `turn_done`, kể
  cả khi dịch vụ giọng nói không mở được lượt (`play_clip` `didnt_catch` rồi
  `turn_done` `failed`). Sau một câu trả lời, trang chỉ làm mới ví và danh sách
  hoạt động (2 lệnh gọi, tối đa một lần mỗi 10 giây), không tải lại cả gia
  đình.
- **Lượt bị bỏ dở**: trang tự canh mỗi lượt, không chỉ trông vào `turn_done`.
  30 giây sau `turn_end` mà không có gì về (15 giây khi Buddy đang trả lời, và
  không bao giờ cắt ngang phần giọng đã nhận), trang huỷ lượt, báo một dòng
  rồi nghe tiếp, hoặc kết nối lại nếu socket im hẳn.
- **Giọng Buddy**: backend-v2 gửi các khung 20 ms nhanh hơn tốc độ nói; trang
  gộp chúng thành đoạn 120 ms và mỗi đợt bắt đầu sớm 200 ms, để khung đến muộn
  không làm giọng bị giật. Miệng Buddy cũng chờ đúng 200 ms đó mới cử động.
- **Trạng thái**: gửi `status` có `wake` một lần mỗi lần mở trang (cách duy
  nhất để Buddy được chào trước, nếu quy tắc cho phép và `GET /v2/me` trả
  `speak_first: true`; production thì không bao giờ), rồi mỗi 60 giây một
  lần để bảng điều khiển thấy Buddy trên web đang trực tuyến.
- **Đóng kết nối**: 4001 xin khoá mới một lần rồi dừng; 4003 (cho nghỉ hoặc
  bị gỡ) hiện Buddy buồn ngủ và không tự kết nối lại; 4009 (mở ở tab khác) mời
  "Trò chuyện ở đây"; 4029 chờ 30 giây; 4008 dừng và mời tải lại trang; các
  trường hợp khác thử lại sau 1, 2, 4 giây rồi báo mất kết nối kèm nút "Kết
  nối lại".
- **Báo trước điều chặn câu trả lời**: trước khi mở micro, một thẻ nói vì sao
  máy chủ sẽ chỉ phát đoạn "đang ngủ" và cách gỡ: Buddy đang nghỉ (nút đánh
  thức), bé chưa có Buddy (hoàn tất thiết lập), hết lượt (mua thêm, trừ khi
  chưa mở bán). Giờ yên lặng hay hết giới hạn trong ngày thì micro chờ một lần
  chạm thay vì tự mở.
- **Căn phòng**: Buddy vẽ theo nhân vật của bé, có thể vuốt ve. Ở trên là bảng
  tên (chọn trong các Buddy trên web) và số lượt; bên phải là nút ngôn ngữ (đổi
  vòng VI, EN, VI+EN cho Buddy của bé), cuộc trò chuyện mới (một socket mới) và
  hồ sơ. Bàn phím và nhật ký trò chuyện chỉ có khi phát triển, vì backend-v2
  không gửi lời nói về trang và production không nhận lượt gõ chữ.

**Cần secure context**: trình duyệt chỉ cho dùng micro và WebCrypto trên
`https://` hoặc `http://localhost`. Mở trang qua địa chỉ IP trong mạng LAN bằng
`http://` thì không trò chuyện được; trang báo rõ và không xin khoá bí mật.

Logic thuần có test, ghim vào chính mã của backend-v2 (cần Node 23.6 trở lên
để nạp file `.ts`; Node cũ hơn thì so chữ ký với `node:crypto` và bỏ qua phần
còn lại): `src/talk/signing.js` (so với `signChallenge`), `src/talk/dsp.js`
(lọc, hạ mẫu, cắt khung; so với `encodeFrame`/`decodeFrame`), `src/talk/vad.js`
(nhận biết hết câu), `src/talk/machine.js` (máy trạng thái, kế hoạch kết nối
lại, canh lượt bị bỏ dở bằng `watch` và `stallPlan`; mọi tin nhắn đều qua
`parseToyMessage` của backend-v2), `src/talk/player.js` (`createSchedule`:
gộp khung và lịch phát). Phần gắn với trình duyệt: `src/talk/useWebToy.js`,
`mic.js`, phần còn lại của `player.js`; giao diện ở `src/dashboard/Talk.jsx`.

## Cấu trúc

```
src/lib/        api (lớp duy nhất gọi backend), buddy (mô hình Buddy), wizard, care, routes (thuần), router, auth, i18n, translate, format, stats, emotions, designs, personality, miu, motion, catplay
src/i18n/       vi.js, en.js và parts/<khu vực>.{vi,en}.js (mọi câu chữ)
src/components/ Buddy (BuddyFigure, BuddyAvatar), Miu, Room (căn phòng), Toy (hero), ToyShell (thân ba robot), buddy/ (BuddyFace, BuddyScreen), Confetti, ui (Layer, Toast, Chip, Coin, LangSwitch...)
src/talk/       Buddy trên web: signing, dsp, vad, machine (thuần), useWebToy, mic, player
src/marketing/  MarketingPage
src/auth/       AuthPage
src/dashboard/  AppShell, data (dữ liệu gia đình), screens, parts, layers (bảng chi tiết, thêm Buddy, mua lượt), profile (các phần của Buddy, trắc nghiệm), Talk, WeekChart, care/ (Chăm sóc)
src/styles/     tokens, base, motion, buddy-shapes, buddy (robot), miu, marketing, app, wizard, care, talk-v2
scripts/        buddy_shapes.js (sinh buddy-shapes.css)
docs/           backend-v2.md (hợp đồng với backend-v2)
tests/          node --test cho các module thuần
```

## Lưu ý

- Refresh token được lưu trong `localStorage` (khoá `lb-web-refresh-v2`) để phụ
  huynh không phải đăng nhập lại mỗi lần mở trang; access token chỉ nằm trong
  bộ nhớ. Mọi lần làm mới dùng chung một yêu cầu, vì trình bày lại một token đã
  xoay vòng sẽ kết thúc mọi phiên. Khi lên production nên chuyển refresh token
  sang cookie httpOnly.
- backend-v2 giới hạn số lệnh gọi (60 mỗi phút cho mỗi phụ huynh, dồn được
  120; 5 lần đăng ký mỗi giờ cho mỗi IP; 10 lần ghép thẻ hay tạo Buddy trên web
  mỗi giờ; 10 Buddy trên web mỗi ngày cho mỗi gia đình). Mỗi lần bị từ chối
  (429) có `Retry-After`, và trang nói thời gian chờ theo độ dài của nó: dưới
  90 giây thì tính bằng giây, dưới 90 phút thì bằng phút, còn lại bằng giờ
  (`waitWords` trong `src/lib/format.js`). Mỗi lần tải dữ liệu gia đình tốn 5
  lệnh cộng 3 lệnh mỗi bé (Buddy, cảnh báo, thời gian trò chuyện trong tuần),
  nên chuyển màn trong trang không tải lại, chỉ tải lại sau mỗi thao tác và
  30 giây một lần khi trang đang mở.
- Refresh token của backend cũ (khoá `lb-web-refresh`) bị xoá khỏi
  `localStorage` và thu hồi qua `POST /api/auth/logout` ngay lần đầu trang
  tải, vì nó vẫn còn hiệu lực ở backend cũ.
- Không dùng thư viện router, hiệu ứng hay UI: chỉ React. Router nhỏ ở
  `src/lib/router.js`.
- Thêm câu chữ mới: thêm khoá vào cả hai ngôn ngữ (`vi.js` và `en.js`, hoặc
  cặp file trong `src/i18n/parts/`); `npm test` báo lỗi nếu thiếu khoá ở một
  ngôn ngữ, lệch chỗ điền, có gạch dài, hoặc code dùng khoá không tồn tại.
