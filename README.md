# Little Buddy

Little Buddy là đồ chơi bạn đồng hành AI cho trẻ 4 đến 8 tuổi. Bé bấm nút và
hỏi bất cứ điều gì; Buddy nghe, hiểu tiếng Việt và tiếng Anh, trả lời bằng
giọng nói và thể hiện cảm xúc trên màn hình. Thiết bị là một ESP32-S3 (mic,
LCD, loa, nút bấm) rất "mỏng": mọi việc nặng (nhận dạng giọng nói, mô hình
ngôn ngữ, tổng hợp giọng, bộ nhớ, tính tiền) nằm ở backend.

```
┌─────────────┐   WebSocket /v1    ┌────────────────────┐        ┌─────────────────┐
│  ESP32-S3   │ ◄────────────────► │  Node.js backend   │ ◄────► │  Dịch vụ AI     │
│  đồ chơi    │   HMAC-signed      │  Postgres + Redis  │        │  STT / LLM / TTS│
└─────────────┘                    └────────────────────┘        └─────────────────┘
                                             ▲
                                             │ REST /api (JWT)
                                    ┌──────────────────┐
                                    │ Dashboard phụ huynh │  (frontend/, sắp tới)
                                    └──────────────────┘
```

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `backend/` | API Node.js: quản lý thiết bị, xác thực thiết bị (HMAC), tài khoản phụ huynh (JWT), endpoint quản trị. Xem `backend/README.md`. |
| `frontend/` | Console kiểm thử dev (Vite + React): làn phụ huynh, thiết bị mô phỏng chạy trong trình duyệt, làn vận hành. Không phải dashboard sản phẩm. Xem `frontend/README.md`. |
| `docker/` | Script khởi tạo Postgres (tạo thêm database test). |
| `docker-compose.yml` | Postgres (pgvector) và Redis cho dev và test. |

## Yêu cầu

- Node.js >= 20.6 (máy dev hiện dùng 22.19)
- Docker Desktop (chạy Postgres và Redis)

## Chạy nhanh (PowerShell, từ thư mục gốc)

```powershell
docker compose up -d
cd backend
npm install
copy .env.example .env
npm run migrate
npm run seed          # tạo gia đình demo, 1 thiết bị đã ghép, 1 thiết bị chưa ghép
npm run dev           # http://localhost:3000/healthz
```

Chạy test (cần container đang chạy; nếu Docker tắt, `npm test` báo lỗi và
dừng ngay):

```powershell
cd backend
npm test
```

Thử toàn bộ vòng đời một thiết bị mô phỏng (provision, heartbeat, ghép,
stream, tắt, gỡ ghép):

```powershell
npm run e2e
```

Bấm thử mọi thứ từ trình duyệt (backend phải đang chạy):

```powershell
cd frontend
npm install
npm run dev           # http://localhost:5173
```

## Lưu ý

- Repo prototype `LittleBuddy` (app-b) cũng dùng cổng 5432. Nếu container
  `littlebuddy-pgvector` đang chạy, Postgres của repo này không bind được cổng:
  `docker stop littlebuddy-pgvector` rồi `docker compose up -d --force-recreate postgres`.
- `backend/.env`, `backend/.env.device` và thư mục `manifests/` chứa bí mật và
  không bao giờ được commit (đã có trong `.gitignore`).

## Quy ước

- Code và comment bằng tiếng Anh, README bằng tiếng Việt.
- Không dùng em dash trong bất kỳ văn bản nào.
- Comment giải thích *tại sao*, không mô tả lại *cái gì*.
- ES modules (`import`/`export`), `node --test`, không TypeScript, không ORM.
- Log chỉ chứa id, không bao giờ chứa lời nói của trẻ, email hay bí mật.
