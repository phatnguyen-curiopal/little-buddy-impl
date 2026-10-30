// core strings for the backend-v2 port (vi). A key here overrides the same key
// in ../vi.js; tests/i18n.test.js checks both languages together.
export default {
  // navigation
  nav_care: 'Chăm sóc', careBadge: 'Cảnh báo chưa xem: {n}',

  // home
  alertBanner: 'Buddy thấy có điều bố mẹ nên biết về {name} ({n} cảnh báo mới).', alertBannerGo: 'Xem ngay',
  buySoon: 'Mua thêm lượt sẽ sớm có trên trang này.',

  // toys
  finishSetup: 'Hoàn tất thiết lập Buddy',
  needsBuddy: 'Bé chưa có bạn Buddy. Chọn bạn Buddy hợp với bé để bắt đầu trò chuyện.',
  webTag: 'Trên web', webBuddyName: 'Buddy trên web', toySerial: 'Đồ chơi {serial}', noToyYet: 'Chưa có đồ chơi',
  onlineNow: 'Đang trực tuyến', neverSeen: 'Chưa kết nối lần nào', addTileWeb: 'Buddy trên web, hoặc đồ chơi có thẻ',

  // activity: what Buddy did in a turn, never the words
  yourChild: 'bé', costOne: 'Trừ 1 lượt', turnTalked: '{buddy} trò chuyện với {name}',
  tt_answer: '{buddy} trả lời câu hỏi của {name}', tt_react: '{buddy} hưởng ứng chuyện {name} kể',
  tt_comfort: '{buddy} an ủi {name}', tt_encourage: '{buddy} cổ vũ {name}',
  tt_follow_up: '{buddy} hỏi thăm {name} chuyện hôm trước', tt_share: '{buddy} kể {name} nghe chuyện của mình',
  tt_play: '{buddy} rủ {name} chơi một trò', tt_story: '{buddy} kể {name} nghe một câu chuyện',
  tt_teach: '{buddy} kể {name} nghe một điều thú vị', tt_wind_down: '{buddy} rủ {name} nghỉ ngơi',
  tt_greet: '{buddy} chào {name} trước', tt_clarify: '{buddy} nhờ {name} nói lại',
  filterChild: 'Lọc theo bé', activityCare: 'Bản tóm tắt hằng tuần và cảnh báo an toàn nằm ở mục Chăm sóc.',

  // credits
  packsTitle: 'Các gói lượt hỏi',
  buySoonLong: 'Mua thêm lượt sẽ sớm có trên trang này. Trong lúc chờ, bé vẫn trò chuyện bằng số lượt hiện có.',
  l_debitFor: 'Buddy trả lời {name} {n} câu', l_other: 'Điều chỉnh lượt',

  // family
  birthDate: 'Ngày sinh', birthHelp: 'Để Buddy trò chuyện hợp với tuổi của bé.',
  badBirth: 'Ngày sinh này chưa đúng. Bạn kiểm tra lại giúp mình nhé.',
  birthTooOld: 'Buddy dành cho bé từ {n} tuổi trở xuống. Bạn kiểm tra lại ngày sinh nhé.',
  childLangs: 'Bé nói', childLangsHelp: 'Ngôn ngữ bé dùng ở nhà, để Buddy nghe bé rõ hơn.', langBoth: 'Cả hai',
  kidLang_vi: 'Nói tiếng Việt', kidLang_en: 'Nói tiếng Anh', kidLang_both: 'Nói tiếng Việt và tiếng Anh',
  editFamilyName: 'Sửa tên gia đình',
};
