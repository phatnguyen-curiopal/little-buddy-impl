# Triển khai: little-buddy.curiopal.com

Bản demo chạy trên máy chủ dùng chung của curiopal (Ubuntu 24.04), nơi còn
nhiều website khác (curiopal.com, sukembarber.com, ...). Nguyên tắc: **chỉ
thêm, không sửa gì của site khác**. Không đổi cấu hình Postgres, Redis hay
nginx chung, không khởi động lại dịch vụ chung; nginx chỉ được reload êm
(`systemctl reload`) sau khi `nginx -t` của toàn bộ cấu hình đã qua.

## Cái gì chạy ở đâu

| Thành phần | Vị trí |
|---|---|
| Website (`frontend/`, build tĩnh) | `/var/www/little-buddy/site`, nginx phục vụ |
| nginx | `/etc/nginx/sites-available/little-buddy.curiopal.com` (bản gốc: `deploy/nginx/`), link sang `sites-enabled` |
| Chứng chỉ | Let's Encrypt, `certbot` kiểu webroot (`/var/www/little-buddy/acme`), tự gia hạn rồi reload nginx |
| DNS | Cloudflare, bản ghi A `little-buddy` qua proxy (SSL Full strict), giống các subdomain khác |
| backend | container `little-buddy-backend-1`, `127.0.0.1:3600` |
| brain | container `little-buddy-brain-1`, `127.0.0.1:8600` |
| Redis | container `little-buddy-redis-1`, `127.0.0.1:6390`, không lưu xuống đĩa |
| Postgres | Postgres 16 có sẵn của máy (`127.0.0.1:5432`), role `littlebuddy`, database `littlebuddy` và `littlebuddy_brain` (pgvector 0.6) |
| File env | `/opt/little-buddy/env/backend.env`, `brain.env` (chỉ root đọc được) |
| Manifest đồ chơi | `/opt/little-buddy/manifests` (chỉ root, chứa bí mật nhà máy) |
| Mã nguồn đang chạy | `/opt/little-buddy/src` (bản trước ở `src.old`), commit trong `deployed_rev` |
| Webhook GitHub | `little-buddy-webhook.service`, `127.0.0.1:9130`, nginx chuyển `/hooks/deploy`; bí mật ở `env/webhook.env` |
| Tự triển khai | `little-buddy-deploy.path` và `.service`, bản clone ở `/opt/little-buddy/repo`, script ở `/opt/little-buddy/bin` |

Các container dùng mạng của máy (host network) để tới Postgres ở
`127.0.0.1` mà không phải sửa `listen_addresses` hay `pg_hba` dùng chung.
Máy không bật tường lửa, nên mọi dịch vụ đều tự bind `127.0.0.1`; chỉ nginx
nhận kết nối từ ngoài. `/admin` không được nginx chuyển tiếp: gọi nó ngay
trên máy chủ (xem dưới).

## Tự động triển khai khi push lên main

Mỗi lần push lên nhánh `main` của `phatnguyen-curiopal/little-buddy-impl`,
GitHub gọi webhook `https://little-buddy.curiopal.com/hooks/deploy` và máy
chủ tự triển khai đúng `origin/main`.

- `deploy/webhook.mjs` (dịch vụ `little-buddy-webhook`, `127.0.0.1:9130`,
  không có đặc quyền: systemd `DynamicUser`) kiểm tra chữ ký
  `X-Hub-Signature-256` bằng bí mật trong `env/webhook.env`, chỉ nhận push
  lên `main` của đúng repo, và chỉ làm một việc: ghi lại file trigger.
- `little-buddy-deploy.path` thấy file trigger đổi thì chạy
  `little-buddy-deploy.service` (root), tức `deploy/auto_deploy.sh`: fetch
  `origin/main` vào `/opt/little-buddy/repo`, build frontend trong một
  container Node 22 dùng xong bỏ, rồi chạy `deploy/remote_deploy.sh`. Push
  liên tiếp gộp lại; push đến giữa lúc đang triển khai sẽ được triển khai
  thêm một lượt. Commit đã chạy rồi thì bỏ qua.
- Theo dõi: `journalctl -u little-buddy-deploy -f` (lượt triển khai),
  `journalctl -u little-buddy-webhook` (các lần GitHub gọi).
- Bản triển khai tay (dưới đây) và bản tự động khóa lẫn nhau (`deploy.lock`).
  Lần push kế tiếp sẽ thay bản tay bằng `origin/main`.
- Tắt tự động: `systemctl disable --now little-buddy-deploy.path`.

Webhook trên GitHub (Settings, Webhooks): Payload URL như trên, content type
`application/json`, secret là `WEBHOOK_SECRET` trong `env/webhook.env`, chỉ
sự kiện `push`.

## Triển khai bản mới bằng tay

Từ thư mục gốc của repo, trong Git Bash (cần `.env` ở thư mục gốc có
`SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`; mật khẩu được đưa cho ssh qua
`SSH_ASKPASS` nên không hiện trên dòng lệnh):

