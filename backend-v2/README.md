# Little Buddy backend v2

Backend mới theo đề xuất kỹ thuật trong tài liệu Little Buddy (các tab "Technical proposal", "Database design" và "API design"). Đây là lát cắt đầu tiên của Giai đoạn 1: một Buddy biết nói, có tính cách, biết nhớ và an toàn, chạy được từ đầu đến cuối với OpenAI và ElevenLabs thật.

Ba tiến trình dùng chung một PostgreSQL có pgvector:

| Tiến trình | Lệnh | Việc |
|---|---|---|
| Parent API | `npm run api` | REST `/v1` cho app phụ huynh (Fastify), cổng 3100 |
| Voice service | `npm run voice` | WebSocket `/v1/device` cho đồ chơi, cổng 3101 |
| Worker | `npm run worker` | Học sau mỗi lượt, ngủ đêm, báo động, bảo trì |

`npm run dev` chạy cả ba trong một tiến trình (tự migrate và seed), để gỡ ghép đồ chơi trên API đóng socket của nó ngay.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `migrations/` | `001_schema.sql` (34 bảng của tab Database design), `002_ops.sql` (phiên đăng nhập, hàng đợi job, idempotency, hàm partition 30 ngày) |
| `src/voice/` | Giao thức thiết bị, phiên kết nối, pipeline một lượt nói |
| `src/character/` | Bộ máy nhân vật: bộ nhân vật (Bo, Pip, Luna), director, tâm trạng, bộ dựng prompt, bộ tách câu trả lời, bảng hỏi |
| `src/memory/` | Truy hồi (ngân sách 300 ms), learner, digest, so khớp tên, "quên hết" |
| `src/safety/` | Luật kiểm tra từng câu, sự kiện an toàn |
| `src/gateway/` | Một giao diện cho OpenAI và ElevenLabs, cộng bản giả lập (fake) cho dev và test |
| `src/api/` | Parent API: xác thực, trẻ, đồ chơi, Buddy, bảng hỏi, trí nhớ, cảnh báo, digest, nudge, mục tiêu, giới hạn |
| `src/jobs/` | Hàng đợi trên Postgres, worker, ngủ đêm, lịch |
| `src/auth/`, `src/devices/` | Token phụ huynh, đăng nhập email và Apple/Google, khóa bí mật của đồ chơi |
| `src/sim/`, `src/bin/toy.ts` | Đồ chơi giả lập nói đúng giao thức |
| `test/` | Unit, integration (PGlite: PostgreSQL thật chạy bằng WebAssembly, có pgvector) và end-to-end |

## Chạy

Cần Node 23.6 trở lên (máy dev dùng 25.9: Node chạy thẳng file `.ts`, không cần build) và PostgreSQL 16+ có pgvector. pgvector 0.7+ lưu embedding dạng `halfvec`; bản 0.6 (như máy demo) tự lùi về `vector` lúc migrate.

```
cp .env.example .env          # GATEWAY=fake chạy không cần khóa API
npm install
npm run migrate
npm run seed                  # bộ nhân vật Bo, Pip, Luna
npm run provision -- --count 1 --label dev    # ghi manifest vào manifests/ (gitignored)
npm run dev
```

Thử bằng đồ chơi giả lập:

```
npm run toy -- --manifest manifests/dev-<số>.json --claim     # in mã ghép, gửi qua POST /v1/devices/claim
npm run toy -- --manifest manifests/dev-<số>.json --text "Con chó Mochi của con bị ngã xuống vũng nước"
npm run toy -- --manifest manifests/dev-<số>.json --wav loi-noi.wav   # WAV 16 kHz mono 16-bit
```

Lượt nói bằng chữ (`--text`) chỉ có khi `ALLOW_TEXT_TURNS=1`; production từ chối.

## Một lượt nói

Phần lớn việc chạy trong lúc bé còn đang nói, nên khi đồ chơi báo `turn_end` thì gần như chỉ còn chờ câu trả lời:

