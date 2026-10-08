# Little Buddy backend

Node.js 22 + Express 5, PostgreSQL (pgvector) là nguồn dữ liệu bền, Redis chỉ
giữ trạng thái nóng có TTL. Bước này gồm: sổ đăng ký thiết bị, xác thực thiết
bị bằng HMAC, tài khoản phụ huynh (JWT), ghép thiết bị vào gia đình, công tắc
tắt thiết bị (phụ huynh và vận hành), credit và lượt hỏi, hồ sơ Buddy, đồ chơi
trên web, và các script cho nhà máy.

Phần "não" của Buddy (nhận giọng nói, trí nhớ, prompt, mô hình, đọc câu trả
lời) là một dịch vụ riêng ở `brain/`. Backend chỉ gửi mã và giá trị (ai đang
nói, Buddy nào, cài đặt nào) qua HTTP nội bộ, không bao giờ gửi chữ của
prompt; hợp đồng nằm ở `brain/docs/contract.md`.

## Biến môi trường (`.env`, mẫu ở `.env.example`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `3000` | Cổng HTTP |
| `HOST` | (trống: mọi interface) | Đặt `127.0.0.1` khi chạy sau reverse proxy để API không lộ ra ngoài proxy |
| `LOG_LEVEL` | `info` (test: `silent`) | `debug` / `info` / `warn` / `error` / `silent` |
| `DATABASE_URL` | compose local | Bắt buộc ở production |
| `REDIS_URL` | compose local | Bắt buộc ở production |
| `JWT_SECRET` | giá trị dev | Production từ chối giá trị mặc định hoặc ngắn hơn 32 ký tự |
| `ADMIN_TOKEN` | giá trị dev | Bearer token cho `/admin`; ràng buộc như trên |
| `ACCESS_TOKEN_TTL_SEC` | `900` | Thời hạn access token |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Thời hạn refresh token |
| `SCRYPT_COST` | `32768` | Tham số N của scrypt (test dùng 4096) |
| `DEVICE_AUTH` | `on` | `off` chỉ cho dev local; production từ chối |
| `DEVICE_KEK` | `CHANGE_ME` | Khóa mã hóa bí mật thiết bị; production từ chối placeholder |
| `DEVICE_CLOCK_SKEW_SEC` | `300` | Cửa sổ lệch giờ cho chữ ký |
| `DEVICE_NONCE_TTL_SEC` | `900` | Thời gian nhớ nonce chống replay |
| `DEVICE_HEARTBEAT_SEC` | `60` | Chu kỳ heartbeat khi đã ghép |
| `DEVICE_HEARTBEAT_UNCLAIMED_SEC` | `5` | Chu kỳ heartbeat khi chưa ghép |
| `DEVICE_AUTH_FAIL_LIMIT` | `30` | Số lần xác thực hỏng mỗi phút trước khi khóa tạm |
| `TRUST_PROXY` | `0` | Số proxy đứng trước: `1` sau nginx, `2` sau Cloudflare + nginx |
| `WELCOME_CREDITS` | `10` | Credit tặng cho gia đình mới |
| `TURN_MAX_SEC` | `120` | Một lượt nói dài tối đa bao nhiêu giây; audio quá mức này bị bỏ. Với `PROVIDER_MODE=brain` tối đa 196 (brain nhận thân tối đa 6 MB) |
| `CONVERSATION_IDLE_SEC` | `300` | Các lượt cách nhau ít hơn chừng này thuộc cùng một cuộc trò chuyện |
| `PROVIDER_MODE` | `mock` | `mock` (câu trả lời mẫu, không cần gì thêm) hoặc `brain` (gọi dịch vụ `brain/`) |
| `BRAIN_URL` | `http://127.0.0.1:8080` | Địa chỉ dịch vụ brain |
| `BRAIN_TOKEN` | giá trị dev | Phải trùng `BRAIN_TOKEN` trong `brain/.env`; ở production với `brain` thì từ chối giá trị mặc định hoặc ngắn hơn 32 ký tự |
| `BRAIN_TIMEOUT_MS` | `45000` | Chờ brain tối đa (1000 đến 300000); quá hạn thì lượt thất bại với câu nói mẫu, không trừ credit |
| `WEB_TOY` | `on` (production: `off`) | Cho phép phụ huynh chơi với đồ chơi ngay trên web (lộ bí mật thiết bị cho chủ) |
| `PAYMENT_PROVIDER` | `demo` (production: `disabled`) | `demo` bị từ chối ở production |

