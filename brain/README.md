# Little Buddy brain

Dịch vụ "bộ não" của Buddy: nhận một lượt nói (giọng hoặc chữ) từ backend, chạy nhận dạng giọng nói, ký ức, dựng prompt, gọi LLM, tổng hợp giọng nói, rồi trả về câu trả lời kèm cảm xúc và âm thanh. Đây là bản tái cấu trúc của nguyên mẫu `D:\Intern\LittleBuddy\app-b` (nguyên mẫu giữ nguyên làm tài liệu tham chiếu, không sửa).

- Chỉ chạy chế độ **batch**: ElevenLabs STT batch (scribe_v2) và TTS batch. Không có streaming, speculative, Vbee, model local hay director.
- Ba LLM: **OpenAI, Anthropic, Qwen**, mỗi hãng một module chiến lược, cùng một kiểu kết quả `LlmResult`. Chọn bằng `LLM_PROVIDER`.
- Embedding cố định: `text-embedding-3-large`, 3072 chiều (hằng số trong code, không phải biến môi trường).
- Giao kèo HTTP với backend nằm ở `docs/contract.md`. Sửa giao kèo trước, rồi mới sửa code.

## Chạy

Cần Docker Desktop đang chạy và Node 22.

```
docker compose up -d          # ở thư mục gốc repo: Postgres (pgvector) + Redis
cd brain
npm install
copy .env.example .env        # PowerShell; bash thì dùng cp, rồi điền key
npm run migrate               # tự tạo database littlebuddy_brain và extension vector nếu thiếu
npm run seed:botlife          # tiểu sử và nhật ký của Buddy (vi + en), ngày tính theo hôm nay
npm run voice-samples -- <id>:<vi|en> ...   # giọng mẫu cho trang web, ghi vào frontend/public/voice-samples/
npm run dev                   # http://127.0.0.1:8080/healthz
npm test                      # toàn bộ test (cần Docker)
npm run test:unit             # chỉ unit test, không cần Docker
```

Brain chỉ lắng nghe trên `127.0.0.1`: nó giữ ký ức của mọi đứa trẻ và chỉ tin một người gọi duy nhất là backend trên cùng máy, xác thực bằng `BRAIN_TOKEN` (giá trị phải trùng với `BRAIN_TOKEN` của backend).

Web toy (trình duyệt đóng vai món đồ chơi) dùng micro nên cần **secure context**: chạy qua `localhost` hoặc `https`, không chạy được qua địa chỉ IP LAN bằng http.

## API

| Route | Mô tả |
|---|---|
| `POST /v1/turns` | Một lượt nói. Giọng: body `application/octet-stream` PCM16 LE mono 16 kHz, metadata JSON trong header `x-lb-turn` (base64url, vì tên tiếng Việt không đi được trong header latin1). Chữ: body JSON `{...meta, text}`. Giới hạn 6 MB. |
| `DELETE /v1/subjects/:subject` | Xoá toàn bộ ký ức của một subject và lịch sử hội thoại trong RAM. Backend gọi khi gỡ ghép một món đồ chơi. |
| `GET /healthz` | `{ ok, provider, db }`, không cần token. |

Mọi route `/v1` cần `authorization: Bearer <BRAIN_TOKEN>`. Lỗi: `400 invalid_request`, `401 unauthorized`, `502 stt_failed | llm_failed` kèm `kind` (`refusal | empty | timeout | upstream`).

Nếu backend đóng kết nối giữa chừng, brain huỷ mọi lời gọi ra ngoài và **không ghi gì**: không lịch sử, không học. Mỗi lượt có hạn chót `TURN_TIMEOUT_MS`; quá hạn thì trả `502 llm_failed` với `kind: timeout` (hoặc `stt_failed`).

## Kiến trúc

```
server.js, app.js, config.js      config.js là nơi DUY NHẤT đọc process.env
http/turns.js, http/validate.js   route, bearer, kiểm tra metadata
turn/run_turn.js                  điều phối một lượt, không chứa quyết định nghiệp vụ
turn/emotion.js                   thẻ [happy] đầu câu -> 1 trong 14 cảm xúc, bỏ mọi thẻ khác trước TTS
llm/index.js, llm/result.js       registry chiến lược + LlmResult/LlmError
llm/providers/openai|anthropic|qwen.js
llm/helper.js                     lời gọi JSON của OpenAI cho extractor (luôn là OpenAI)
persona/text/vi.js, en.js         toàn bộ chữ trong prompt theo ngôn ngữ
persona/prompt.js                 dựng system prompt (hàm thuần)
persona/botlife.js, life.js       xúc xắc tâm trạng (thuần) và phần đọc/ghi DB
speech/stt.js, tts.js, wav.js     ElevenLabs batch
memory/retrieve.js                truy hồi song song theo từng nhánh
memory/learn.js                   ghi sau lượt, tuần tự theo subject
memory/blocks.js, enums.js, extract.js, names.js, history.js, embed.js
store/*.js                        chỉ SQL, tham số đầu là queryable
store/migrations/001_init.sql
scripts/migrate.js, seed_botlife.js, import_poc.js
```