1. `turn_start`: kiểm tra giờ yên lặng và giới hạn, tải hồ sơ bé, Buddy và ngày hôm nay của Buddy (tâm trạng, nhật ký, digest, nudge), rồi mở một phiên Scribe realtime (`scribe_v2_realtime`, commit thủ công, keyterms là tên bé, tên Buddy và những người bé hay nhắc).
2. Trong lúc bé nói: âm thanh lên Scribe từng khúc 100 ms. Mỗi bản nháp mới (khoảng một giây một lần) khởi động classifier và truy hồi trí nhớ trên những chữ đã nghe; bản cũ bị hủy.
3. `turn_end`: commit, bản cuối về sau khoảng 0,4 s. Nếu bản cuối trùng chữ với bản nháp đã phân tích (bỏ qua hoa thường, khoảng trắng và dấu câu; dấu thanh vẫn tính vì "ma" khác "má") thì dùng lại kết quả, không thì phân tích lại.
4. Kiểm duyệt đầu vào chạy song song và chỉ được đọc sau khi Buddy trả lời: nó để ghi nhận, không để chặn.

Phiên realtime lỗi thì lượt nói dùng bản nháp cuối, hoặc Scribe batch trên âm thanh đã đệm; `ELEVENLABS_STT_STREAMING=0` dùng batch hẳn. Mỗi lượt ghi một dòng log `turn timing`, chỉ có id và số mili giây (nhận dạng, ngữ cảnh, token đầu, âm thanh đầu, có dùng lại kết quả nháp không, bắt đầu sớm bao nhiêu).

## Tên riêng trong lời bé

Tên ở nhà của trẻ Việt thường là một từ thường (Mít là quả mít, Mực là con mực, Mai là ngày mai), và lời nói không có chữ hoa, nên Buddy không tìm tên theo chính tả. `src/memory/names.ts` đọc mỗi lần một cái tên xuất hiện theo ngữ cảnh:

- **Dấu thanh vẫn tính:** "sấm", "sâm" không phải Sam; "ba" (số ba) không phải Bà.
- **Chữ đứng trước:** bạn, anh, chị, cô, chú, ông, bà, bé... là người; "con", chó, mèo, cá... là con vật; cây, quả, múi, cái, màu... và ăn, nấu, hái... là từ thường; trường, lớp, quê, đi, về... là nơi chốn. Có cả bản tiếng Anh (my friend, my dog, a, the...).
- **Loại thẻ:** người, thú cưng, đồ chơi, nơi chốn không bao giờ lẫn sang nhau; con chó tên Sam là một thẻ khác với bạn Sam.
- **Cách bé hay gọi** (`person.cues`, ví dụ "bạn mít", "con chó mực") và **nghĩa thường của tên** (`person.also_word`, ví dụ "jackfruit"), do learner ghi; một danh sách sẵn trong code phủ các thẻ chưa có nghĩa.
- **Chữ hoa giữa câu** mà Scribe đặt cho tên: "bạn Mít" có, "ăn mít" không.

Mỗi thẻ được xếp là chắc chắn, chưa chắc, hoặc chỉ là từ thường. Thẻ chưa chắc được hỏi kèm classifier (vốn chạy sẵn trong lúc bé nói, nên không thêm độ trễ); không có câu trả lời thì bỏ qua, vì thiếu một người ít hại hơn nói nhầm người. Khi bé dùng tên như từ thường, brief nói rõ với Buddy ("mít" ở đây là quả mít, không phải bạn Mít) và fact về người đó không vào câu trả lời. Hai người trùng tên mà không có gì phân biệt thì Buddy được dặn hỏi lại một lần.