Server từ chối khởi động ở production khi bất kỳ ràng buộc nào ở trên bị vi
phạm (`config.js`). Các biến trong `.env.example` được chia nhóm: server,
database và redis, bí mật xác thực, thiết bị, credit và lượt hỏi, brain,
thanh toán.

Một lượt `accepted` quá `TURN_MAX_SEC + max(60, BRAIN_TIMEOUT_MS/1000 + 15)`
giây bị coi là bỏ quên (không còn giữ credit, không hoàn tất được nữa), nên
một câu trả lời chậm nhưng vẫn trong hạn của brain không bao giờ bị quét mất.
Lời gọi brain cũng không bao giờ được chờ quá 10 giây trước mốc đó.

## Script

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | Chạy server, tự reload khi sửa file |
| `npm start` | Chạy server |
| `npm test` | Kiểm tra Docker, rồi chạy toàn bộ test (tuần tự, vì dùng chung một database test) |
| `npm run test:unit` | Chỉ test đơn vị, không cần Docker |
| `npm run migrate` | Áp dụng migration chưa chạy trong `store/migrations/` |
| `npm run seed` | Tạo gia đình demo (`demo@littlebuddy.local` / `demo-password`), một thiết bị đã ghép, một chưa ghép; ghi `.env.device` |
| `npm run provision -- --label L --count N --hardware-rev R` | Tạo lô thiết bị, ghi manifest cho nhà máy vào `manifests/L.csv` |
| `npm run provision -- --rotate <device_id>` | Xoay bí mật một thiết bị, bí mật cũ còn hiệu lực 7 ngày |
| `npm run e2e` | Thiết bị mô phỏng đi hết vòng đời với server thật (luôn dùng `PROVIDER_MODE=mock`, không cần brain) |

## Vòng đời một thiết bị

```
nhà máy ──> provisioned ──phụ huynh nhập mã──> active <──> disabled
                ^                                 |    (phụ huynh tạm dừng / bật lại;
                └──────── phụ huynh gỡ ghép ──────┘     vận hành tắt thì phụ huynh không bật lại được)
provisioned | active | disabled ──vận hành──> revoked (vĩnh viễn: lost / stolen / compromised / retired)
```

1. **Provision** (`scripts/provision_batch.js`): mỗi thiết bị nhận `device_id`
   (uuid), bí mật 32 byte và mã ghép 8 ký tự. Bí mật được mã hóa AES-GCM
   dưới `DEVICE_KEK` trước khi lưu; mã ghép chỉ lưu dạng hash có pepper.
   Manifest được ghi và fsync **bên trong** transaction, ghi hỏng thì lô bị
   rollback.