### Một lượt đi qua những gì

1. Nạp tên quen của subject (cho keyterms và khối tên) song song với đời sống của Buddy (tiểu sử, nhật ký, tâm trạng).
2. Đầu vào: giọng thì gửi STT kèm keyterms và mã ngôn ngữ; clip dưới 0,3 giây hoặc transcript rỗng thì trả `no_speech: true` với câu "tớ chưa nghe rõ" theo vai và ngôn ngữ, mặt `confused`, có âm thanh. Chữ thì dùng nguyên, tối đa 2000 ký tự.
3. Ký ức, chờ tối đa `MEMORY_WAIT_MS`, nhánh nào về trước thì dùng trước; hết giờ vẫn giữ những nhánh đã về.
4. Prompt theo thứ tự của nguyên mẫu: AN TOÀN, CÁCH NÓI, VAI + TÍNH CÁCH, ĐỜI SỐNG, KÝ ỨC, rồi luật thẻ cảm xúc (luôn được nối thêm, kể cả khi có `LLM_SYSTEM_PROMPT`), rồi các khối ngữ cảnh của lượt.
5. Gọi LLM (không streaming). Trả lời rỗng hoặc bị từ chối là lỗi.
6. Tách cảm xúc, TTS câu đã làm sạch bằng giọng của đồ chơi. TTS lỗi thì vẫn trả chữ, `audio_b64: null`.
7. Lượt được giao xong mới ghi lịch sử (giữ nguyên thẻ để model tiếp tục gắn thẻ) và học (nếu `learn` bật).

### Subject và phạm vi ký ức

Mọi bảng ký ức khoá theo chuỗi `subject` do backend dựng: `child:<uuid>` khi món đồ chơi có gán bé, hoặc `device:<uuid>:<family uuid>` khi chưa gán. Có family trong subject nên đồ chơi đổi chủ không bao giờ thừa hưởng ký ức cũ. Tâm trạng theo từng đồ chơi, nhật ký và tiểu sử theo vai (friend, daddy, mommy, teacher) và ngôn ngữ.

Không có cache toàn cục nào chứa dữ liệu của trẻ. Lịch sử hội thoại ngắn hạn chỉ nằm trong RAM (Map theo subject + conversation, TTL 30 phút); khi tắt học, lời của bé không bao giờ được lưu xuống đĩa. Khởi động lại brain thì mất ngữ cảnh ngắn hạn, chấp nhận được.

Tâm trạng vẫn được ghi kể cả khi tắt học (khác nguyên mẫu, có chủ đích): tâm trạng là của Buddy, không phải của bé, và cả ngày phải chung một tâm trạng.

### Ngôn ngữ

`vi` hoặc `en` theo từng món đồ chơi. Chữ tiếng Việt chép nguyên văn từ nguyên mẫu (trừ dấu gạch dài đã đổi thành gạch ngắn theo luật của repo, và tên Buddy lấy từ hồ sơ); tiếng Anh là bản dịch sát nghĩa, xưng hô tiếng Anh theo vai. Database lưu mã tiếng Anh (`pet`, `likes`, `school`, `bright`...); `memory/enums.js` là nơi duy nhất đổi mã sang chữ của ngôn ngữ đang nói và ngược lại. Ký ức giữ nguyên ngôn ngữ lúc bé nói; embedding đa ngôn ngữ.

## Biến môi trường

File `.env.example` chia 8 nhóm. Các giá trị trong `.env` chép từ `app-b/.env`. Dưới đây là lý do của những giá trị đáng nhớ (rút gọn từ ghi chú của nguyên mẫu).

**1. Service.** `PORT`, `BRAIN_TOKEN` (production từ chối giá trị mặc định hoặc ngắn hơn 32 ký tự), `DATABASE_URL`, `TURN_TIMEOUT_MS` (mặc định 40000, phải nhỏ hơn `BRAIN_TIMEOUT_MS` của backend).