Learner liên kết người theo mã trong danh sách (`p1`, `p2`...) mà model trả về, không gộp theo chính tả. Chỉ khi model không trả mã mới dùng tên: trùng tên, hoặc nghe nhầm một chữ (Mứp thành Mướp) trong cùng loại thẻ, không bao giờ với danh xưng hay từ chỉ người thân (cô Lan khác chị Lan, bà nội khác bà ngoại). Tên trường, lớp và địa chỉ không bao giờ được lưu.

## Lớn lên cùng nhau (giai đoạn 3)

Giai đoạn 3 trong lộ trình của tài liệu sản phẩm, cộng thêm thư viện trò chơi:

- **Trò chơi** (`src/character/play.ts`): hù, ú òa, giả vờ ngủ, nói nhầm cố ý, đoán tiếng con vật, đố vui, đồng dao, oẳn tù tì, đóng vai, kể chuyện nối tiếp, thích cái nào hơn, nói nhanh líu lưỡi, và hai trò song ngữ. Buddy tự rủ chơi thỉnh thoảng (khoảng một lượt trong bốn khi tinh nghịch nhất, không bao giờ hai lần trong bốn lượt), ưu tiên trò bé từng chơi tiếp (`what_works`), không trò sôi nổi lúc buồn ngủ, một trò kéo dài tối đa bốn lượt.
- **Trò hù dọa vui** chỉ khi bé đang vui và đã đồng ý (lượt đầu chỉ rủ, lượt sau mới hù), giọng nhẹ, cười ngay sau đó; không bao giờ khi bé buồn, sợ, buồn ngủ, giọng nhỏ hơn thường lệ, hay với bé thận trọng hoặc nhạy cảm; phụ huynh tắt được (`surprise_play`).
- **Tính cách bé** (`src/memory/traits.ts`): mỗi đêm, từ tóm tắt các cuộc trò chuyện; chỉ dùng khi có ít nhất 3 đêm trải trên khoảng hai tuần cùng một hướng. Buddy dùng nó để cư xử ("bé cần thời gian làm quen: đừng hối"), không bao giờ nói ra như một cái nhãn. Phụ huynh xem và xóa được.
- **Tấm gương trưởng thành**: ở giai đoạn bạn thân, khi bé khoe tin vui gần với một điều bé từng thấy khó hoặc sợ (cũ hơn 3 tuần), Buddy nhắc lại kiểu "nhớ hồi đó không", mỗi điều tối đa một lần một tháng, một lần mỗi phiên. Learner nối điều cũ với điểm mạnh mới; digest tuần ghi lại sự trưởng thành.
- **Mục tiêu của phụ huynh**: một lần mỗi phiên, chỉ khi hợp lúc (thói quen đi ngủ chỉ khi gần giờ ngủ).
- **Chơi song ngữ**: kho từ (`word_bank`) ghi từ Buddy dạy và từ bé tự nói, ôn lại sau 1, 3, 7, 14, 30 ngày; bật khi chế độ song ngữ hoặc mục tiêu `english_words`. Digest tuần liệt kê từ mới.
- **Giọng nói của bé** (`src/voice/tone.ts`): độ to, cao độ, tốc độ, đo ngay khi âm thanh tới, so với giọng thường ngày của chính bé (học dần, cần 5 lượt). Chỉ thêm một gợi ý vào brief; lời bé vẫn quyết định an toàn.
- **Buddy nói trước**: đã làm nhưng tắt, theo quyết định "tạm thời không". Chỉ chạy khi cả máy chủ (`SPEAK_FIRST=1`) và phụ huynh (`speak_first`) cho phép, khi đồ chơi báo `status` với `event: "wake"`, một lần mỗi ngày, sau ít nhất 3 giờ không nói chuyện; máy chủ gửi `buddy_turn` trước khi có mặt và âm thanh.
- Migration `005_growing_up.sql`; API mới: `GET /children/:id/traits`, `DELETE /children/:id/traits/:name`, `GET /children/:id/words`, và hai công tắc `surprise_play`, `speak_first` trong `PUT /children/:id/controls` (không bắt buộc, client cũ vẫn chạy).