2. **Ghép** (`POST /api/devices/claim`): phụ huynh đã đăng nhập nhập mã in trên
   thẻ. Mã sai, mã đã dùng và thiết bị đã bị thu hồi đều trả `404
   claim_code_invalid` giống hệt nhau. Giới hạn 10 lần/giờ mỗi phụ huynh.
   Riêng gia đình đang sở hữu đồ chơi nhập lại mã của nó (ví dụ gửi lại sau
   khi mất phản hồi) thì nhận lại đúng đồ chơi đó, 200, không ghi gì thêm.
   Cùng transaction đó ghi **hồ sơ Buddy** (`buddy_profiles`): tên (1 đến 24
   ký tự), vai (`friend` mặc định, `daddy`, `mommy`, `teacher`), một trong 16
   tính cách (`ENFP` mặc định), nguồn (`quiz`, `picked`, `default`) và ngoại
   hình trên web (`design`: `orbit` mặc định, `volt`, `glim`; brain không dùng). Không
   gửi `profile` thì dùng mặc định Buddy / bạn thân / ENFP. Mỗi lần ghép đều
   ghi đè hồ sơ, nên đồ chơi đổi chủ không mang theo tên, tính cách và ngoại
   hình cũ.
   Hồ sơ còn có **cài đặt trò chuyện**: ngôn ngữ (`vi` mặc định hoặc `en`,
   độc lập với ngôn ngữ giao diện web), giọng (`voice_id`, `null` là giọng
   mặc định của ngôn ngữ đó trong bảng `voices`), học từ các cuộc trò chuyện (`learn`, mặc
   định tắt) và tâm trạng ghim (`mood_pin` 0 đến 100, `null` là tự động; 0 là
   một giá trị ghim thật). Mỗi lần ghép cũng đặt lại các cài đặt này về mặc
   định. Bảng `personalities` chỉ còn là dữ liệu tham khảo: mọi chữ của prompt
   (cách xưng hô của từng vai, tính cách, tâm trạng) thuộc về `brain/`;
   `personalization/roles.js` chỉ giữ mã vai và nhãn.
   Mỗi giọng chỉ nói một ngôn ngữ (`voices.language`), mỗi ngôn ngữ có đúng
   một giọng mặc định. Migration 008 nạp sẵn: tiếng Việt Phan Anh (mặc định),
   Cam Hong; tiếng Anh Little Dude II (mặc định), Ziggy, The Elf. Chọn giọng
   khác ngôn ngữ của đồ chơi là 400 (`voice does not speak this language`);
   đổi ngôn ngữ mà không gửi giọng thì giọng cũ khác ngôn ngữ bị xoá về
   `null`. Lúc gửi lượt sang brain, `voices.resolve` không bao giờ chọn giọng
   của ngôn ngữ kia: nó lùi về giọng mặc định của ngôn ngữ đó.
   Thêm một giọng: `POST /admin/voices` (kèm `language`), rồi ghi giọng mẫu
   bằng `npm run voice-samples -- <id>:<vi|en>` trong `brain/` để trang web
   có bản nghe thử.
3. **Heartbeat** (`POST /v1/heartbeat`, có chữ ký): thiết bị biết trạng thái
   của mình và chu kỳ heartbeat tiếp theo.
4. **Stream** (`GET /v1/stream` WebSocket, chữ ký trong query string): mọi
   thiết bị chưa bị thu hồi đều kết nối được. Mỗi lần bấm nút (`turn_start`)
   đi qua **ask gate**: thiết bị phải `active` và gia đình còn credit (trừ các
   lượt đang mở). Bị từ chối thì đồ chơi chỉ nhận cảm xúc và một câu nói
   (`turn_denied {emotion, say}`), không bao giờ nhận lý do; hết credit và bị
   tạm dừng cho ra phản hồi giống hệt nhau. Một lượt trả lời xong
   (`turn_end` → `answer` → `turn_done`) trừ đúng một credit của gia đình,
   ghi vào sổ `credit_ledger` (append-only, số dư = tổng). Hủy, quá hạn, rớt
   kết nối hay công tắc tắt (`4003`) đều không trừ. Gia đình mới được tặng
   `WELCOME_CREDITS` (mặc định 10); vận hành cấp thêm qua
   `POST /admin/families/:id/credits`. Chi tiết giao thức: `docs/device_auth.md`
   mục 7.

   Một lượt có thể là giọng nói (các khung PCM16 16 kHz gửi sau
   `turn_accepted`, được gom lại tối đa `TURN_MAX_SEC` giây, mỗi tin nhắn tối
   đa 64 KB) hoặc chữ gõ (`turn_end` kèm `text`, 1 đến 2000 ký tự). Với
   `PROVIDER_MODE=brain`, `pipeline/brain.js` đọc hồ sơ, bé và cài đặt, rồi gọi
   `POST /v1/turns` của brain; câu trả lời về đồ chơi theo thứ tự `answer`
   (kèm `heard`), `audio` + các khung PCM + `audio_end`, rồi mới trừ credit và
   gửi `turn_done`. Brain không nghe được gì (`no_speech`) thì đồ chơi vẫn nói
   câu "chưa nghe rõ" nhưng lượt bị bỏ, không trừ credit. Brain lỗi hoặc quá
   hạn thì nói câu mẫu, lượt `failed`, không trừ. Công tắc tắt hay rớt kết nối
   giữa lúc brain đang nghĩ thì hủy luôn lời gọi brain, không nói gì thêm,
   không trừ. Câu từ chối và câu mẫu theo ngôn ngữ trò chuyện của đồ chơi.

   Trí nhớ trong brain gắn với **bé** (`child:<id>`) khi đồ chơi đã gán bé,
   nếu không thì với **đồ chơi trong gia đình này** (`device:<id>:<family id>`).
   `conversation_new` kết thúc cuộc trò chuyện đang mở; đổi bé được gán cũng
   bắt đầu cuộc trò chuyện mới.