**2. API keys.** `OPENAI_API_KEY` bắt buộc khi bật ký ức, dù `LLM_PROVIDER` là gì: embedding và các extractor luôn là OpenAI. Key của provider đang chọn là bắt buộc. `ELEVENLABS_API_KEY` luôn bắt buộc.

**3. LLM.**
- `LLM_EFFORT`: Anthropic luôn gửi (mặc định `low`); OpenAI chỉ gửi `reasoning_effort` khi đặt rõ, vì model thường trả 400 với trường này; Qwen bỏ qua.
- `LLM_THINKING` (chỉ Anthropic): `disabled` cho chữ đầu tiên nhanh nhất; `adaptive` đổi tốc độ lấy chiều sâu và ghim temperature bằng 1.
- `LLM_TEMPERATURE` và hai penalty: để trống là không gửi trường. Model reasoning (gpt-5.x, o-series) từ chối chúng bằng lỗi 400 ngay lượt đầu. Qwen nhận temperature trong [0, 2) và từ chối số nguyên ("'temperature' must be Float"), nên số nguyên được cộng thêm 0,01.
- `LLM_SERVICE_TIER=fast` (chỉ OpenAI): đo thật trên prompt thật, fast 2,5 s so với default 3,6 s (giảm 31%, cắt đúng đuôi chậm), giá gấp đôi mỗi token. Cache của tier fast nóng riêng nên request fast đầu tiên trượt cache một lần. `flex` rẻ nửa giá nhưng có thể 429, đừng dùng cho đường nóng. Tier này cũng áp cho lời gọi sửa tên (nằm trên đường nóng), không áp cho extractor sau lượt.
- `LLM_MODERATION=score` (chỉ OpenAI): chấm điểm miễn phí ngay trong request, không thêm độ trễ đo được. Điểm về cùng câu trả lời nên chỉ là tín hiệu cho log (brain ghi hạng mục bị flag, không ghi nội dung), không chặn. `block` có ngưỡng chặn cao hơn ngưỡng flag nhiều: bé kể chuyện bạn đánh nhau (violence 0,52, flagged) vẫn được an ủi tử tế, đúng điều persona cần. Đã kiểm tra: response không streaming vẫn có trường `moderation`.
- `LLM_CACHE=0`: gửi `prompt_cache_key` riêng mỗi request để luôn trượt cache (không có cờ tắt cache). Trúng cache không làm câu trả lời giống nhau (đo 5 request y hệt, cache trúng 2852/2853 token, vẫn ra 5 câu khác nhau); chỉ đặt 0 để loại cache khỏi nghi vấn khi đo độ đa dạng.
- `QWEN_MAX_TOKENS=1024` thay vì 8000 mà workspace cho: câu trả lời được đọc thành tiếng cho bé, và model nhập vai sẽ lấp đầy mọi khoảng trống.
- `QWEN_BASE_URL`: endpoint theo vùng và theo workspace nên không có mặc định; thiếu thì brain không khởi động khi `LLM_PROVIDER=qwen`.

**4. Speech.**
- `ELEVENLABS_STT_MODEL` trống là `scribe_v2`. Đo thật: cùng một file, v1 nghe "tên Pôm", v2 nghe đúng "tên Bôm". Model realtime bị từ chối ngay lúc boot.
- `STT_KEYTERMS=1`: gửi tên quen làm gợi ý. Đo thật: không bật thì "Buddy ơi" thành "Bó đi ơi", "bạn Xoài" thành "bạn soi". Chỉ tên đã đủ tin cậy (`MEMORY_NAME_TRUST`) mới được gửi. Tốn thêm 20% tiền STT. `STT_KEYTERMS_MAX`: vượt 100 thì mỗi request bị tính tối thiểu 20 giây.
- `STT_AUDIO_EVENTS=0`: API mặc định BẬT gắn nhãn sự kiện âm thanh nên phải gửi false tường minh. Một cú click chuột từng thành câu "[tiếng click chuột]" và tốn trọn một lượt; clip bé khóc bị gắn nhãn [cười].
- `STT_NO_VERBATIM=1`: bỏ từ đệm và nói lắp. Lưu ý đã đo: "Không, không, không" bị gộp còn một "Không", mất sự nhấn mạnh.
- `STT_LOGGING=1`: `0` là zero-retention, đúng ra nên dùng cho sản phẩm trẻ em nhưng tài khoản hiện tại bị 403 và hỏng cả request. Đây là query param, đặt nhầm vào form thì API im lặng bỏ qua.
- `TTS_OUTPUT_FORMAT` phải là `pcm_*`: đồ chơi phát PCM16 thô. Giọng đọc (`voice_id`) nằm trong DB của backend, gửi sang theo từng lượt.
- `scripts/voice_samples.js` ghi cho mỗi giọng một câu chào của Buddy bằng đúng lệnh `createTts` của một lượt (cùng model, định dạng và `language_code`), bọc PCM thành WAV tại `frontend/public/voice-samples/<id>.wav` để phụ huynh nghe thử trong trang web. Mỗi lần chạy tốn khoảng 60 ký tự ElevenLabs cho một giọng; giọng mới thêm vào backend cần chạy lại cho giọng đó.