## Nghe trẻ nói chưa rõ

Thử bằng giọng tổng hợp đọc kiểu trẻ nhỏ: Scribe kéo âm của trẻ về một từ có thật, đôi khi đúng ("hông thít" thành "không thích"), đôi khi thành một từ sai mà trông vẫn hợp lệ ("cái chăng" là mặt trăng thành "cái chăn", "đau lăng" thành "đau lăn"). Đưa câu hỏi của Buddy cho Scribe làm ngữ cảnh không cứu được "trăng"; còn model có ngữ cảnh thì đọc lại đúng cả năm câu. Nên phần sửa nằm ở tầng ngôn ngữ, đi kèm các lời gọi vốn đã có:

1. **Classifier và brief biết đây là lời trẻ nhỏ qua máy nghe**: classifier nhận câu Buddy vừa nói và thói quen nói của bé, trả về `meant` (bé muốn nói gì) và `clarity` (`clear`, `unsure`, `unclear`); tiếng ậm ừ khi đang nghĩ vẫn là `clear`. Brief luôn dặn Buddy hiểu ý bé từ cuộc trò chuyện, không bao giờ sửa cách bé nói, và ghi "bé nhiều khả năng đã nói" khi khác chữ nghe được. Không thêm độ trễ.
2. **Ngữ cảnh cho máy nghe**: câu Buddy vừa nói đi kèm khúc âm thanh đầu tiên (`previous_text` của Scribe realtime); từ riêng của bé (đồ chơi, nhân vật hoạt hình) vào keyterms.
3. **Thói quen nói của từng bé** (`speech_lexicon`, migration 006): learner ghi "đau lăn" là "đau răng" khi bé xác nhận lời đoán của Buddy ở lượt trước; chỉ dùng từ lần thứ hai. Phụ huynh thêm, xem, xóa được (`GET`, `POST`, `DELETE /children/:id/speech`), và mục của phụ huynh dùng ngay, không bao giờ bị learner ghi đè.
4. **Hỏi lại như một người bạn**: lời đoán quan trọng mà chưa chắc thì Buddy kiểm tra bằng lời của mình ("Cậu bị đau răng hả?"); chữ nghe không ra thì Buddy hỏi lại theo cách vui của nó, tối đa một lần liên tiếp; nguy hiểm và cảm xúc vẫn được ưu tiên trước.
5. **Ý kiến thứ hai**: khi luồng realtime trả về rỗng hoặc quá ít chữ so với lượng giọng nói (dưới một chữ cho mỗi hai giây), Scribe batch chạy lại trên âm thanh đã giữ, chỉ những lượt đó tốn thêm khoảng một giây. Vẫn không có chữ nào thì Buddy hỏi lại bằng lời thay cho clip, lần sau mới dùng clip.

## Triển khai

backend-v2 chạy trên máy chủ demo, cạnh bản demo chứ không thay nó: Parent API ở `https://little-buddy.curiopal.com/v2/...`, socket đồ chơi ở `wss://little-buddy.curiopal.com/v2/device`. Mỗi lần push lên `main` tự triển khai cả hai; cách vận hành ở `deploy/README.md`. Image chạy thẳng mã TypeScript trên Node 24.

## Kiểm thử

```
npm test                      # 166 test (40 test là "một năm của ba bé"), không cần Docker
npm run typecheck
GATEWAY=live npm run smoke:live   # gọi OpenAI và ElevenLabs thật bằng câu giả lập, in thời gian
```

### Một năm của ba bé

`test/history/` là lịch sử trò chuyện hơn một năm (28/9/2025 đến 29/10/2026) của ba bé, được phát lại qua backend thật để làm dữ liệu ban đầu cho test:

| Bé | Nơi ở | Buddy | Điểm nhấn trong năm |
|---|---|---|---|
| Mai, 5 lên 6 tuổi | Hà Nội | Bo, bạn cùng tuổi, tiếng Việt | nói gần như mỗi ngày; cá vàng mất, em trai ra đời, vào lớp 1 |
| Minh (Bi), 7 lên 8 | TP. Hồ Chí Minh | Bo, tháng 1 đổi sang Pip; anh trai; song ngữ | bị bạn đánh (cảnh báo khẩn), bố tắt học trong hè |
| An Nhiên (Lily), 4 lên 5 | San Jose (giờ Los Angeles) | Luna, người lớn hiền hậu, tiếng Anh | nghỉ hè 7 tuần ở Việt Nam, qua hai lần đổi giờ mùa hè |

- Mỗi bé có khoảng 45 phiên viết tay cho những chuyện quan trọng (kèm những gì learner phải rút ra) và khoảng 30 mẩu chuyện thường ngày lặp theo lịch tuần; `plan.ts` mở rộng thành khoảng 1.000 lần ngồi nói và 3.500 lượt.
- `replay.ts` giả lập đồng hồ (mock `Date` dời luôn `now()` trong PGlite) rồi cho cả năm chạy qua Parent API thật (đăng ký, ghép đồ chơi, bảng hỏi, nudge, sửa fact, tắt bật học, đổi nhân vật), learner, ngủ đêm, digest tuần và bảo trì, trong khoảng 20 giây. Test đọc kết quả đó; test nào sửa dữ liệu thì chạy trên bản sao.
- `node test/history/check.ts mai minh lily` kiểm tra một lịch sử; `node test/history/export.ts` ghi bản đọc được ra `out/history/`.
- Dữ liệu một năm làm lộ ra 5 lỗi, cả 5 đã sửa: trí nhớ về một phiên trả ra JSON thô, hỏi lại chuyện sắp tới theo giờ UTC thay vì giờ của bé, ngủ đêm vẫn tóm tắt phiên khi đã tắt học, bảo trì chạy lại mỗi lần lịch kêu, và "Bà" bị gộp vào "Bảo" (sửa cùng phần đọc tên theo ngữ cảnh).
- `child.learning_since` (migration 003) ghi lúc học được bật lại; ngủ đêm chỉ tóm tắt các phiên bắt đầu sau mốc đó. NULL nghĩa là học đã bật từ khi tạo hồ sơ bé.

## Đánh giá chất lượng: 50 kịch bản

`eval/` hỏi một câu: Buddy có giống một người bạn không? 50 kịch bản chia theo chín phẩm chất (cảm xúc, hiểu, lắng nghe, tinh nghịch, nhân vật, tính cách, trí nhớ, hiểu bé như một con người, an toàn), mỗi kịch bản ghi rõ mục nào của tài liệu sản phẩm.

- Mỗi kịch bản dựng một thế giới riêng trong PGlite (Buddy, bé, những gì Buddy đã nhớ), rồi chạy qua voice service thật với đồ chơi giả lập nói bằng chữ. Learner chạy sau mỗi lượt; giữa các phiên có ngủ đêm và "trôi qua N ngày". Giọng nói được ghi lại thành chữ, không gọi ElevenLabs.
- Chấm hai lớp: kiểm tra cố định (lời đáp, mặt, loại lượt, trí nhớ đã lưu, cảnh báo an toàn) và một model giám khảo chấm từng tiêu chí theo thang chất lượng rút từ tài liệu, kèm trích dẫn.
- Báo cáo ở `eval/reports/<thời điểm>/report.md` (gitignored): kết quả theo phẩm chất, quy tắc nói (số câu, tối đa một câu hỏi, khoảng 15 giây), từng lỗi kèm bằng chứng, toàn bộ hội thoại.

```
GATEWAY=live npm run eval                       # cả 50, có giám khảo (cần OPENAI_API_KEY), vài phút
GATEWAY=live npm run eval -- --only EMO,MEM-02  # theo mã hoặc tiền tố
GATEWAY=fake npm run eval -- --no-judge         # chỉ chạy thử harness, miễn phí
```

