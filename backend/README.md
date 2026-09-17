# Little Buddy backend

Node.js 22 + Express 5, PostgreSQL (pgvector) là nguồn dữ liệu bền, Redis chỉ
giữ trạng thái nóng có TTL. Bước này gồm: sổ đăng ký thiết bị, xác thực thiết
bị bằng HMAC, tài khoản phụ huynh (JWT), ghép thiết bị vào gia đình, công tắc
tắt thiết bị (phụ huynh và vận hành), và các script cho nhà máy.

## Biến môi trường (`.env`, mẫu ở `.env.example`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `3000` | Cổng HTTP |
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
| `TRUST_PROXY` | `0` | Đặt `1` khi chạy sau nginx/pm2 |

Server từ chối khởi động ở production khi bất kỳ ràng buộc nào ở trên bị vi
phạm (`config.js`).

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
| `npm run e2e` | Thiết bị mô phỏng đi hết vòng đời với server thật |

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
3. **Heartbeat** (`POST /v1/heartbeat`, có chữ ký): thiết bị biết trạng thái
   của mình và chu kỳ heartbeat tiếp theo.
4. **Stream** (`GET /v1/stream` WebSocket, chữ ký trong query string): chỉ
   thiết bị `active`. Tắt hoặc thu hồi thiết bị sẽ đóng socket đang mở với mã
   `4003`.
5. **Gỡ ghép** (`DELETE /api/devices/:id`): thiết bị về `provisioned`, mã in
   trên thẻ dùng lại được cho chủ mới.

Chi tiết giao thức chữ ký cho firmware: `docs/device_auth.md`.

## API

Mọi phản hồi là JSON, khóa `snake_case`, lỗi có dạng
`{ "error": { "code", "message", ... } }` kèm header `x-request-id`.
Cách nhanh nhất để bấm thử bằng tay là console ở `frontend/` (`npm run dev`).

### `/api` (dashboard, `Authorization: Bearer <access_token>`)

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| POST | `/api/auth/register` | `{email, password, family_name, display_name?}` → 201, tạo gia đình + tài khoản chủ. 409 `email_taken` |
| POST | `/api/auth/login` | `{email, password}`. 401 `invalid_credentials` (giống nhau cho sai mật khẩu và email lạ). 10 lần/15 phút |
| POST | `/api/auth/refresh` | `{refresh_token}` → cặp token mới; dùng lại token cũ sẽ thu hồi mọi phiên (`refresh_token_reused`) |
| POST | `/api/auth/logout` | `{refresh_token}` → 204 |
| GET | `/api/me` | Tài khoản và gia đình |
| POST / GET | `/api/children` | `{name, birth_year}` |
| POST | `/api/devices/claim` | `{claim_code, child_id?}` → `{device}` |
| GET | `/api/devices` | Thiết bị của gia đình |
| PATCH | `/api/devices/:id` | `{child_id}` (uuid hoặc null) |
| POST | `/api/devices/:id/disable` | `{reason?}`. 409 `device_not_active` |
| POST | `/api/devices/:id/enable` | 403 `disabled_by_operator` nếu vận hành đã tắt |
| DELETE | `/api/devices/:id` | Gỡ ghép → 204 |

Thiết bị của gia đình khác luôn là `404 device_not_found`, không bao giờ 403.

### `/v1` (thiết bị, HMAC)

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/v1/time` | Không cần chữ ký → `{server_time}` |
| POST | `/v1/heartbeat` | `{firmware_version?, uptime_s?}` → `{status, server_time, heartbeat_interval_s}` |
| WS | `/v1/stream` | Chỉ thiết bị `active`; gửi `{type:"ready"}` khi mở |

Mã lỗi thiết bị: `auth_missing`, `auth_ts_skew`, `auth_unknown_device`,
`auth_bad_signature`, `auth_replay` (401); `device_not_claimed`,
`device_disabled`, `device_revoked` (403); `rate_limited` (429);
`auth_unavailable` (503). Mọi lỗi kèm `server_time`.

### `/admin` (`Authorization: Bearer <ADMIN_TOKEN>`)

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/admin/batches` | Lô kèm số thiết bị và số đang active |
| GET | `/admin/devices` | Lọc `status`, `batch_id`, `family_id`; `limit` tối đa 200, `offset` |
| POST | `/admin/devices/:id/disable` | `{reason}` bắt buộc |
| POST | `/admin/devices/:id/enable` | |
| POST | `/admin/devices/:id/revoke` | `{reason}` trong `lost / stolen / compromised / retired` |
| POST | `/admin/devices/:id/reissue-claim-code` | Chỉ với thiết bị `provisioned`; trả mã mới một lần |

Không có endpoint provision qua HTTP: bí mật thiết bị chỉ đi từ CLI ra manifest.

## Cấu trúc thư mục

```
server.js / app.js     khởi động; app.js gắn router, không listen
config.js              đọc env một lần, đóng băng, kiểm tra ở production
lib/                   log (che thông tin nhạy cảm), HttpError, validate
middleware/            request id, error, require_parent, require_admin, rate_limit, device_auth
auth/                  password (scrypt), tokens (JWT + refresh), service
devices/               secret_box, claim_code, serial, signing, registry, hmac_auth, sim_client
ws/stream.js           WebSocket /v1/stream, đóng socket khi thiết bị bị chặn
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

## Khắc phục sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `Postgres is not reachable at localhost:5432` | Docker chưa chạy: `docker compose up -d` ở thư mục gốc |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Container `littlebuddy-pgvector` của repo prototype đang chiếm cổng: `docker stop littlebuddy-pgvector`, rồi `docker compose up -d --force-recreate postgres` |
| Container Postgres chạy nhưng không có cổng host | Container được tạo lúc bind hỏng: `docker compose up -d --force-recreate postgres` |
| `database "littlebuddy_test" does not exist` | Volume cũ hơn script init: helper test tự tạo; hoặc `docker compose down -v` rồi `up -d` |
| `config: ... refusing to boot` | Đang chạy production với secret mặc định hoặc `DEVICE_AUTH=off` |
| Mọi POST `/v1` trả `auth_bad_signature` | Firmware ký sai canonical string; so với vector trong `docs/device_auth.md` |