**5. Memory.**
- `MEMORY_RETRIEVAL`: `both | summary | verbatim`. `summary` rẻ hơn (919 so với 2363 ký tự mỗi lượt) nhưng đo trên thế giới seed thì tìm sai hơn: vector của một bản tóm tắt là trung bình của nhiều điểm khác chủ đề nên khớp yếu với mọi thứ. Giá trị hiện tại chép từ nguyên mẫu.
- `MEMORY_WAIT_MS=5000`: đủ nuốt cả spike 2 đến 5 giây của API embeddings; không chờ vô hạn để OpenAI treo thì đồ chơi chỉ im tối đa 5 giây. DB chỉ mất 3 đến 150 ms; embedding mới là chặng chậm.
- `MEMORY_DEDUPE_SCORE=0.97`: không lưu một lượt gần như trùng lượt đã có, để mười câu "chào" không chiếm hết chỗ truy hồi. Câu trả lời chỉ là "chưa biết" ngắn cũng không được lưu, vì lần sau nó sẽ khớp đầu tiên và model bắt chước câu "chưa biết".
- `MEMORY_CONTEXT=1`: mỗi mẩu trúng kéo theo cả cuộc trò chuyện của nó (một mẩu trúng thường chỉ là câu mở đầu câu chuyện). `MEMORY_CONTEXT_MIN_SCORE` là sàn lỏng cho các câu đi kèm; đừng siết.
- `MEMORY_NAMES`: học tên riêng bằng một lời gọi LLM nhỏ sau lượt. Chỉ tên do CHÍNH BÉ nói mới được lưu (tên nhân vật Buddy tự bịa trong truyện bị loại). `MEMORY_NAME_TRUST=2`: một tên phải được nghe ở 2 lượt khác nhau mới được tác động lên chữ khác; tin ngay một lần nghe nhầm ("Pôm" thay vì "Bôm") sẽ biến nó thành keyterm dạy STT nghe nhầm, đích sửa ghi đè chữ đúng, và dòng trong khối tên dạy model rằng cái sai là đúng.
- `MEMORY_NAME_FIX=1`: sửa tên bị nghe nhầm trên lượt giọng nói, chạy song song với truy hồi thô; bản sửa có kết quả thì thắng. Đo thật: "sắp" thành Sóc 3/3, "bút đi" thành Buddy 3/3. Bỏ qua nếu câu đã chứa sẵn một tên đã biết.
- `MEMORY_PROFILE`: hồ sơ bền về chính bé (thích, không thích, nỗi sợ, gia cảnh), cập nhật bằng thao tác add/bump/update/drop nên "thích kem" và "thích kem dâu" gộp làm một.
- `MEMORY_SUMMARY`: tóm tắt từng cuộc trò chuyện bằng các điểm đánh số và thao tác, không viết lại cả bản (viết lại là tam sao thất bản, chi tiết cũ nhất mòn trước). `MEMORY_SUMMARY_POINTS` là trần buộc model phải update/drop.
- `MEMORY_RECENT=3`: vài cuộc gần nhất luôn lên prompt, xếp theo thời gian chứ không theo độ giống, vì một lời hứa dang dở chẳng giống câu hỏi nào cả. Nhờ đó Buddy hỏi được "hôm trước chị Trâm dạy cậu vẽ chưa?".

**6. Bot life.** `BOT_LIFE_ENABLED=1`: Buddy có tiểu sử, nhật ký và mỗi ngày một tâm trạng 0 đến 100 (0 tệ nhất). Xúc xắc chọn một dải, nghiêng theo trang nhật ký mới nhất (trong 3 ngày) và chữ E/I của tính cách, rồi bốc một số trong dải. Ngày tính theo giờ Việt Nam. Tâm trạng có thể xám rõ (buồn, hờn dỗi là chủ đích) nhưng không bao giờ vượt trên AN TOÀN. Prompt cấm tuyệt đối việc đọc con số ra. Phụ huynh có thể ghim tâm trạng (`mood_pin`) trên dashboard; khi ghim, brain không ghi gì. `BOT_MOOD_FEEL=1` thêm tên và mô tả của dải dưới con số.