`EVAL_JUDGE_MODEL` (mặc định là `OPENAI_REPLY_MODEL`) và `EVAL_JUDGE_EFFORT` (mặc định `medium`) chọn giám khảo. `--recall-budget` mặc định 2500 ms, vì lượt nói bằng chữ không có truy hồi chạy trước trong lúc bé nói như ngân sách 300 ms của production.

Kịch bản trượt là một phát hiện, không phải lỗi kịch bản: vài kịch bản kiểm tra lời hứa của tài liệu mà code chưa làm, như câu "người lớn giúp trông các cuộc trò chuyện" trong tuần đầu, "quên chuyện đó đi", hay em của bé nói thay.

## Đã kiểm chứng ngày 30/10/2026

- 166 test đều đạt; typecheck sạch.
- Migration chạy trên PostgreSQL 16.15 + pgvector 0.6.0 của máy demo, trong một database tạm đã xóa sau đó: 39 bảng, 72 index, cột `vector(1536)`, hàm partition, hàng đợi job (chống trùng, `SKIP LOCKED`) đều đúng.
- Gọi vendor thật: câu trả lời có token đầu sau 1,5 s; giọng nói có âm thanh đầu sau 0,34 s; Scribe batch nhận lại câu tiếng Việt đúng từng chữ trong 1,3 s. Classifier, trung vị của 5 lần khi đã ấm: gpt-5.6-luna 1,1 s, gpt-5.4-nano và gpt-5.4-mini 0,9 s, gpt-4.1-mini 0,7 s; cả bốn gán nhãn đúng ba câu thử, kể cả "anh con đánh con đau lắm" là hurt, urgent.
- Lượt nói đầy đủ qua voice service: giọng tiếng Việt tổng hợp gửi đúng nhịp micro rồi 1,3 s im lặng (như bộ phát hiện giọng của đồ chơi web), đo từ `turn_end` đến lúc đồ chơi nghe âm thanh đầu tiên của Buddy, mỗi cấu hình 4 lượt sau một lượt khởi động. Buddy nghe đúng từng chữ và đáp đúng vai ("Wowee, tớ vui lây luôn, Bông ơi! Cậu vẽ chú mèo màu gì thế?").

| Cấu hình | Âm thanh đầu sau `turn_end` |
|---|---|
| Trước streaming (Scribe batch, classifier chặn; đồ chơi gửi nhanh hơn thời gian thực) | 5,1 s |
| Mặc định (classifier gpt-5.6-luna, tier thường), 8 lượt | 7 lượt từ 2,2 đến 3,2 s, một lượt 4,1 s do token đầu của câu trả lời chậm; trung vị 2,6 s |
| `OPENAI_FAST_MODEL=gpt-4.1-mini`, `OPENAI_FAST_EFFORT=` | 2,4 đến 2,5 s |
| Thêm `OPENAI_SERVICE_TIER=priority` | 1,8 đến 2,0 s |

Bản cuối của Scribe về sau 0,33 đến 0,47 s. Kết quả nháp được dùng lại ở mọi lượt đo, bắt đầu trước `turn_end` 0,3 đến 0,9 s. Phần còn lại chủ yếu là token đầu của câu trả lời (1,0 đến 2,0 s ở tier thường, 0,9 đến 1,1 s ở tier priority) và câu đầu cộng giọng nói (0,5 đến 0,8 s). Khoảng một nửa đến hai phần ba token đầu vào của câu trả lời trúng prompt cache. Mức `reasoning_effort` của câu trả lời (không đặt, `none`, `low`) không đổi token đầu rõ rệt.

gpt-4.1-mini không nhận `reasoning_effort`: phải để `OPENAI_FAST_EFFORT=` trống, nếu không mọi lần phân loại lỗi 400 và lùi về trung tính, tức là mất tín hiệu an toàn từ classifier. Tier fast cũng chạy learner, nên đổi model này đổi cả chất lượng học.