5. **Gỡ ghép** (`DELETE /api/devices/:id`): thiết bị về `provisioned`, mã in
   trên thẻ dùng lại được cho chủ mới. Sau khi commit, backend nhờ brain xóa
   trí nhớ của `device:<id>:<family id>` (cố gắng hết sức: brain không trả lời
   thì chỉ ghi log, việc gỡ ghép vẫn thành công).

## Đồ chơi trên web

Phụ huynh có thể trò chuyện với đồ chơi của mình ngay trên dashboard mà
không cần đồ chơi thật: trình duyệt đóng vai đồ chơi.
`POST /api/devices/:id/secret` trả `{device_id, secret_hex}` (kèm
`Cache-Control: no-store`) chỉ cho gia đình sở hữu và chỉ khi đồ chơi đang
`active`; mọi trường hợp khác là `404 device_not_found`. Giới hạn 30 lần/giờ
mỗi phụ huynh. `secret_hex` không phải bí mật gốc của nhà máy mà là khóa
riêng cho đồ chơi trên web, dẫn xuất (HKDF) từ bí mật gốc, gia đình sở hữu
và thời điểm ghép. Khi gỡ ghép hoặc đồ chơi được ghép lại (kể cả bởi cùng gia
đình), khóa cũ hết hiệu lực, nên chủ cũ không thể ký thay đồ chơi; đồ chơi
thật vẫn dùng bí mật gốc như trước. Mỗi lần lấy khóa được ghi
`secret_revealed_at` trên thiết bị (dấu này bật khóa web, gỡ ghép hoặc xoay
bí mật xóa dấu) và sự kiện `secret_revealed`; vận hành thấy dấu này trong
`/admin/devices`. Đây là đường giải mã bí mật thứ hai, bên cạnh việc kiểm
tra chữ ký. Trình duyệt sau
đó ký `/v1` như firmware (không gửi heartbeat), nên mỗi lượt vẫn qua ask gate
và trừ credit như đồ chơi thật. `WEB_TOY=off` tắt tính năng
(`403 web_toy_disabled`); `GET /api/me` trả `web_toy` để frontend ẩn nút Trò chuyện.

Chi tiết giao thức chữ ký cho firmware: `docs/device_auth.md`.

## API

Mọi phản hồi là JSON, khóa `snake_case`, lỗi có dạng
`{ "error": { "code", "message", ... } }` kèm header `x-request-id`.
Cách nhanh nhất để bấm thử bằng tay là website ở `frontend/` (`npm run dev` ở thư
mục gốc chạy cả brain, backend và frontend); `/admin` gọi bằng curl.