```bash
bash deploy/deploy.sh
```

Script build `frontend/` trên máy dev, gửi mọi file git theo dõi trong
`backend/`, `brain/`, `deploy/` (file bị `.gitignore` như `.env` không bao
giờ rời máy), rồi trên máy chủ: build image, chạy migration của cả hai dịch
vụ, khởi động lại container, thay thư mục site, cập nhật file nginx của
riêng site này nếu đổi (hoàn lại bản cũ nếu `nginx -t` hỏng), và chờ
`/healthz` của backend và brain. Thay đổi chưa commit cũng được gửi; mã
commit kèm hậu tố `-dirty` được ghi vào `deployed_rev`.

Quay lại bản trước (chỉ an toàn khi bản mới không có migration):

```bash
cd /opt/little-buddy && rm -rf src && mv src.old src
docker compose -f src/deploy/compose.yml up -d --build
cd /var/www/little-buddy && rm -rf site && mv site.old site
```

## Vận hành (trên máy chủ)

```bash
cd /opt/little-buddy
c="docker compose -f src/deploy/compose.yml"
$c ps
$c logs --tail 100 backend      # hoặc brain, redis
$c restart backend
```

Gọi API vận hành:

```bash
TOKEN=$(grep ^ADMIN_TOKEN= env/backend.env | cut -d= -f2- | tr -d "'")
curl -s -H "Authorization: Bearer $TOKEN" 'http://127.0.0.1:3600/admin/devices?status=active'
# cấp credit cho một gia đình (family_id lấy từ danh sách thiết bị)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"amount":50,"reason":"demo"}' http://127.0.0.1:3600/admin/families/<family_id>/credits
```

Tạo thêm đồ chơi (nhãn lô: 3 đến 16 chữ in hoa hoặc số):

```bash
$c run -T --rm --no-deps --user root backend node scripts/provision_batch.js \
  --label WEBDEMO2611 --count 5 --hardware-rev web --out manifests/WEBDEMO2611.csv --yes </dev/null
chmod 600 manifests/WEBDEMO2611.csv
cut -d, -f2,4 manifests/WEBDEMO2611.csv     # serial và mã ghép, không in bí mật
```

## Cấu hình production

- `NODE_ENV=production`: mọi bí mật (`JWT_SECRET`, `ADMIN_TOKEN`,
  `DEVICE_KEK`, `BRAIN_TOKEN`) là giá trị ngẫu nhiên mới, khác bản dev.
- `WEB_TOY=on`: phụ huynh trò chuyện với Buddy ngay trên web (production mặc
  định tắt).
- `PAYMENT_PROVIDER=disabled`: production không cho thanh toán demo (nó tặng
  credit miễn phí), nên mua gói credit trên web bị tắt. Gia đình mới nhận
  `WELCOME_CREDITS`; muốn thêm thì cấp bằng API vận hành ở trên.
- `HOST=127.0.0.1`, `TRUST_PROXY=2` (Cloudflare rồi nginx, để giới hạn tần
  suất theo IP thật của người dùng).
- `brain.env` giữ nguyên các khóa API và tham số của bản dev; `LLM_LOG_FILE`
  và `STT_DUMP_WAV` để trống (production từ chối chúng).

Backend gửi ping WebSocket mỗi 30 giây: Cloudflare cắt kết nối im lặng quá
100 giây, mà đồ chơi trên web không gửi heartbeat.

## Dựng lại từ đầu

Đã làm một lần ngày 2026-10-02; chỉ cần lại nếu dựng máy mới.

1. Tạo `/opt/little-buddy/{env,manifests,upload}` (env và manifests `chmod 700`)
   và `/var/www/little-buddy/{site,acme}`; đặt hai file env (`chmod 600`).
2. Postgres (`sudo -u postgres psql`): `CREATE ROLE littlebuddy LOGIN PASSWORD '...'`,
   `CREATE DATABASE littlebuddy OWNER littlebuddy`, tương tự `littlebuddy_brain`,
   rồi `CREATE EXTENSION vector` trong cả hai database (cần quyền superuser).
3. Cloudflare: bản ghi A `little-buddy` trỏ về IP máy chủ, **tắt proxy** trước.
4. nginx: file tạm chỉ có cổng 80 phục vụ `/.well-known/acme-challenge/` từ
   `/var/www/little-buddy/acme`, `nginx -t`, reload; rồi
   `certbot certonly --webroot -w /var/www/little-buddy/acme -d little-buddy.curiopal.com --deploy-hook "systemctl reload nginx"`.
   (Cloudflare bật Always Use HTTPS và SSL Full strict, nên chưa có chứng chỉ
   thì không xác thực được qua proxy.)
5. `bash deploy/deploy.sh` (thay file nginx tạm bằng bản thật).
6. Nội dung đời sống của Buddy:
   `$c run -T --rm --no-deps brain node scripts/seed_botlife.js </dev/null`.
7. Bật lại proxy cho bản ghi DNS.