**7. Debug (chỉ dev).** `LLM_LOG_FILE` ghi nguyên văn prompt và câu trả lời mỗi lượt; `STT_DUMP_WAV` ghi WAV mỗi lượt giọng nói (tên file theo turn id, không theo transcript). Cả hai chứa lời của trẻ nên production từ chối khởi động nếu có đặt, và đều nằm trong `.gitignore`.

**8. Test seams.** `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL` (base của SDK không có `/v1`), `ELEVENLABS_BASE_URL`; Qwen dùng chính `QWEN_BASE_URL`. Để trống ngoài test.

Đã bỏ hẳn: mọi biến của Vbee và STT local, `STT_PROVIDER`, `TTS_PROVIDER`, các biến `*_MODE`, `SPECULATIVE`, `STABLE_PARTIAL_MS`, `FINAL_DEBOUNCE_MS`, `UPSTREAM_MS`, `VAD_SILENCE_SECS`, `TTS_SPECULATIVE`, `MEMORY_QUERY_MS`, `STT_FILTER_BACKGROUND`, `DIRECTOR_*`, `MEMORY_EMBED_*`, `LLM_BASE_URL`, `CHILD_AGE`. Chuyển vào DB của backend: `PERSONA`, `PERSONA_MBTI`, `CHILD_NAME`, `CHILD_BIRTH_YEAR`, `BOT_MOOD`, `MEMORY_WRITE` (thành `learn`, mặc định tắt), `TTS_VOICE_ID`, `LANGUAGE_CODE`.

## Nhập thế giới của nguyên mẫu

`scripts/import_poc.js` chép ký ức, tên quen, hồ sơ và tóm tắt của nguyên mẫu vào một bé (subject `child:<uuid>`), trong một transaction. Chạy lại được: dữ liệu cũ của subject bị xoá trước. `conversation_id` rỗng được gom theo luật khoảng lặng 3 phút của nguyên mẫu; vector phải đúng 3072 chiều; fact và tóm tắt chưa có vector thì được embed lại (cần `OPENAI_API_KEY`). Nhật ký không được nhập (ngày đã cũ), hãy chạy `seed:botlife`.

Database của nguyên mẫu là container `littlebuddy-pgvector` (thư mục `app-b`), cũng dùng cổng 5432 nên đụng với postgres của repo này. Hai cách:

1. Tạm dừng postgres của repo, bật container cũ lên một cổng khác, rồi trỏ `--source` vào đó:
   ```
   docker stop littlebuddy-postgres
   docker start littlebuddy-pgvector
   docker exec littlebuddy-pgvector pg_dump -U littlebuddy -d littlebuddy -Fc -f /tmp/poc.dump
   docker cp littlebuddy-pgvector:/tmp/poc.dump .
   docker stop littlebuddy-pgvector
   docker start littlebuddy-postgres
   ```
2. Khôi phục bản dump vào một database nháp trong container của repo rồi nhập từ đó:
   ```
   docker cp poc.dump littlebuddy-postgres:/tmp/poc.dump
   docker exec littlebuddy-postgres createdb -U littlebuddy poc_scratch
   docker exec littlebuddy-postgres psql -U littlebuddy -d poc_scratch -c "CREATE EXTENSION IF NOT EXISTS vector"
   docker exec littlebuddy-postgres pg_restore -U littlebuddy -d poc_scratch --no-owner /tmp/poc.dump
   npm run import:poc -- --source postgres://littlebuddy:littlebuddy@localhost:5432/poc_scratch --child <uuid của bé Bông> --dry-run
   npm run import:poc -- --source postgres://littlebuddy:littlebuddy@localhost:5432/poc_scratch --child <uuid của bé Bông>
   ```

## Test

`npm test` chạy unit và integration (cần Docker), từng file một, trên database `littlebuddy_brain_test`; helper từ chối mọi database không kết thúc bằng `_test`. Một server HTTP giả đứng thay OpenAI (chat, embeddings), Anthropic (`/v1/messages`), Qwen và ElevenLabs (STT, TTS) qua các biến seam, nên test không tốn tiền và không cần mạng.
