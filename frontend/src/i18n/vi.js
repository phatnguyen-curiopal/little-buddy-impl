import core from './parts/core.vi.js';
import talk from './parts/talk.vi.js';
import care from './parts/care.vi.js';
import wizard from './parts/wizard.vi.js';

const base = {
  // common
  close: 'Đóng', back: 'Quay lại', cancel: 'Huỷ', next: 'Tiếp tục', later: 'Để sau', done: 'Xong', save: 'Lưu', saving: 'Đang lưu…',
  tryAgain: 'Thử lại', wait: 'Chờ một chút…', show: 'Hiện', hide: 'Ẩn', optional: 'không bắt buộc',
  backHome: 'Về trang chủ', never: 'chưa kết nối', now: 'vừa xong', minsAgo: '{n} phút trước', hoursAgo: '{n} giờ trước',
  yesterday: 'hôm qua', daysAgo: '{n} ngày trước', unknown: 'chưa rõ', titleHome: 'Little Buddy · Người bạn biết lắng nghe của bé',

  // marketing nav
  navSections: 'Các phần của trang', navHow: 'Cách hoạt động', navEmotions: 'Cảm xúc', navSafety: 'An toàn', navPricing: 'Bảng giá', navFaq: 'Hỏi đáp',
  signIn: 'Đăng nhập', start: 'Bắt đầu', menu: 'Menu', closeMenu: 'Đóng',

  // hero
  heroEyebrow: 'Người bạn AI cho bé 4 đến 8 tuổi',
  heroA: 'Chạm nút.', heroB: 'Hỏi bất cứ điều gì.',
  heroSub: 'Bé chạm nút một lần rồi hỏi. Buddy tự nhận ra khi bé nói xong, rồi trả lời bằng tiếng Việt hoặc tiếng Anh, đúng ngôn ngữ bé vừa dùng. Micro tự tắt khi lượt hỏi kết thúc.',
  ctaStart: 'Bắt đầu miễn phí', ctaHow: 'Xem cách hoạt động',
  trust: 'Tặng 1.000 câu trả lời khi tạo tài khoản · Không thu phí hằng tháng',

  // hero toy
  toyIdle: 'Chạm nút sáng để hỏi thử Buddy', toyListening: 'Buddy đang nghe…', toySilence: 'Bé đã ngừng nói, Buddy đang chờ thêm một chút…',
  toyHeard: 'Buddy nhận ra bé đã nói xong', toyStopped: 'Bé chạm nút lần nữa nên Buddy thôi nghe', toyThinking: 'Buddy đang nghĩ…',
  toyAnswer: 'Chạm lần nữa để hỏi câu khác', toyTap: 'Chạm để bắt đầu nói với Buddy', toyTapStop: 'Chạm để nói xong', asked: 'Bé hỏi',
  demo1q: 'Vì sao bầu trời lại có màu xanh?', demo1a: 'Vì ánh sáng Mặt Trời gặp không khí thì phần màu xanh bị tán ra khắp nơi, nên nhìn đâu mình cũng thấy xanh đó!',
  demo2q: 'Buddy kể cho con một chuyện cười đi!', demo2a: 'Vì sao con cá không dám chơi bóng rổ? Vì nó sợ cái lưới! Hi hi!',
  demo3q: 'Buddy có thương con không?', demo3a: 'Thương nhiều lắm luôn! Hôm nay mình chơi gì tiếp nào?',
  demo4q: 'Con khủng long to nhất dài cỡ nào?', demo4a: 'Có loài khủng long dài bằng ba chiếc xe buýt xếp liền nhau đó, to ghê chưa!',
  demo5q: 'Con bị té, đau đầu gối quá…', demo5a: 'Ôi, thương bé quá. Mình thổi phù phù nhé. Bé nhớ kể cho bố mẹ biết để bố mẹ xem giúp nha.',


  // how it works
  howEyebrow: 'Cách hoạt động', howTitle: 'Đơn giản như một lần chạm', howSub: 'Không ứng dụng cho bé, không màn hình để lướt. Chỉ một cái nút và một người bạn biết trả lời.',
  s1t: 'Bé chạm nút và hỏi', s1b: 'Một lần chạm là micro mở. Không có từ khoá đánh thức, không nghe lén.',
  s2t: 'Buddy biết khi bé nói xong', s2b: 'Buddy nhận ra khoảng lặng khi bé dừng nói, tự tắt micro rồi trả lời bằng giọng ấm áp kèm khuôn mặt thể hiện cảm xúc.',
  s3t: 'Bố mẹ nắm mọi thứ', s3b: 'Mỗi tuần nhận bản tóm tắt những điều bé thích kể, xem Buddy nhớ gì về bé, đặt giờ nghỉ và quản lý lượt hỏi ngay trên điện thoại.',

  // emotions
  emoEyebrow: 'Mười bốn cảm xúc', emoTitle: 'Khuôn mặt nói trước cả lời nói', emoSub: 'Màn hình của Buddy đổi cảm xúc theo câu chuyện, ngay trước khi Buddy cất lời. Rê chuột hoặc chạm vào từng khuôn mặt để xem.',
  emo_neutral: 'Bình thường', emo_listening: 'Đang nghe', emo_thinking: 'Đang nghĩ', emo_happy: 'Vui', emo_excited: 'Hào hứng',
  emo_laughing: 'Cười lớn', emo_love: 'Yêu thương', emo_curious: 'Tò mò', emo_surprised: 'Ngạc nhiên', emo_wink: 'Nháy mắt',
  emo_shy: 'Ngại ngùng', emo_confused: 'Bối rối', emo_sad: 'Buồn', emo_sleepy: 'Buồn ngủ',
  emoWhen_neutral: 'Khi Buddy đang chờ bé', emoWhen_listening: 'Khi bé đang nói', emoWhen_thinking: 'Khi Buddy tìm câu trả lời',
  emoWhen_happy: 'Khi bé khoe một điều vui', emoWhen_excited: 'Khi có điều bất ngờ thú vị', emoWhen_laughing: 'Khi bé kể chuyện cười',
  emoWhen_love: 'Khi bé nói thương Buddy', emoWhen_curious: 'Khi câu hỏi thật là hay', emoWhen_surprised: 'Khi nghe một điều lạ lùng',
  emoWhen_wink: 'Khi Buddy có một bí mật nhỏ', emoWhen_shy: 'Khi được bé khen', emoWhen_confused: 'Khi Buddy chưa nghe rõ',
  emoWhen_sad: 'Khi bé buồn, Buddy buồn cùng bé', emoWhen_sleepy: 'Khi đến giờ nghỉ',

  // features
  featEyebrow: 'Buddy là ai', featTitle: 'Một người bạn, không phải một màn hình',
  f1t: 'Nói tiếng Việt và tiếng Anh', f1b: 'Bé hỏi bằng tiếng nào, Buddy trả lời bằng tiếng đó, kể cả khi bé đổi ngôn ngữ giữa câu.',
  f1c: 'Buddy ơi, cá heo ăn gì?', f1d: 'Cá heo thích ăn cá nhỏ và mực đó!', f1e: 'Why is the moon so bright?', f1f: 'It shines with light from the Sun!',
  vadT: 'Tự biết khi bé nói xong', vadB: 'Không cần giữ nút. Buddy nghe khoảng lặng rồi tự tắt micro.', vadSpeak: 'Bé đang nói…', vadDone: 'Bé nói xong rồi',
  f3t: 'Một người bạn biết nhớ', f3b: 'Khi bố mẹ đồng ý, Buddy nhớ tên bạn bè, món bé thích và chuyện bé kể, để lần sau trò chuyện thân như bạn lâu năm. Bố mẹ xem và xoá được mọi điều Buddy nhớ.',
  f4t: 'Chọn bạn Buddy hợp với bé', f4b: 'Vài câu hỏi ngắn giúp tìm ra Bo, Pip hay Luna hợp với bé nhất. Bố mẹ chọn cách Buddy xưng hô và một trong 16 tính cách, tự chọn hoặc qua bài trắc nghiệm 12 câu.',

  // safety
  safeEyebrow: 'An toàn là mặc định', safeTitle: 'Thiết kế cho trẻ nhỏ ngay từ đầu', safeSub: 'Những điều Buddy luôn làm, không cần bố mẹ cài đặt.',
  sa1t: 'Micro không bao giờ bật sẵn', sa1b: 'Micro chỉ mở sau khi bé chạm nút và tự tắt khi bé nói xong. Không có từ khoá đánh thức.',
  sa2t: 'Mọi câu trả lời được kiểm tra', sa2b: 'Câu hỏi và câu trả lời đều đi qua bộ lọc an toàn trước khi Buddy nói.',
  sa3t: 'Bố mẹ được báo khi cần', sa3b: 'Nếu bé chia sẻ điều đáng lo, bố mẹ nhận được thông báo ngay.',
  sa4t: 'Không quảng cáo, không chuyện tiền', sa4b: 'Khi hết lượt, Buddy chỉ rủ bé nghỉ một chút. Chuyện mua bán nằm hoàn toàn ở phía bố mẹ.',
  sa5t: 'Lời của bé là của bé', sa5b: 'Bố mẹ thấy bé trò chuyện lúc nào, vui hay buồn, nhưng không đọc từng lời. Lời của bé chỉ hiện ra khi có điều đáng lo, để bố mẹ kịp giúp bé.',
  sa6t: 'Bố mẹ nắm quyền', sa6b: 'Cho Buddy nghỉ bất cứ lúc nào, đặt giờ yên lặng và thời gian chơi mỗi ngày. Khi Buddy nghỉ, bấm nút không tốn lượt.',

  // pricing
  priceEyebrow: 'Bảng giá', priceTitle: 'Trả theo câu trả lời. Không thu phí hằng tháng.', priceSub: '1 lượt = 1 câu trả lời. Mọi Buddy trong nhà dùng chung một ví lượt hỏi.',
  freeA: '1.000 lượt', freeB: 'tặng ngay khi tạo tài khoản để bé làm quen với Buddy.',
  credits: '{n} lượt', perAnswer: '≈ {p} mỗi câu trả lời', best: 'Tiết kiệm nhất', choose: 'Chọn gói này',
  pack_starter: 'Khởi đầu', pack_family: 'Gia đình', pack_big: 'Hộp lớn',
  note1: 'Không tự động gia hạn', note2: 'Dùng chung cho mọi Buddy', note3: 'Chưa trả lời xong thì không trừ lượt',

  // faq
  faqEyebrow: 'Hỏi đáp', faqTitle: 'Những điều bố mẹ hay hỏi',
  q1: 'Bé phải giữ nút khi nói à?', a1: 'Không cần. Bé chạm nút một lần rồi nói tự nhiên. Buddy nhận ra khi bé ngừng nói và tự tắt micro. Nếu bé muốn dừng sớm, chỉ cần chạm nút thêm lần nữa.',
  q2: 'Hết lượt thì sao?', a2: 'Buddy không trả lời mà nói với bé: “Mình nghỉ một chút nhé, lát nữa chơi tiếp!” Buddy không bao giờ nhắc tới tiền. Bố mẹ mua thêm lượt trên điện thoại là Buddy trả lời tiếp ngay.',
  q3: 'Buddy có nghe suốt ngày không?', a3: 'Không. Micro chỉ mở sau khi bé chạm nút và tắt khi lượt hỏi kết thúc. Không có từ khoá đánh thức và không có chế độ nghe nền.',
  q4: 'Hai bé dùng chung được không?', a4: 'Được. Mỗi bé có một Buddy của riêng mình, còn cả nhà dùng chung một ví lượt hỏi.',
  q5: 'Buddy nói những ngôn ngữ nào?', a5: 'Tiếng Việt, tiếng Anh, hoặc cả hai. Khi nói song ngữ, Buddy trả lời bằng ngôn ngữ bé vừa dùng và lồng thêm vài từ của ngôn ngữ kia như một trò chơi.',
  q6: 'Tặng lại Buddy cho người khác được không?', a6: 'Được. Gỡ Buddy khỏi gia đình trong ứng dụng, mã trên thẻ sẽ dùng lại được cho gia đình mới.',

  closeTitle: 'Sẵn sàng cho câu hỏi đầu tiên của bé?', closeSub: 'Tạo tài khoản trong một phút, nhận ngay 1.000 lượt hỏi.', closeCta: 'Tạo tài khoản',
  footerMade: 'Làm cho những bộ óc tò mò 4 đến 8 tuổi',

  // auth
  welcomeBack: 'Chào mừng trở lại', createTitle: 'Tạo tài khoản gia đình', loginSub: 'Đăng nhập để xem Buddy và các bé.',
  registerNote: 'Gia đình mới được tặng 1.000 lượt hỏi để bắt đầu.', familyName: 'Tên gia đình', familyPh: 'Ví dụ: Nhà Minh An',
  yourName: 'Tên của bạn', email: 'Email', password: 'Mật khẩu', pwHint: 'Ít nhất 8 ký tự', register: 'Tạo tài khoản',
  haveAccount: 'Đã có tài khoản?', noAccount: 'Chưa có tài khoản?',
  authQuoteLogin: 'Buddy đang chờ nghe câu hỏi tiếp theo của bé.', authQuoteReg: 'Một lần chạm, một người bạn nhỏ biết lắng nghe.',
  needFamily: 'Nhập tên gia đình giúp mình nhé.', badEmail: 'Email chưa đúng định dạng.', shortPw: 'Mật khẩu cần ít nhất 8 ký tự.',

  // app
  appNav: 'Điều hướng', nav_overview: 'Trang chủ', nav_toys: 'Đồ chơi', nav_credits: 'Lượt hỏi', nav_activity: 'Hoạt động', nav_family: 'Gia đình', nav_talk: 'Trò chuyện',
  hi: 'Chào {name}', signOut: 'Đăng xuất', addToy: 'Thêm đồ chơi', loadFailed: 'Chưa tải được dữ liệu. Kiểm tra kết nối rồi thử lại nhé.',
  notFoundT: 'Không tìm thấy trang này',
  balLabel: 'Lượt hỏi còn lại', balUnit: 'lượt', balHint: '1 lượt = 1 câu trả lời. Mọi Buddy trong nhà dùng chung.', buy: 'Mua thêm lượt',
  lowLong: 'Sắp hết lượt. Khi hết, Buddy sẽ nhẹ nhàng rủ bé nghỉ một chút.', outLong: 'Đã hết lượt. Bé chạm nút sẽ nghe Buddy nói: “Mình nghỉ một chút nhé!”',
  chartTitle: 'Câu trả lời tuần này', chartTotal: '{n} câu trả lời', chartTotalOne: '1 câu trả lời', tip: '{d}: {n} câu trả lời', tipOne: '{d}: 1 câu trả lời', chartTable: 'Số câu trả lời theo ngày',
  yourToys: 'Đồ chơi của nhà mình', manage: 'Quản lý', recent: 'Gần đây', seeAll: 'Xem tất cả',
  noTurns: 'Chưa có cuộc trò chuyện nào.', activityNote: 'Ở đây chỉ có lúc bé trò chuyện, khuôn mặt của Buddy và kiểu trò chuyện, trong 30 ngày gần nhất. Lời của bé và của Buddy không hiện ở đây.',
  fAll: 'Tất cả',
  forChild: 'Buddy của {name}', awake: 'Đang thức', resting: 'Đang nghỉ', support: 'Hỗ trợ đã tạm dừng', revoked: 'Đã khoá',
  seen: 'Kết nối {t}',
  onboardT: 'Thêm Buddy đầu tiên', onboardB: 'Mở hộp, lấy thẻ có mã 8 ký tự rồi làm theo vài bước ngắn để chọn bạn Buddy cho bé.',
  free: 'Không trừ',
  packs: 'Chọn gói', history: 'Lịch sử', noLedger: 'Chưa có giao dịch nào.',
  l_debit: 'Buddy trả lời {n} câu', l_purchase: 'Mua gói {pack}', l_welcome: 'Quà chào mừng', l_grant: 'Hỗ trợ tặng thêm', l_refund: 'Hoàn lượt',
  children: 'Các bé', age: '{n} tuổi', noBuddy: 'Chưa có Buddy', addChild: 'Thêm bé', childName: 'Tên bé',
  needName: 'Nhập tên bé giúp mình nhé.', noKids: 'Chưa có bé nào.', account: 'Tài khoản', language: 'Ngôn ngữ', saved: 'Đã lưu',
  pause: 'Cho nghỉ', wake: 'Đánh thức', pausedToast: 'Buddy đang nghỉ', wokeToast: 'Buddy đã thức dậy',
  noChild: 'Chưa chọn bé',
  codeTitle: 'Nhập mã trên thẻ trong hộp',
  onboardWebB: 'Thêm bé, chọn bạn Buddy hợp với bé rồi trò chuyện ngay trên web. Có Buddy thật? Mã trên thẻ cũng nhập ở đây.',
  err_web_toy_limit: 'Gia đình đã có đủ số Buddy trên web. Gỡ một Buddy để thêm Buddy khác.',
  payTitle: 'Mua thêm lượt', pack: 'Gói', add: 'Thêm', total: 'Tổng cộng', payNote: 'Thanh toán thử trong giai đoạn demo. Không có tiền thật nào bị trừ.',
  payDecline: 'Giả lập thẻ bị từ chối', pay: 'Thanh toán {price}', paying: 'Đang xử lý thanh toán…',
  paidT: 'Đã thêm {n} lượt', paidB: 'Mọi Buddy trong nhà dùng được ngay. Số lượt hiện có: {b}.',
  declinedT: 'Thanh toán chưa thành công', declinedB: 'Thẻ bị từ chối nên chưa có lượt nào được thêm. Bạn có thể thử lại hoặc dùng thẻ khác.',

  // Buddy profile
  profileTitle: 'Hồ sơ của Buddy',
  role_friend: 'Bạn thân', role_sibling: 'Anh chị', role_parent_figure: 'Người lớn hiền hậu', role_teacher: 'Cô giáo',
  roleSays_friend: 'Xưng “tớ”, gọi bé là “cậu”', roleSays_sibling: 'Xưng “anh”, gọi bé là “em”',
  roleSays_parent_figure: 'Xưng “cô”, gọi bé là “con”, như một người cô hiền, không bao giờ nhận là bố mẹ của bé', roleSays_teacher: 'Xưng “cô”, gọi bé là “con”',
  personalityLabel: 'Tính cách', tabQuiz: 'Làm trắc nghiệm', tabPick: 'Tự chọn',
  quizIntro: '12 câu hỏi ngắn về người bạn bạn muốn dành cho bé. Không có đáp án đúng hay sai.', quizProgress: 'Câu {n}/{total}',
  quizResult: 'Tính cách hợp với điều bạn mong muốn', useThis: 'Chọn tính cách này', retake: 'Làm lại', pickHelp: 'Chạm vào tính cách bạn thích.',
  pickIntro: 'Xem cả 16 tính cách, chia thành 4 nhóm.',
  edit: 'Sửa',
  buddyOf: '{name} · của {child}',
  group_NT: 'Nhà tư duy', group_NF: 'Người tâm giao', group_SJ: 'Người vững vàng', group_SP: 'Nhà khám phá',
  ptype_INTJ: 'Nhà chiến lược', ptypeDesc_INTJ: 'Trầm tĩnh, thích có kế hoạch và nhìn ra quy luật; nói ít nhưng câu nào chắc câu đó.',
  ptype_INTP: 'Nhà phát minh', ptypeDesc_INTP: 'Đầy ý tưởng lạ, thắc mắc mọi thứ, chân thành một cách vụng về dễ mến.',
  ptype_ENTJ: 'Đội trưởng', ptypeDesc_ENTJ: 'Hăng hái, quyết đoán, thích thử thách và tự nhiên đứng ra dẫn dắt cuộc chơi.',
  ptype_ENTP: 'Tia ý tưởng', ptypeDesc_ENTP: 'Lanh lợi, ứng biến nhanh, thích lật mọi chuyện ra xem theo một cách khác.',
  ptype_INFJ: 'Người bạn hiểu lòng', ptypeDesc_INFJ: 'Trầm lặng mà ấm, hiểu cảm xúc của bé trước cả khi bé nói ra.',
  ptype_INFP: 'Nhà mơ mộng', ptypeDesc_INFP: 'Giàu tưởng tượng, dịu dàng, tin rằng ai cũng có điều tốt.',
  ptype_ENFJ: 'Người cổ vũ', ptypeDesc_ENFJ: 'Nồng hậu, giỏi động viên, luôn nhìn ra điểm đáng quý ở bé.',
  ptype_ENFP: 'Tia nắng tò mò', ptypeDesc_ENFP: 'Nhiệt tình rực rỡ, tò mò về mọi thứ, nghĩ ra trò mới liên tục.',
  ptype_ISTJ: 'Người giữ lời', ptypeDesc_ISTJ: 'Điềm đạm, đáng tin, chuộng sự thật rõ ràng và nếp quen tốt.',
  ptype_ISFJ: 'Người chăm sóc', ptypeDesc_ISFJ: 'Dịu dàng, chu đáo, nhớ từng chi tiết nhỏ về bé.',
  ptype_ESTJ: 'Người tổ chức', ptypeDesc_ESTJ: 'Tháo vát, rõ ràng, công bằng, thích mọi thứ đâu ra đấy.',
  ptype_ESFJ: 'Trái tim ấm áp', ptypeDesc_ESFJ: 'Ấm áp, quan tâm từng người, vui nhất khi cả nhà quây quần.',
  ptype_ISTP: 'Bác thợ nhỏ', ptypeDesc_ISTP: 'Ít lời, khéo tay, gặp rắc rối là muốn sửa ngay.',
  ptype_ISFP: 'Nghệ sĩ nhỏ', ptypeDesc_ISFP: 'Hiền lành, tinh tế, thấy cái đẹp trong những điều nhỏ xíu.',
  ptype_ESTP: 'Nhà thám hiểm', ptypeDesc_ESTP: 'Máu lửa, phản xạ nhanh, học bằng cách thử ngay.',
  ptype_ESFP: 'Ngôi sao vui nhộn', ptypeDesc_ESFP: 'Tưng bừng như ngày hội, ở đâu có mặt là ở đó có tiếng cười.',
  pq1: 'Khi bé vừa đi học về, Buddy nên…', pq1a: 'Hào hứng chào và rủ bé kể chuyện ngay', pq1b: 'Chờ bé sẵn sàng rồi mới nhẹ nhàng hỏi han',
  pq2: 'Bé hỏi “Mây làm bằng gì?”, Buddy trả lời…', pq2a: 'Bằng sự thật rõ ràng: những giọt nước li ti', pq2b: 'Bằng một hình ảnh: mây là kẹo bông của bầu trời',
  pq3: 'Bé làm hỏng đồ chơi và buồn, Buddy…', pq3a: 'Cùng bé nghĩ cách sửa lại', pq3b: 'Vỗ về cảm xúc của bé trước đã',
  pq4: 'Một ngày lý tưởng với Buddy là…', pq4a: 'Có nếp quen: giờ nào việc nấy', pq4b: 'Tuỳ hứng: thấy gì vui thì làm',
  pq5: 'Khi bé kể một chuyện dài, Buddy…', pq5a: 'Lắng nghe hết rồi mới đáp, chậm rãi', pq5b: 'Xuýt xoa, reo lên theo từng đoạn',
  pq6: 'Buddy thích kể chuyện về…', pq6a: 'Thế giới tưởng tượng: rồng, tàu vũ trụ, xứ sở kẹo', pq6b: 'Những điều có thật: con vật, cây cối, đồ vật quanh nhà',
  pq7: 'Khi bé trả lời sai, Buddy…', pq7a: 'Khen bé đã cố gắng rồi gợi ý nhẹ nhàng', pq7b: 'Giải thích rõ vì sao chưa đúng',
  pq8: 'Khi chơi trò chơi với bé, Buddy…', pq8a: 'Hay nghĩ ra luật mới giữa chừng', pq8b: 'Giữ luật chơi rõ ràng và chơi đến cùng',
  pq9: 'Buddy vui nhất khi…', pq9a: 'Cả nhà cùng chơi, hát hò rộn ràng', pq9b: 'Thủ thỉ riêng với bé một câu chuyện yên tĩnh',
  pq10: 'Khi dạy bé điều mới, Buddy…', pq10a: 'Đi từng bước nhỏ, kèm ví dụ cụ thể', pq10b: 'Gợi một ý lớn rồi để bé tự khám phá',
  pq11: 'Buddy thích hỏi bé những câu như…', pq11a: '“Vì sao?” và “Làm thế nào?”', pq11b: '“Bé thấy thế nào?” và “Ai sẽ vui nhỉ?”',
  pq12: 'Khi bé đổi ý giữa chừng, Buddy…', pq12a: 'Nhắc bé làm xong việc đang dở đã', pq12b: 'Vui vẻ đổi theo bé ngay',

  // talk (the web toy)
  talkPick: 'Chọn Buddy', talkLog: 'Cuộc trò chuyện',
  talkConnecting: 'Đang kết nối với {name}…', talkMicOpening: 'Đang mở micro…', talkMuted: 'Micro đang tắt. Chạm nút để {name} nghe bạn.',
  talkSpeakNow: 'Nói đi, {name} đang nghe', talkListening: '{name} đang nghe. Nói xong cứ im lặng một chút, {name} sẽ trả lời.',
  talkThinking: '{name} đang nghĩ…', talkAnswered: '{name} đã trả lời', talkSpeaking: '{name} đang nói…',
  talkDenied: '{name} chưa trả lời được lúc này. Lý do có trong trang Hoạt động.',
  talkAsleep: '{name} đang nghỉ. Đánh thức {name} trong trang Đồ chơi để trò chuyện.', talkOffline: 'Chưa kết nối được với {name}.',
  talkReconnect: 'Kết nối lại', talkGoToys: 'Đến trang Đồ chơi',
  talkTyped: 'Tin nhắn', talkEmpty: 'Chưa có gì ở đây. Cứ nói chuyện với {name}, hoặc nhắn một câu.',
  talkNewConv: 'Cuộc trò chuyện mới', talkNewConvStarted: 'Bắt đầu cuộc trò chuyện mới',
  talkInputLabel: 'Tin nhắn cho Buddy', talkInputPh: 'Nhắn cho {name}…', talkSend: 'Gửi',
  talkMute: 'Tắt micro', talkUnmute: 'Bật micro', talkSendNow: 'Nói xong rồi', talkInterrupt: 'Ngắt lời {name}', talkPet: 'Vuốt ve {name}',
  talkMicNote: 'Trình duyệt này không dùng được micro ở đây. Bạn vẫn nhắn tin được.',
  talkInsecure: 'Trò chuyện với {name} trên web cần https hoặc localhost. Hãy mở trang này bằng một trong hai địa chỉ đó.',
  talkOffT: 'Trò chuyện trên web đang tắt', talkOffB: 'Máy chủ này chưa bật tính năng trò chuyện với Buddy trên web.',
  talkErr_mic_denied: 'Trình duyệt chưa cho dùng micro. Cho phép micro ở thanh địa chỉ, hoặc nhắn tin bên cạnh.',
  talkErr_mic_unavailable: 'Không mở được micro. Kiểm tra micro của máy, hoặc nhắn tin bên cạnh.',

  // the languages a child speaks (the Family screen's child form)
  langVi: 'Tiếng Việt', langEn: 'English',

  // errors: err_<code> for backend-v2's problem codes (lib/api.js keeps them
  // in snake case), errField_<field>[_<code>] for a refused field
  err_generic: 'Có lỗi xảy ra. Bạn thử lại sau ít phút nhé.', err_network_error: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  // a 429, worded by the size of its Retry-After (lib/format.js waitWords)
  err_rate_limited: 'Bạn thử hơi nhiều lần. Chờ một chút rồi thử lại nhé.',
  err_rate_limited_s: 'Bạn thử hơi nhiều lần. Chờ khoảng {s} giây rồi thử lại nhé.',
  err_rate_limited_m: 'Bạn thử hơi nhiều lần. Chờ khoảng {m} phút rồi thử lại nhé.',
  err_rate_limited_h: 'Bạn thử hơi nhiều lần. Chờ khoảng {h} giờ rồi thử lại nhé.',
  err_invalid_credentials: 'Email hoặc mật khẩu chưa đúng.',
  err_email_taken: 'Email này đã có tài khoản. Bạn đăng nhập nhé.', err_invalid_request: 'Thông tin chưa hợp lệ. Bạn kiểm tra lại nhé.',
  err_unauthorized: 'Phiên đăng nhập đã hết. Bạn đăng nhập lại nhé.', err_not_found: 'Không tìm thấy mục này. Có thể nó vừa được gỡ, bạn tải lại trang nhé.',
  err_invalid_claim: 'Mã này chưa khớp với Buddy nào, hoặc đã được dùng rồi. Bạn xem lại thẻ nhé.',
  err_device_claimed: 'Đồ chơi này đã thuộc về một gia đình khác hoặc đang bị khoá.',
  err_child_has_toy: 'Bé đã có một Buddy đang thức. Cho Buddy đó nghỉ hoặc gỡ ra trước nhé.',
  err_web_toy_off: 'Buddy trên web hiện chưa mở.', err_toy_not_active: 'Buddy đang nghỉ. Đánh thức Buddy trước nhé.',
  err_toy_held: 'Bộ phận hỗ trợ đã tạm dừng Buddy này. Liên hệ hỗ trợ để bật lại.',
  err_toy_in_family: 'Đồ chơi này đã có trong gia đình mình rồi. Muốn trao cho bé khác hoặc cài lại từ đầu, bạn gỡ nó ở mục Đồ chơi trước rồi nhập lại mã nhé.',
  err_bad_entry: 'Từ bé nói và từ bé muốn nói cần khác nhau.',
  err_payments_disabled: 'Mua thêm lượt sẽ sớm có. Bạn quay lại sau nhé.', err_purchase_not_pending: 'Giao dịch này đã được xử lý.',
  err_consent_required: 'Bố mẹ cần đồng ý cho Buddy ghi nhớ trước khi bật tính năng này.',
  err_stale_write: 'Thông tin này vừa được thay đổi ở nơi khác. Bạn tải lại rồi thử lại nhé.',
  err_precondition_required: 'Trang cần tải lại trước khi lưu. Bạn thử lại nhé.',
  err_buddy_exists: 'Bé đã có bạn Buddy rồi.', err_confirm_required: 'Bạn xác nhận giúp mình trước khi đổi nhé.',
  err_no_cast: 'Các bạn Buddy chưa sẵn sàng. Bạn thử lại sau ít phút nhé.',
  err_internal: 'Máy chủ gặp trục trặc. Bạn thử lại sau ít phút nhé.', err_http_error: 'Có lỗi xảy ra. Bạn thử lại nhé.',
  errField_email: 'Email chưa đúng định dạng.', errField_password: 'Mật khẩu cần từ 8 đến 128 ký tự.',
  errField_family_name: 'Tên gia đình cần từ 1 đến 80 ký tự.', errField_name: 'Tên cần từ 1 đến 60 ký tự.',
  errField_birth_date: 'Ngày sinh chưa hợp lệ.', errField_claim_code: 'Mã gồm 8 ký tự, dạng XXXX-XXXX.',
  errField_voice_id_language: 'Giọng này nói ngôn ngữ khác với Buddy. Bạn chọn giọng khác nhé.',
  // redesign (Miu)
  talkKeyboard: 'Gõ tin nhắn', talkHideLog: 'Ẩn cuộc trò chuyện',
};

// The backend-v2 port keeps its strings in parts/, one file per area.
export default { ...base, ...core, ...wizard, ...talk, ...care };