Tên riêng với Scribe thật (giọng tổng hợp): Scribe giữ đúng mọi dấu thanh ("Bà cho con ba cái kẹo") và viết hoa tên sau từ chỉ người ("bạn Mít ăn mít dưới gốc cây mít", "Bạn Sam bắt được một con sam"), nhưng không viết hoa tên thú cưng sau "con" ("Con mực nhà con sủa" cho con chó tên Mực); keyterms không đổi kết quả. Trước khi sửa, so khớp bỏ dấu biến "trời có sấm", "mua sâm" và "con sam" đều thành bạn Sam, "con có ba con cá" thành Bà, "mẹ nấu mực" thành con chó Mực, và learner gộp một con chó tên Sam vào bạn Sam.

## Khác với đề xuất kỹ thuật

- **Ngôn ngữ:** TypeScript theo đề xuất (Node bỏ kiểu khi chạy), khác quy ước JS thuần của backend cũ.
- **Hàng đợi:** bảng `job` trên Postgres thay cho SQS; một máy chủ không cần thêm dịch vụ.
- **Chưa có Redis:** lịch sử hội thoại nằm trong bộ nhớ voice service (socket gắn một tiến trình), thời gian nói lấy từ `usage_daily`, giới hạn tần suất trong bộ nhớ. Đủ cho một instance.
- **Âm thanh:** PCM16 16 kHz thay cho Opus; giao thức đã có trường `codec`.
- **Tên:** so khớp trong app (bỏ dấu, khoảng cách chỉnh sửa), nên database chỉ cần extension `vector`; email duy nhất theo `lower(email)`.
- **Đăng nhập email:** chưa có dịch vụ gửi mail; dev trả mã trong response, production dùng Apple hoặc Google.
- **Thông báo đẩy:** được ghi vào bảng `notification`, chưa gửi qua APNs hoặc FCM.
- **Ngủ đêm:** gọi OpenAI trực tiếp, chưa dùng Batch API.
- **Row-level security:** chưa bật; mọi truy vấn đã lọc theo gia đình ở tầng app.
- **Chưa làm:** xuất dữ liệu, mời phụ huynh thứ hai, staff API, sinh file OpenAPI, thời tiết trong nhật ký, phát hiện nỗi buồn lặp lại, phát hiện người nói không phải bé, file clip cục bộ (filler) cho đồ chơi.

## Việc tiếp theo

1. **Độ trễ (trung vị 2,6 s, mục tiêu 2,5 s):** một biến riêng cho model của classifier (gpt-4.1-mini đo được 0,7 s) để không đổi model của learner; tier priority cho câu trả lời (nhanh hơn khoảng 0,5 s nhưng đắt hơn); đặt máy chủ gần Việt Nam; nói câu đầu sớm hơn mà vẫn kiểm tra an toàn trên cả câu.
2. **Truy hồi hai ngôn ngữ:** `text-embedding-3-small` cho "thích xoài" và "loves mangoes" độ giống chỉ 0,20; thử `text-embedding-3-large` cắt còn 1.536 chiều cho gia đình song ngữ.
3. **Giai đoạn 3 trên dữ liệu thật:** chỉnh ngưỡng giọng nói và tính cách bằng giọng trẻ thật; màn hình cho phụ huynh xem tính cách, kho từ và hai công tắc mới.
4. **Tên riêng:** cho phụ huynh sửa cách gọi và nghĩa thường của một thẻ, gộp và tách thẻ trong app; thêm kịch bản eval cho tên trùng từ thường; đo lại trên giọng trẻ thật, không chỉ giọng tổng hợp.
5. Adapter Redis và SQS khi chạy nhiều instance.
6. Opus trên đồ chơi và máy chủ.
7. Row-level security và một role database cho mỗi dịch vụ.
8. Thông báo đẩy và dịch vụ gửi mail (production chưa đăng nhập email được).