### `/api` (dashboard, `Authorization: Bearer <access_token>`)

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| POST | `/api/auth/register` | `{email, password, family_name, display_name?}` → 201, tạo gia đình + tài khoản chủ. 409 `email_taken` |
| POST | `/api/auth/login` | `{email, password}`. 401 `invalid_credentials` (giống nhau cho sai mật khẩu và email lạ). 10 lần/15 phút |
| POST | `/api/auth/refresh` | `{refresh_token}` → cặp token mới; dùng lại token cũ sẽ thu hồi mọi phiên (`refresh_token_reused`) |
| POST | `/api/auth/logout` | `{refresh_token}` → 204 |
| GET | `/api/me` | Tài khoản, gia đình và `web_toy` (true/false) |
| POST / GET | `/api/children` | `{name, birth_year}`, `birth_year` từ 2000 đến năm hiện tại |
| POST | `/api/devices/claim` | `{claim_code, child_id?, profile?}` → `{device}` (có `device.profile`). Hồ sơ sai: 400 `validation_error`, `details` liệt kê từng trường |
| GET | `/api/devices` | Thiết bị của gia đình |
| PATCH | `/api/devices/:id` | `{child_id}` (uuid hoặc null) |
| PATCH | `/api/devices/:id/profile` | Bất kỳ tập con nào của `{name, role, personality, personality_source, language, voice_id, learn, mood_pin}` → `{device}`. `mood_pin: null` bỏ ghim, `voice_id: null` về giọng mặc định; giọng không tồn tại là 400. Ghi sự kiện `profile_updated`; 409 `device_revoked` |
| POST | `/api/devices/:id/secret` | `{device_id, secret_hex}` cho đồ chơi trên web (xem mục trên) |
| GET | `/api/voices` | `{voices: [{id, label, language, is_default}]}`, xếp theo ngôn ngữ rồi thứ tự hiển thị |
| POST | `/api/devices/:id/disable` | `{reason?}`. 409 `device_not_active` |
| POST | `/api/devices/:id/enable` | 403 `disabled_by_operator` nếu vận hành đã tắt |
| DELETE | `/api/devices/:id` | Gỡ ghép → 204 |
| GET | `/api/wallet` | `{balance, ledger}` của gia đình |
| GET | `/api/turns` | Các lượt gần đây kèm lý do từ chối thật (`denied_reason`) |
| GET | `/api/credit-packs` | Các gói credit đang bán (credit, giá, tiền tệ) |
| POST | `/api/purchases` | `{pack_id, idempotency_key?}` → 201 `{purchase}` trạng thái `pending`, chưa cộng credit |
| POST | `/api/purchases/:id/demo-pay` | `{outcome: success|decline}` (giai đoạn demo, thay cho webhook của cổng thanh toán) → `{purchase, balance}`; mỗi purchase chỉ cộng credit một lần, lần hai trả 409 `purchase_not_pending` |
| GET | `/api/purchases` | Lịch sử mua |

Mua credit (giai đoạn demo): `PAYMENT_PROVIDER=demo` là mặc định khi dev và bị
từ chối ở production (nó cho credit miễn phí); `disabled` tắt việc mua
(403 `payments_disabled`). Số credit và giá được chép vào purchase lúc tạo,
nên đổi giá gói sau này không làm thay đổi lịch sử.

Thiết bị của gia đình khác luôn là `404 device_not_found`, không bao giờ 403.

### `/v1` (thiết bị, HMAC)

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/v1/time` | Không cần chữ ký → `{server_time}` |
| POST | `/v1/heartbeat` | `{firmware_version?, uptime_s?}` → `{status, server_time, heartbeat_interval_s}` |
| WS | `/v1/stream` | Mọi thiết bị chưa bị thu hồi; gửi `{type:"ready"}` khi mở. Giao thức lượt hỏi: `docs/device_auth.md` mục 7 |

Mã lỗi thiết bị: `auth_missing`, `auth_ts_skew`, `auth_unknown_device`,
`auth_bad_signature`, `auth_replay` (401); `device_not_claimed`,
`device_disabled`, `device_revoked` (403); `rate_limited` (429);
`auth_unavailable` (503). Mọi lỗi kèm `server_time`.

### `/admin` (`Authorization: Bearer <ADMIN_TOKEN>`)

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/admin/batches` | Lô kèm số thiết bị và số đang active |
| GET | `/admin/devices` | Lọc `status`, `batch_id`, `family_id`; `limit` tối đa 200, `offset`. Có `secret_revealed_at` |
| POST | `/admin/devices/:id/disable` | `{reason}` bắt buộc |
| POST | `/admin/devices/:id/enable` | |
| POST | `/admin/devices/:id/revoke` | `{reason}` trong `lost / stolen / compromised / retired` |
| POST | `/admin/devices/:id/reissue-claim-code` | Chỉ với thiết bị `provisioned`; trả mã mới một lần |
| POST | `/admin/families/:id/credits` | `{amount, kind? grant|refund, reason}` → `{balance}` |
| GET | `/admin/families/:id/wallet` | Số dư và sổ credit của một gia đình |
| POST | `/admin/voices` | `{id, label, language?, sort?, is_default?}` thêm (201) hoặc sửa (200) một giọng; giọng mới không ghi `language` là `vi`; `is_default: true` chuyển giọng mặc định của ngôn ngữ đó sang giọng này; chuyển một giọng mặc định sang ngôn ngữ đã có mặc định là 409 `default_exists` |

