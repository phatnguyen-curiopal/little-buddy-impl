// talk strings for the backend-v2 port (vi). A key here overrides the same key
// in ../vi.js; tests/i18n.test.js checks both languages together.
// Every key the Talk screen uses is listed here, so it keeps working
// whatever happens to the base dictionary.
export default {
  // the room
  talkPick: 'Chọn Buddy',
  talkToyOption: '{name} của {child}',
  talkCredits: 'Lượt hỏi còn lại: {n}',
  talkNewConv: 'Bắt đầu cuộc trò chuyện mới',
  talkNewConvStarted: 'Bắt đầu cuộc trò chuyện mới',
  talkSettings: 'Cài đặt cho {name}',
  talkPet: 'Vuốt ve {name}',
  talkReconnect: 'Kết nối lại',
  talkTakeOver: 'Trò chuyện ở đây',
  talkGoToys: 'Đến trang Đồ chơi',

  // what Buddy is doing
  talkConnecting: 'Đang kết nối với {name}…',
  talkMicOpening: 'Đang mở micro…',
  talkSpeakNow: 'Nói đi, {name} đang nghe',
  talkMuted: 'Micro đang tắt. Chạm nút để {name} nghe bạn.',
  talkSleepyQuiet: 'Đang là giờ yên tĩnh nên {name} đi ngủ rồi. Chạm nút micro nếu vẫn muốn gọi {name}.',
  talkSleepyLimit: 'Hôm nay bé đã trò chuyện đủ thời gian cho phép. {name} hẹn bé ngày mai nhé.',
  talkListening: '{name} đang nghe. Nói xong cứ im lặng một chút, {name} sẽ trả lời.',
  talkThinking: '{name} đang nghĩ…',
  talkBuddyFirst: '{name} có chuyện muốn kể…',
  talkAnswered: '{name} sắp trả lời…',
  talkSpeaking: '{name} đang nói…',
  talkDenied: '{name} chưa trả lời được lúc này.',
  talkAsleep: '{name} đang nghỉ.',
  talkReplaced: '{name} đang được mở ở một thẻ hoặc thiết bị khác.',
  talkOffline: 'Chưa kết nối được với {name}.',

  // the clips a physical toy would play
  talkClipNapping: '{name} đang ngủ trưa nên chưa trả lời được.',
  talkClipSleepy: '{name} buồn ngủ rồi: đang là giờ yên tĩnh, hoặc hôm nay bé đã trò chuyện đủ giờ.',
  talkClipDidntCatch: '{name} chưa nghe rõ nên không trừ lượt nào. Bé nói lại nhé.',

  // the big button
  talkMute: 'Tắt micro',
  talkUnmute: 'Bật micro',
  talkSendNow: 'Nói xong rồi',
  talkInterrupt: 'Ngắt lời {name}',
  talkMicBusy: 'Chờ {name} một chút',

  // hints
  talkMicNote: 'Trình duyệt này không dùng được micro ở đây, nên {name} chưa nghe được bé.',
  talkInsecure: 'Trò chuyện với {name} trên web cần https hoặc localhost. Hãy mở trang này bằng một trong hai địa chỉ đó.',
  talkErr_mic_denied: 'Trình duyệt chưa cho dùng micro. Bạn cho phép micro ở thanh địa chỉ rồi chạm nút micro lần nữa nhé.',
  talkErr_mic_unavailable: 'Không mở được micro. Bạn kiểm tra micro của máy rồi thử lại nhé.',
  talkErr_auth_failed: '{name} chưa đăng nhập được. Bạn tải lại trang rồi thử lại nhé.',
  talkErr_slow_down: 'Kết nối hơi nhiều lần. {name} sẽ thử lại sau ít giây.',
  talkErr_protocol: 'Trang này cần được cập nhật. Bạn tải lại trang nhé.',
  talkStalled: '{name} mải nghĩ quá nên quên mất rồi. Bé nói lại nhé.',

  // the conversation language
  talkLangVi: 'tiếng Việt',
  talkLangEn: 'tiếng Anh',
  talkLangBoth: 'cả hai thứ tiếng',
  talkLangAria: 'Ngôn ngữ trò chuyện: {lang}',
  talkLangHelp: 'Ngôn ngữ {name} nói và nghe. Chạm để đổi.',
  talkLangNowOne: 'Từ câu sau, {name} sẽ nói {lang}.',
  talkLangNowBoth: 'Từ câu sau, {name} sẽ trả lời bằng thứ tiếng bé vừa dùng.',

  // said before the mic opens, with the way out
  talkGateCreditsT: 'Hết lượt hỏi rồi',
  talkGateCreditsB: '{name} sẽ ngủ trưa cho đến khi gia đình có thêm lượt hỏi. Mỗi câu trả lời dùng một lượt.',
  talkGateBuy: 'Mua thêm lượt',
  talkGateNoPay: 'Hiện chưa mua thêm lượt được. Bạn quay lại sau nhé.',
  talkGatePausedT: '{name} đang ngủ',
  talkGatePausedB: 'Bố mẹ đã cho {name} nghỉ. Đánh thức {name} để bé trò chuyện tiếp nhé.',
  talkGateWake: 'Đánh thức {name}',
  talkWaking: 'Đang đánh thức…',
  talkWoke: '{name} đã thức dậy',
  talkGateHeldT: '{name} đang tạm dừng',
  talkGateHeldB: 'Bộ phận hỗ trợ đã tạm dừng {name}. Bạn liên hệ hỗ trợ để bật lại nhé.',
  talkGateAsleepT: '{name} chưa thức',
  talkGateAsleepB: 'Bạn xem tình trạng của {name} trong trang Đồ chơi nhé.',
  talkGateSetupT: '{child} chưa có Buddy',
  talkGateReadyT: 'Buddy chưa sẵn sàng',
  talkGateSetupB: 'Chọn một người bạn cho bé, xong là bé trò chuyện được ngay.',
  talkGateSetup: 'Hoàn tất cài đặt',

  // no Buddy to talk to
  talkOffT: 'Trò chuyện trên web đang tắt',
  talkOffB: 'Máy chủ này chưa bật tính năng trò chuyện với Buddy trên web.',
  talkNoWebT: 'Chưa có Buddy nào sống trên web',
  talkNoWebB: 'Tạo một Buddy sống ngay trên trang này, rồi bé trò chuyện qua micro của máy tính hoặc điện thoại.',
  talkMakeWeb: 'Tạo Buddy trên web',

  // the log, a development aid
  talkKeyboard: 'Gõ tin nhắn',
  talkLog: 'Cuộc trò chuyện',
  talkHideLog: 'Ẩn cuộc trò chuyện',
  talkDevNote: 'Chỉ có khi phát triển: máy chủ thật không nhận tin nhắn gõ, và {name} chỉ trả lời bằng giọng nói.',
  talkEmpty: 'Chưa có gì ở đây. Cứ nói chuyện với {name}, hoặc nhắn một câu.',
  talkInputLabel: 'Tin nhắn cho Buddy',
  talkInputPh: 'Nhắn cho {name}…',
  talkSend: 'Gửi',
  talkTyped: 'Tin nhắn',
  talkVoiceWho: 'Micro',
  talkVoiceTurn: 'Bé vừa nói qua micro',
  talkAnsweredAloud: 'Đã trả lời bằng giọng nói',
  talkGreeted: 'Đã chào bé trước',
};