Không có endpoint provision qua HTTP: bí mật thiết bị chỉ đi từ CLI ra manifest.

## Cấu trúc thư mục

```
server.js / app.js     khởi động; app.js gắn router, không listen
config.js              đọc env một lần, đóng băng, kiểm tra ở production
lib/                   log (che thông tin nhạy cảm), HttpError, validate
middleware/            request id, error, require_parent, require_admin, rate_limit, device_auth
auth/                  password (scrypt), tokens (JWT + refresh), service
devices/               secret_box, claim_code, serial, signing, registry, hmac_auth, sim_client
personalization/       roles.js: mã và nhãn bốn vai, kiểm tra hồ sơ và cài đặt Buddy
gate/ask_gate.js       quyết định mỗi lần bấm nút; câu từ chối và câu mẫu theo ngôn ngữ
turns/                 service (nhận lượt, trừ credit), deadline (hạn chờ brain)
pipeline/              mock (câu mẫu) và brain (gọi dịch vụ brain/), chọn theo PROVIDER_MODE
ws/stream.js           WebSocket /v1/stream, đóng socket khi thiết bị bị chặn
ws/turns.js            giao thức lượt hỏi: gom audio, chữ gõ, gửi audio về, hủy lời gọi brain
routes/                device (/v1), dashboard (/api), admin (/admin)
store/                 db, redis, migrate, các module SQL theo bảng, migrations/
scripts/               check_services, migrate, provision_batch, seed_demo, e2e_device_flow
docs/device_auth.md    hợp đồng với firmware
tests/                 helpers/, fixtures/, unit/, integration/
```

## Test

- Database `littlebuddy_test` và Redis db 1 trên cùng container dev; helper từ
  chối chạy nếu tên database không kết thúc bằng `_test`.
- Mỗi file test `TRUNCATE` mọi bảng và `FLUSHDB` trước khi chạy; các file chạy
  tuần tự (`--test-concurrency=1`).
- `pretest` kiểm tra Postgres và Redis trong 2 giây; Docker tắt thì báo
  `docker compose up -d` và thoát mã 1.
- Vector chữ ký chuẩn: `tests/fixtures/hmac_vectors.json`.
- Test không bao giờ cần brain thật: `tests/helpers/brain_stub.js` là một brain
  giả. File chạy `PROVIDER_MODE=brain` (`brain_pipeline.test.js`) đặt biến môi
  trường trước lần import `config.js` đầu tiên, giống `device_auth_off.test.js`.

## Khắc phục sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `Postgres is not reachable at localhost:5432` | Docker chưa chạy: `docker compose up -d` ở thư mục gốc |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Container `littlebuddy-pgvector` của repo prototype đang chiếm cổng: `docker stop littlebuddy-pgvector`, rồi `docker compose up -d --force-recreate postgres` |
| Container Postgres chạy nhưng không có cổng host | Container được tạo lúc bind hỏng: `docker compose up -d --force-recreate postgres` |
| `database "littlebuddy_test" does not exist` | Volume cũ hơn script init: helper test tự tạo; hoặc `docker compose down -v` rồi `up -d` |
| `config: ... refusing to boot` | Đang chạy production với secret mặc định hoặc `DEVICE_AUTH=off` |
| Mọi POST `/v1` trả `auth_bad_signature` | Firmware ký sai canonical string; so với vector trong `docs/device_auth.md` |
| Lượt hỏi nào cũng nhận câu mẫu "thử lại sau" | `PROVIDER_MODE=brain` nhưng brain chưa chạy, hoặc `BRAIN_TOKEN` hai bên khác nhau; xem log `pipeline_failed` (trường `code`) |
