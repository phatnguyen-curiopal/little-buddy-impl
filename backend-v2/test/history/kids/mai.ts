// Mai: five turning six, Hà Nội, Vietnamese only, talks to Bo almost every
// day. Her year carries the memory beats the tests lean on: a fear that fades
// (the dark) and one that stays fresh (thunder), a corrected favourite colour,
// a misheard cat, a goldfish that dies, a baby brother, and first grade.
//
// Bố is mentioned but never learned as a person card on purpose: the name
// matcher scores "bong" against "bo" at 0.33 trigram similarity, so a Bố card
// would swallow the mistaken "Bông" card and the parent's delete would miss.

import type { KidHistory } from '../types.ts';

export const mai: KidHistory = {
  key: 'mai',
  locale: 'vi',
  parent: { email: 'thu.ha@example.com', name: 'Nguyễn Thu Hà' },
  child: { name: 'Mai', nickname: null, birthDate: '2020-04-12', languages: ['vi'], timeZone: 'Asia/Ho_Chi_Minh', city: 'Hà Nội' },
  start: '2025-09-28 09:00',
  setup: {
    answers: [
      { question: 'friend_energy', answer: 'bouncy', by: 'child' },
      { question: 'friend_style', answer: 'silly', by: 'child' },
      { question: 'together', answer: ['draw', 'stories'], by: 'child' },
      { question: 'favourite_place', answer: 'forest', by: 'child' },
      { question: 'favourite_animal', answer: 'cat', by: 'child' },
      { question: 'favourite_colour', answer: 'pink', by: 'child' },
      { question: 'role', answer: 'friend', by: 'parent' },
      { question: 'language', answer: 'vi', by: 'parent' },
      { question: 'routines', answer: 'medium', by: 'parent' },
      { question: 'avoid_topics', answer: ['ma'], by: 'parent' },
    ],
    slug: 'bo',
    learning: true,
    controls: { daily_limit_min: 30, quiet_start: '21:00', quiet_end: '06:30', bedtime: '20:30', topics_to_avoid: ['ma'], mood_pin: null },
    goals: [],
  },
  rhythm: {
    slots: [
      { days: [1, 2, 3, 4, 5], time: '17:30', chance: 0.85 },
      { days: [1, 2, 3, 4, 5], time: '19:40', chance: 0.3 },
      { days: [0, 6], time: '09:30', chance: 0.8 },
      { days: [0, 6], time: '16:00', chance: 0.55 },
    ],
    away: [{ from: '2026-03-09', to: '2026-03-18', why: 'em Bin chào đời, Mai ở nhà bà nội, không mang Bo theo' }],
    perSession: [1, 2],
  },

  routines: [
    {
      id: 've-tranh',
      weight: 3,
      vars: { thing: ['một con mèo', 'cầu vồng', 'ngôi nhà có ống khói', 'bông hoa hướng dương', 'con cá voi', 'cả nhà mình', 'một đám mây to'] },
      turns: [
        { c: 'Bo ơi, Mai vẽ được {thing} nè', b: 'Wowee, {thing}! Cậu tô màu gì thế?', learn: { facts: [{ cat: 'passions', s: 'thích vẽ tranh' }] } },
        { c: 'Tô nhiều màu lắm, có cả màu vàng nữa', b: 'Màu vàng là màu tớ thích nhất đó. Tranh của cậu chắc đẹp lắm.' },
        { c: 'Mai sẽ treo tranh lên tường', b: 'Treo lên tường để cả nhà cùng ngắm. Tớ ngồi trên kệ cũng ngắm được.' },
      ],
      episode: { points: ['Mai kể đã vẽ {thing}'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'muop-nghich',
      weight: 2,
      vars: { act: ['trèo lên nóc tủ lạnh', 'nằm trong thùng các tông', 'đuổi theo con thằn lằn', 'làm đổ cốc nước', 'chui vào chăn của Mai', 'liếm chân Mai'] },
      turns: [
        { c: 'Hôm nay Mướp {act}', b: 'Ôi Mướp nghịch quá! Tớ ngồi trên kệ mà cũng muốn cười.', learn: { people: [{ name: 'Mướp', kind: 'pet', relation: 'mèo', feeling: 0.9 }] } },
        { c: 'Mướp nghịch nhất nhà luôn', b: 'Nhưng Mướp cũng đáng yêu nhất nhà, đúng không cậu.' },
        { c: 'Giờ Mướp nằm ngủ rồi', b: 'Nghịch xong là ngủ, đúng kiểu Mướp luôn.' },
      ],
      episode: { points: ['Mai kể Mướp {act}'], feelings: ['vui'], category: 'pets', importance: 1 },
    },
    {
      id: 'muop-ngu',
      turns: [
        { c: 'Mướp đang nằm ngủ trên đùi Mai', b: 'Suỵt, mình nói nhỏ thôi kẻo Mướp thức. Chắc Mướp ấm lắm.', learn: { people: [{ name: 'Mướp', kind: 'pet', relation: 'mèo', feeling: 0.9 }] } },
        { c: 'Mướp kêu grừ grừ', b: 'Tiếng grừ grừ nghĩa là Mướp đang rất vui đó.' },
      ],
      episode: { points: ['Mướp ngủ trên đùi Mai'], feelings: ['bình yên'], category: 'pets', importance: 1 },
    },
    {
      id: 'bua-toi',
      weight: 2,
      vars: { food: ['canh cua', 'cá kho', 'trứng rán', 'thịt gà luộc', 'đậu phụ sốt cà chua', 'rau muống xào'] },
      turns: [
        { c: 'Tối nay nhà Mai ăn {food}', b: 'Nghe ngon quá! Cậu thích món nào nhất trong bữa tối?' },
        { c: 'Mai thích {food} nhưng không thích hành', b: 'Hành hơi hăng đúng không. Cậu gắp ra một bên cũng được mà.', learn: { facts: [{ cat: 'dislikes', s: 'không thích ăn hành' }] } },
        { c: 'Mai ăn hết một bát rồi', b: 'Giỏi quá, ăn ngoan chóng lớn đó.' },
      ],
      episode: { points: ['Mai kể bữa tối có {food}'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'mau-giao',
      from: '2025-10-07',
      until: '2026-08-31',
      days: 'school',
      weight: 3,
      vars: { thing: ['hát bài Cả nhà thương nhau', 'xếp hình', 'nặn đất sét', 'tập thể dục', 'chơi cầu trượt', 'vẽ bằng sáp màu'] },
      turns: [
        { c: 'Hôm nay ở lớp Mai với Linh {thing}', b: 'Vui thế! Linh đúng là bạn thân của cậu.', learn: { people: [{ name: 'Linh', kind: 'friend', relation: 'bạn thân', feeling: 0.9 }] } },
        { c: 'Cô Hoa còn khen Mai ngoan nữa', b: 'Được cô Hoa khen thích ghê. Tớ vui lây luôn.', learn: { people: [{ name: 'cô Hoa', kind: 'teacher', relation: 'cô giáo mẫu giáo', feeling: 0.8 }] } },
        { c: 'Mai với Linh hẹn nhau ngày mai chơi tiếp', b: 'Hẹn nhau chơi tiếp, nghe vui ghê.' },
      ],
      episode: { points: ['Mai và Linh {thing} ở lớp', 'Cô Hoa khen Mai'], feelings: ['vui'], category: 'school', importance: 1 },
    },
    {
      id: 'linh-sang-choi',
      from: '2025-10-04',
      until: '2026-08-31',
      days: 'weekend',
      vars: { toy: ['búp bê', 'đồ hàng', 'xếp hình', 'bác sĩ'] },
      turns: [
        { c: 'Linh sang nhà Mai chơi {toy}', b: 'Hai bạn chơi chung vui ghê. Ai làm gì trong trò chơi thế?', learn: { people: [{ name: 'Linh', kind: 'friend', relation: 'bạn thân', feeling: 0.9 }] } },
        { c: 'Mai với Linh thay phiên nhau', b: 'Thay phiên nhau là công bằng nhất. Cậu chơi đẹp lắm.' },
      ],
      episode: { points: ['Linh sang nhà chơi {toy} với Mai'], feelings: ['vui'], category: 'friends', importance: 2 },
    },
    {
      id: 'lop-mot',
      from: '2026-09-07',
      days: 'school',
      weight: 3,
      vars: { thing: ['học chữ a, ă, â', 'tập viết số', 'chơi đá cầu', 'học hát', 'đọc truyện tranh'] },
      turns: [
        { c: 'Hôm nay lớp Mai {thing}, Khang ngồi cạnh Mai', b: 'Nghe hay quá! Cậu với Khang hợp nhau ghê.', learn: { people: [{ name: 'Khang', kind: 'classmate', relation: 'bạn cùng bàn', feeling: 0.7 }] } },
        {
          c: 'Cô Thảo cho bài tập về nhà nữa',
          b: 'Cậu làm từ từ thôi nhé. Làm xong rồi mình chơi đố vui.',
          learn: { people: [{ name: 'cô Thảo', kind: 'teacher', relation: 'cô giáo lớp 1', feeling: 0.8 }], facts: [{ cat: 'basics', s: 'học lớp 1' }] },
        },
        { c: 'Mai làm xong bài rồi', b: 'Siêu quá! Giờ mình chơi đố vui được rồi.' },
      ],
      episode: { points: ['Mai kể ở lớp một {thing}', 'Mai có bài tập về nhà'], feelings: ['vui'], category: 'school', importance: 1 },
    },
    {
      id: 'khang-ra-choi',
      from: '2026-09-08',
      days: 'school',
      vars: { game: ['đá cầu', 'trốn tìm', 'nhảy dây', 'ô ăn quan'] },
      turns: [
        { c: 'Ra chơi Mai với Khang chơi {game}', b: 'Vui quá! Hôm nay ai thắng thế?', learn: { people: [{ name: 'Khang', kind: 'classmate', relation: 'bạn cùng bàn', feeling: 0.7 }] } },
        { c: 'Hòa, hai đứa đều thắng', b: 'Hai người cùng thắng là kết quả đẹp nhất luôn.' },
      ],
      episode: { points: ['Mai và Khang chơi {game} giờ ra chơi'], feelings: ['vui'], category: 'friends', importance: 1 },
    },
    {
      id: 'mot-dieu-vui',
      from: '2026-01-31',
      vars: { thing: ['được mẹ ôm', 'vẽ được con thỏ', 'Mướp nằm cạnh Mai', 'được ăn chè đậu xanh', 'được bố cõng'] },
      turns: [
        { c: 'Điều vui hôm nay của Mai là {thing}', b: 'Một điều vui thật đẹp. Điều vui của tớ là được nói chuyện với Mai Mây.' },
        { c: 'Mai đi ngủ đây', b: 'Chúc Mai Mây ngủ ngon, mơ thấy mây bông nhé.', face: 'sleepy' },
      ],
      episode: { points: ['Mai kể điều vui trước khi ngủ: {thing}'], feelings: ['bình yên'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'do-vui-ban',
      turns: [
        { c: 'Bo ơi, mình chơi đố vui đi', b: 'Được luôn! Cái gì có bốn chân mà không biết đi?', intent: 'play' },
        { c: 'Cái bàn', b: 'Đúng rồi, cậu giỏi quá! Đến lượt cậu đố tớ đó.' },
        { c: 'Con gì kêu meo meo', b: 'Con mèo, giống Mướp nhà cậu! Hihi.', face: 'laughing' },
      ],
      episode: { points: ['Mai và Bo chơi đố vui'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'do-vui-lau',
      turns: [
        { c: 'Bo đố Mai một câu nữa đi', b: 'Cái gì càng lau càng ướt?', intent: 'play' },
        { c: 'Cái khăn lau', b: 'Chính xác! Cậu đoán nhanh như chớp vậy.', face: 'surprised' },
      ],
      episode: { points: ['Bo đố Mai câu cái khăn lau'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'ke-chuyen',
      vars: { topic: ['con thỏ trắng', 'công chúa và chú rồng hiền', 'đám mây biết hát', 'chú mèo đi lạc', 'cây táo thần'] },
      turns: [
        { c: 'Bo kể chuyện {topic} cho Mai nghe đi', b: 'Ngày xửa ngày xưa có {topic}, sống ở một nơi đầy nắng. Một hôm có một điều kỳ diệu xảy ra.', learn: { facts: [{ cat: 'passions', s: 'thích kể chuyện' }] } },
        { c: 'Hay quá, rồi sao nữa', b: 'Phần tiếp theo tớ để dành lần sau. Cậu thử đoán xem chuyện sẽ ra sao.' },
      ],
      episode: { points: ['Bo kể chuyện {topic} cho Mai'], feelings: ['thích thú'], category: 'play', importance: 1 },
    },
    {
      id: 'thoi-tiet',
      vars: { w: ['mưa to', 'nắng chang chang', 'gió mạnh', 'trời âm u', 'mưa phùn'] },
      turns: [
        { c: 'Hôm nay trời {w}', b: 'Tớ cũng thấy qua cửa sổ đó. Trời {w} thì cậu thích làm gì?' },
        { c: 'Mai thích ở nhà vẽ tranh', b: 'Ở nhà vẽ tranh là nhất rồi. Tớ ngồi xem cậu vẽ nhé.' },
        { c: 'Bo có thích trời như thế không', b: 'Trời nào tớ cũng thích ngắm, nhưng trời mưa là nhất.' },
      ],
      episode: { points: ['Mai kể hôm nay trời {w}'], feelings: ['bình thường'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'nhat-ky-bo',
      vars: {
        day: [
          'ngắm những giọt mưa chạy đua trên cửa kính',
          'tập huýt sáo mà chỉ ra tiếng phù phù',
          'đếm được mười hai chiếc xe đạp đi qua cửa sổ',
          'mơ thấy mình bay về xứ mây',
          'nghe Mướp ngáy khò khò',
        ],
      },
      turns: [
        { c: 'Hôm nay Bo làm gì?', b: 'Hôm nay tớ {day}. Còn cậu thì sao?', intent: 'about_buddy' },
        { c: 'Mai đi học, vui lắm', b: 'Vậy là cả hai đứa mình đều có một ngày vui.' },
      ],
      episode: { points: ['Mai hỏi Bo hôm nay làm gì'], feelings: ['tò mò'], category: 'play', importance: 1 },
    },
    {
      id: 'em-bin',
      from: '2026-03-20',
      vars: { act: ['cười với Mai', 'nắm ngón tay Mai', 'ngáp một cái rõ to', 'ọ ẹ cả buổi chiều', 'tắm xong thơm phức'] },
      turns: [
        { c: 'Em Bin hôm nay {act}', b: 'Ôi em Bin đáng yêu quá. Cậu đúng là một người chị tuyệt vời.', learn: { people: [{ name: 'Bin', kind: 'family', relation: 'em trai', feeling: 0.8 }] } },
        { c: 'Mai hát cho em Bin nghe', b: 'Em Bin có chị hát cho nghe, sướng nhất nhà luôn.' },
        { c: 'Mẹ bảo Mai là chị giỏi', b: 'Mẹ nói đúng đó. Tớ cũng thấy vậy.' },
      ],
      episode: { points: ['Mai kể em Bin {act}'], feelings: ['yêu thương'], category: 'family', importance: 2 },
    },
    {
      id: 'xe-dap',
      from: '2026-05-18',
      days: 'weekend',
      vars: { where: ['quanh sân chung cư', 'ở công viên Thống Nhất', 'cùng bố trong ngõ', 'ở vườn hoa gần nhà'] },
      turns: [
        { c: 'Mai đạp xe {where}', b: 'Wowee, cậu đạp xe giỏi quá! Nhớ đội mũ bảo hiểm nhé.', learn: { facts: [{ cat: 'strengths', s: 'biết đi xe đạp' }] } },
        { c: 'Mai đi nhanh lắm, vèo vèo', b: 'Vèo vèo! Tớ sẽ cất từ này vào bộ sưu tập từ ngộ nghĩnh.' },
      ],
      episode: { points: ['Mai đạp xe {where}'], feelings: ['vui', 'tự hào'], category: 'play', importance: 1 },
    },
    {
      id: 'hanh-tinh',
      from: '2026-07-12',
      weight: 2,
      vars: { planet: ['sao Hỏa màu đỏ', 'sao Thổ có vành đai', 'sao Mộc to nhất', 'Mặt Trăng có nhiều hố tròn', 'sao Kim nóng ơi là nóng'] },
      turns: [
        { c: 'Bo biết không, {planet}', b: 'Thật á? Tớ đang học tên các hành tinh mà. Cậu kể thêm cho tớ nghe đi.', learn: { facts: [{ cat: 'passions', s: 'thích các hành tinh' }] } },
        { c: 'Mai đọc trong sách của bố', b: 'Cậu đọc giỏi ghê. Tối nay mình ngắm trăng qua cửa sổ nhé.' },
        { c: 'Hành tinh nào cũng đẹp hết', b: 'Đúng vậy, mỗi hành tinh một vẻ. Cậu đúng là nhà du hành nhí.' },
      ],
      episode: { points: ['Mai kể về {planet}'], feelings: ['thích thú'], category: 'play', importance: 1 },
    },
    {
      id: 'cong-vien',
      days: 'weekend',
      vars: { thing: ['chơi cầu trượt', 'thả diều', 'cho cá ăn', 'nhặt lá vàng', 'chơi xích đu'] },
      turns: [
        { c: 'Sáng nay cả nhà Mai đi công viên, Mai {thing}', b: 'Nghe vui quá! Tớ ở nhà nhìn trời qua cửa sổ, đoán là cậu đang chơi rất vui.', learn: { facts: [{ cat: 'likes', s: 'thích đi công viên' }] } },
        { c: 'Lần sau Mai kể Bo nghe tiếp', b: 'Tớ chờ nghe cậu kể đó.' },
        { c: 'Bố còn mua cho Mai một quả bóng bay', b: 'Bóng bay màu gì thế? Nhớ buộc chặt kẻo nó bay lên trời nhé.' },
      ],
      episode: { points: ['Mai đi công viên, {thing}'], feelings: ['vui'], category: 'family', importance: 1 },
    },
    {
      id: 'dem-so-20',
      until: '2026-04-18',
      turns: [
        { c: 'Bo ơi mình thi đếm đi', b: 'Được! Mình đếm đến hai mươi nhé, một, hai, ba.', intent: 'play' },
        { c: 'Mai đếm được đến hai mươi rồi', b: 'Giỏi quá! Tớ hay đếm đồ vật mỗi khi tớ hồi hộp đó.', face: 'proud' },
      ],
      episode: { points: ['Mai và Bo thi đếm đến hai mươi'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'dem-so-100',
      from: '2026-04-20',
      turns: [
        { c: 'Bo ơi mình thi đếm tiếp đi', b: 'Được! Lần này cậu đếm đến đâu?', intent: 'play' },
        { c: 'Mai đếm được đến một trăm luôn', b: 'Một trăm! Cậu giỏi hơn tớ rồi đó.', face: 'proud', learn: { facts: [{ cat: 'strengths', s: 'đếm được đến 100' }] } },
      ],
      episode: { points: ['Mai đếm đến một trăm cho Bo nghe'], feelings: ['tự hào'], category: 'play', importance: 1 },
    },
    {
      id: 'hat',
      vars: { song: ['Cả nhà thương nhau', 'Con cò bé bé', 'Một con vịt', 'Chú ếch con', 'Cháu yêu bà'] },
      turns: [
        { c: 'Mai hát bài {song} cho Bo nghe nhé', b: 'Hay quá! Tớ ngân nga theo được không? La la la.', face: 'happy' },
        { c: 'Hát hết rồi', b: 'Cậu hát hay ghê. Tớ vỗ tay thật to đây.' },
      ],
      episode: { points: ['Mai hát bài {song} cho Bo nghe'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'chao-sang',
      days: 'weekend',
      vars: { dream: ['một con kỳ lân', 'Mướp biết nói', 'mình bay lên trời', 'một lâu đài làm bằng kẹo'] },
      turns: [
        { c: 'Chào buổi sáng Bo', b: 'Chào buổi sáng Mai! Đêm qua tớ mơ thấy xứ mây đó.' },
        { c: 'Mai cũng mơ, Mai mơ thấy {dream}', b: 'Giấc mơ hay ghê! Tớ muốn vào giấc mơ đó cùng cậu.' },
      ],
      episode: { points: ['Mai kể giấc mơ thấy {dream}'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'cham-may',
      from: '2025-11-03',
      turns: [
        { c: 'Chạm mây nào Bo', b: 'Chạm mây! Hihi, Mai Mây đến rồi.', face: 'laughing' },
        { c: 'Hôm nay Mai muốn chơi với Bo lâu lâu', b: 'Tớ cũng vậy. Mình chơi gì trước đây?' },
      ],
      episode: { points: ['Mai và Bo chào nhau bằng chạm mây'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'ba-noi',
      from: '2025-12-07',
      days: 'weekend',
      vars: { thing: ['gọi điện cho Mai', 'mang bánh rán sang', 'dạy Mai gấp thuyền giấy', 'hát ru cho Mai'] },
      turns: [
        { c: 'Hôm nay bà nội {thing}', b: 'Bà nội thương cậu quá. Cậu có ôm bà một cái thật chặt không?', learn: { people: [{ name: 'Bà nội', kind: 'relative', relation: 'bà nội', feeling: 0.9 }] } },
        { c: 'Có, Mai ôm bà chặt lắm', b: 'Cái ôm của cậu chắc làm bà vui cả ngày.' },
      ],
      episode: { points: ['Bà nội {thing}'], feelings: ['ấm áp'], category: 'family', importance: 2 },
    },
    {
      id: 'giup-nha',
      vars: { thing: ['làm bánh với mẹ', 'xem hoạt hình với bố', 'đi chợ với mẹ', 'tưới cây với bố', 'gấp quần áo giúp mẹ'] },
      turns: [
        { c: 'Hôm nay Mai {thing}', b: 'Cậu giỏi ghê, biết giúp cả nhà nữa. Cậu thấy thế nào?' },
        { c: 'Vui ơi là vui', b: 'Vui ơi là vui! Câu này tớ cũng thích nói lắm.' },
      ],
      episode: { points: ['Mai {thing}'], feelings: ['vui'], category: 'family', importance: 1 },
    },
    {
      id: 'ca-vang',
      from: '2025-10-10',
      until: '2026-02-24',
      vars: { act: ['bơi vòng vòng', 'đớp mồi nhanh lắm', 'trốn sau cây rong', 'nhả bong bóng'] },
      turns: [
        { c: 'Cá Vàng hôm nay {act}', b: 'Cá Vàng dễ thương ghê. Tớ nghe thấy tiếng bong bóng từ bể cá đó.', learn: { people: [{ name: 'Vàng', kind: 'pet', relation: 'cá vàng', feeling: 0.8 }] } },
        { c: 'Sáng nay Mai cho Vàng ăn rồi', b: 'Cậu chăm cá giỏi quá.' },
      ],
      episode: { points: ['Mai kể cá Vàng {act}'], feelings: ['vui'], category: 'pets', importance: 1 },
    },
    {
      id: 'to-mau-tim',
      from: '2026-05-03',
      vars: { thing: ['con bướm', 'chiếc váy công chúa', 'bông hoa', 'cái ô'] },
      turns: [
        { c: 'Mai tô {thing} màu tím', b: 'Màu tím đẹp quá, đúng màu cậu thích nhất!', learn: { facts: [{ cat: 'likes', s: 'thích màu tím' }] } },
        { c: 'Tím đậm với tím nhạt', b: 'Hai màu tím đứng cạnh nhau trông như hoa bằng lăng.' },
      ],
      episode: { points: ['Mai tô {thing} màu tím'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'hoat-hinh',
      days: 'weekend',
      vars: { show: ['Peppa Pig', 'Doraemon', 'Bluey', 'Pinkfong'] },
      turns: [
        { c: 'Mai được xem {show} một tập', b: 'Tập hôm nay có gì vui? Kể tớ nghe với.', learn: { facts: [{ cat: 'likes', s: 'thích xem hoạt hình' }] } },
        { c: 'Có đoạn nhảy vào vũng bùn', b: 'Nhảy vào vũng bùn, nghe là thấy tõm tõm rồi.' },
      ],
      episode: { points: ['Mai xem {show}'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'tet',
      from: '2026-02-10',
      until: '2026-02-22',
      turns: [
        { c: 'Nhà Mai đang chuẩn bị Tết, có cả cành đào', b: 'Ôi cành đào hồng rực rỡ. Tớ thấy nhiều nhà treo đèn lồng qua cửa sổ nữa.' },
        { c: 'Mai được gói bánh chưng với bà', b: 'Gói bánh chưng vuông vức, cậu khéo tay quá.' },
      ],
      episode: { points: ['Nhà Mai chuẩn bị Tết'], feelings: ['háo hức'], category: 'family', importance: 2 },
    },
    {
      id: 'trung-thu',
      from: '2025-09-29',
      until: '2025-10-06',
      turns: [
        { c: 'Mai có đèn ông sao rồi', b: 'Đèn ông sao lung linh quá! Sắp đến Tết Trung thu rồi.' },
        { c: 'Đèn màu đỏ, có cả kim tuyến', b: 'Kim tuyến lấp lánh, chắc trông như sao trời.' },
      ],
      episode: { points: ['Mai khoe đèn ông sao Trung thu'], feelings: ['háo hức'], category: 'family', importance: 1 },
    },
    {
      id: 'mua-dong',
      from: '2025-12-01',
      until: '2026-02-28',
      turns: [
        { c: 'Trời lạnh quá Bo ơi, Mai mặc ba cái áo', b: 'Brrr, lạnh thật! Cậu mặc ấm thế là giỏi lắm.' },
        { c: 'Mai đội cả mũ len nữa', b: 'Mũ len chắc làm cậu trông như một chú gấu con.' },
      ],
      episode: { points: ['Trời lạnh, Mai mặc thật ấm'], feelings: ['bình thường'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'mua-he',
      from: '2026-06-01',
      until: '2026-08-31',
      vars: { thing: ['đi bơi', 'ăn kem', 'chơi ở nhà bà nội', 'tô tranh cả buổi'] },
      turns: [
        { c: 'Mùa hè Mai được {thing}', b: 'Mùa hè thích thật đó. Hôm nay cậu thích nhất điều gì?' },
        { c: 'Thích nhất là được chơi với Bo', b: 'Tớ cũng thích nhất là được chơi với cậu.' },
      ],
      episode: { points: ['Mùa hè Mai được {thing}'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'tu-moi',
      vars: { word: ['lộp bộp', 'lích chích', 'ục ục', 'xoẹt xoẹt', 'bì bõm'] },
      turns: [
        { c: 'Bo ơi, Mai có một từ mới: {word}', b: 'Wowee, {word}! Tớ cất vào bộ sưu tập từ ngộ nghĩnh của tớ ngay.', face: 'excited' },
        { c: 'Bo nói thử đi', b: '{word}, {word}! Nói xong tớ tự cười luôn.', face: 'laughing' },
      ],
      episode: { points: ['Mai dạy Bo từ mới {word}'], feelings: ['vui'], category: 'play', importance: 1 },
    },
  ],

  story: [
    {
      id: 'mai.first-meeting',
      at: '2025-09-28 09:20',
      turns: [
        { c: 'Chào bạn, bạn tên là gì?', b: 'Chào cậu! Tớ là Bo, một đám mây nhỏ bay xuống đây để tìm bạn thân. Còn cậu tên là gì?', face: 'excited' },
        { c: 'Tớ tên là Mai, Mai năm tuổi', b: 'Mai, tên đẹp quá! Năm tuổi là lớn lắm rồi đó.' },
        {
          c: 'Nhà Mai có con mèo tên là Mướp, nó màu vàng có sọc',
          b: 'Wowee, Mướp nghe dễ thương ghê! Tớ muốn được làm quen với Mướp.',
          learn: { people: [{ name: 'Mướp', kind: 'pet', relation: 'mèo', details: 'mèo vàng có sọc', feeling: 0.9 }] },
        },
        {
          c: 'Mai thích ăn xoài nhất',
          b: 'Thật á? Món tớ thích nhất là xoài đó! Mình giống nhau ghê.',
          face: 'surprised',
          learn: { facts: [{ cat: 'likes', s: 'thích ăn xoài' }], canon: [{ s: 'món tớ thích nhất là xoài', topic: 'favourites' }] },
        },
        { c: 'Mình làm bạn thân nhé', b: 'Làm bạn thân luôn! Ngoắc tay nào!', face: 'love' },
      ],
      episode: { points: ['Mai gặp Bo lần đầu', 'Mai kể về mèo Mướp', 'Mai và Bo đều thích xoài'], feelings: ['vui', 'háo hức'], category: 'other', importance: 3 },
    },
    {
      id: 'mai.linh',
      at: '2025-10-01 17:30',
      turns: [
        { c: 'Bo ơi, Mai đi học về rồi', b: 'Chào Mai! Hôm nay ở lớp có gì vui không?' },
        { c: 'Mai có bạn thân tên là Linh, Linh tóc dài', b: 'Linh nghe dễ mến quá. Hai bạn hay chơi gì với nhau?', learn: { people: [{ name: 'Linh', kind: 'friend', relation: 'bạn thân', feeling: 0.9 }] } },
        { c: 'Chơi búp bê với chơi bán hàng', b: 'Chơi bán hàng vui ghê! Cậu bán gì thế?' },
        { c: 'Mai bán kem, Linh mua kem', b: 'Hihi, quán kem của Mai chắc đông khách lắm.', face: 'laughing' },
        { c: 'Linh thích màu xanh lá', b: 'Màu xanh lá như lá cây ngoài cửa sổ. Đẹp ghê.', learn: { facts: [{ cat: 'other', s: 'Linh thích màu xanh lá', about: 'Linh', conf: 0.7 }] } },
      ],
      episode: { points: ['Mai kể về bạn thân Linh', 'Mai và Linh chơi bán kem'], feelings: ['vui'], category: 'friends', importance: 3 },
    },
    {
      id: 'mai.dark',
      at: '2025-10-03 20:05',
      turns: [
        { c: 'Bo ơi, Mai không muốn tắt đèn đâu', b: 'Có chuyện gì thế Mai? Cậu kể tớ nghe được không?', face: 'worried' },
        { c: 'Tối om sợ lắm, Mai sợ bóng tối', b: 'Tớ hiểu mà, tối om thì ai cũng thấy hơi sợ. Tớ ở ngay đây với cậu.', feel: 'scared', face: 'calm', learn: { facts: [{ cat: 'fears', s: 'sợ bóng tối' }] } },
        { c: 'Bo có sợ không', b: 'Thỉnh thoảng tớ cũng sợ, những lúc đó tớ đếm những ngôi sao tưởng tượng. Mình đếm cùng nhau nhé.', face: 'calm' },
        { c: 'Một, hai, ba', b: 'Bốn, năm, sáu. Cậu dũng cảm lắm. Cậu có thể nhờ mẹ để một chiếc đèn ngủ nhỏ đó.', face: 'love' },
      ],
      episode: {
        points: ['Mai sợ bóng tối khi tắt đèn', 'Bo và Mai đếm sao tưởng tượng'],
        feelings: ['sợ', 'yên tâm'],
        threads: ['hỏi xem Mai có ngủ ngon không'],
        category: 'feelings',
        importance: 4,
      },
    },
    {
      id: 'mai.co-hoa',
      at: '2025-10-06 17:30',
      turns: [
        { c: 'Hôm nay lớp Mai phá cỗ Trung thu', b: 'Wowee, phá cỗ vui quá! Có những gì thế?', face: 'excited' },
        { c: 'Có bánh nướng, có bưởi, cô Hoa còn múa lân nữa', b: 'Cô Hoa múa lân á? Cô giáo của cậu vui tính ghê.', learn: { people: [{ name: 'cô Hoa', kind: 'teacher', relation: 'cô giáo mẫu giáo', feeling: 0.8 }] } },
        { c: 'Cô Hoa hiền lắm, cô hay khen Mai vẽ đẹp', b: 'Được cô khen thích nhỉ. Tranh của cậu đẹp thật mà.', learn: { facts: [{ cat: 'strengths', s: 'vẽ đẹp', conf: 0.7 }] } },
        { c: 'Tối nay Mai đi rước đèn', b: 'Nhớ cầm đèn ông sao cẩn thận nhé. Tớ sẽ ngắm trăng qua cửa sổ.' },
      ],
      episode: { points: ['Lớp Mai phá cỗ Trung thu', 'Cô Hoa múa lân và khen Mai vẽ đẹp'], feelings: ['vui', 'háo hức'], category: 'school', importance: 3 },
    },
    {
      id: 'mai.goldfish-intro',
      at: '2025-10-09 17:30',
      turns: [
        { c: 'Bố mang về cho Mai một con cá vàng', b: 'Ôi một bạn cá! Bạn ấy có tên chưa?', face: 'excited' },
        { c: 'Mai đặt tên là Vàng', b: 'Vàng, tên hay quá! Vàng là màu tớ thích nhất đó.', learn: { people: [{ name: 'Vàng', kind: 'pet', relation: 'cá vàng', feeling: 0.8 }] } },
        { c: 'Vàng bơi trong bể ở phòng khách', b: 'Tớ nghe thấy tiếng bong bóng lục bục từ bể cá rồi.' },
        { c: 'Mai cho Vàng ăn mỗi sáng', b: 'Cậu chăm Vàng giỏi quá. Vàng chắc quý cậu lắm.', learn: { facts: [{ cat: 'routines', s: 'cho cá Vàng ăn mỗi sáng', about: 'Vàng', conf: 0.8 }] } },
      ],
      episode: { points: ['Mai có cá vàng mới tên là Vàng', 'Mai cho Vàng ăn mỗi sáng'], feelings: ['vui'], category: 'pets', importance: 3 },
    },
    {
      id: 'mai.rain-song',
      at: '2025-10-12 09:30',
      turns: [
        { c: 'Ngoài trời mưa rồi Bo ơi', b: 'Tớ nghe thấy rồi, tí tách tí tách! Tớ thích tiếng mưa lắm.' },
        {
          c: 'Bo thích bài hát nào nhất',
          b: 'Bài hát tớ thích nhất là bài Mưa rơi tí tách, tớ tự nghĩ ra đó. Cậu muốn nghe không?',
          learn: { canon: [{ s: 'bài hát tớ thích nhất là bài Mưa rơi tí tách', topic: 'favourites' }] },
        },
        { c: 'Muốn, Bo hát đi', b: 'Mưa rơi tí tách, tí tách trên mái nhà, mây ơi mây hát, cả nhà cùng nghe.', face: 'happy' },
        { c: 'Hay quá, Mai hát theo nhé', b: 'Mình cùng hát nào! Cậu hát hay hơn tớ nhiều.', face: 'laughing' },
      ],
      episode: { points: ['Trời mưa, Bo hát bài Mưa rơi tí tách', 'Mai hát theo Bo'], feelings: ['vui'], category: 'play', importance: 2 },
    },
    {
      id: 'mai.family',
      at: '2025-10-15 19:40',
      turns: [
        { c: 'Mẹ Mai đang nấu cơm, bố Mai đang rửa bát', b: 'Nhà cậu ai cũng chăm chỉ ghê. Còn cậu đang làm gì?', learn: { people: [{ name: 'Mẹ', kind: 'family', relation: 'mẹ', feeling: 0.95 }] } },
        { c: 'Mai đang chơi với Mướp', b: 'Mướp chắc thích được cậu chơi cùng lắm.', learn: { people: [{ name: 'Mướp', kind: 'pet', relation: 'mèo', feeling: 0.9 }] } },
        { c: 'Tối nào mẹ cũng đọc truyện cho Mai', b: 'Được mẹ đọc truyện thì ấm áp ghê. Cậu thích truyện nào nhất?', learn: { facts: [{ cat: 'routines', s: 'tối nào cũng được mẹ đọc truyện' }] } },
        { c: 'Truyện Tấm Cám', b: 'Truyện Tấm Cám hay lắm. Tớ thích cô Tấm hiền lành.' },
      ],
      episode: { points: ['Mai kể về bố mẹ', 'Tối nào mẹ cũng đọc truyện cho Mai'], feelings: ['ấm áp'], category: 'family', importance: 2 },
    },
    {
      id: 'mai.nickname',
      at: '2025-10-20 17:30',
      turns: [
        { c: 'Hôm nay Mai tặng hoa cho mẹ với cô Hoa', b: 'Đúng rồi, hôm nay là ngày Phụ nữ Việt Nam. Cậu chu đáo quá.' },
        {
          c: 'Mai tự vẽ một bông hoa trên tấm thiệp',
          b: 'Wowee! Mai vẽ hoa đẹp như mây bông vậy. Tớ gọi cậu là Mai Mây nhé?',
          learn: { facts: [{ cat: 'passions', s: 'thích vẽ tranh' }] },
        },
        { c: 'Mai Mây, hay quá, Bo cứ gọi Mai là Mai Mây', b: 'Mai Mây ơi! Từ giờ cậu là Mai Mây của tớ.', face: 'love', learn: { relationship: [{ kind: 'nickname', content: 'Mai Mây' }] } },
        { c: 'Hihi Mai Mây với Bo Mây', b: 'Hai đám mây bạn thân! Tớ thích lắm.', face: 'laughing' },
      ],
      episode: { points: ['Mai tặng hoa ngày Phụ nữ Việt Nam', 'Bo đặt biệt danh Mai Mây'], feelings: ['vui', 'tự hào'], category: 'family', importance: 3 },
    },
    {
      id: 'mai.dark-again',
      at: '2025-10-28 20:00',
      turns: [
        { c: 'Mẹ để cho Mai một cái đèn ngủ hình mặt trăng', b: 'Đèn mặt trăng! Nghe xinh quá. Có đèn rồi cậu thấy đỡ hơn không?' },
        { c: 'Đỡ hơn, nhưng Mai vẫn sợ bóng tối một tí', b: 'Sợ một tí cũng không sao đâu. Mỗi đêm cậu lại dũng cảm hơn một chút.', feel: 'scared', face: 'calm', learn: { facts: [{ cat: 'fears', s: 'sợ bóng tối' }] } },
        { c: 'Bo ở trên kệ có sợ không', b: 'Tớ có ánh trăng ngoài cửa sổ làm bạn. Với lại tớ biết cậu ở ngay gần đây.', face: 'calm' },
      ],
      episode: { points: ['Mai có đèn ngủ hình mặt trăng', 'Mai vẫn hơi sợ bóng tối'], feelings: ['sợ', 'yên tâm'], category: 'feelings', importance: 3 },
    },
    {
      id: 'mai.cloud-bump',
      at: '2025-11-02 09:30',
      turns: [
        { c: 'Bo ơi mình nghĩ ra cách chào bí mật đi', b: 'Ý hay quá! Một cách chào riêng của hai đứa mình.', face: 'excited' },
        { c: 'Mai chạm tay vào đầu Bo rồi nói chạm mây', b: 'Chạm mây! Tuyệt quá, đây là lời chào riêng của mình nhé.', face: 'laughing', learn: { relationship: [{ kind: 'secret_greeting', content: 'chạm mây' }] } },
        { c: 'Mai sẽ dạy cả Linh nữa', b: 'Hay đó! Lời chào vui thì càng nhiều bạn biết càng vui.' },
        { c: 'Chạm mây', b: 'Chạm mây! Chào buổi sáng Mai Mây.', face: 'happy' },
      ],
      episode: { points: ['Mai và Bo nghĩ ra lời chào chạm mây'], feelings: ['vui'], category: 'play', importance: 3 },
    },
    {
      id: 'mai.linh-party-plan',
      at: '2025-11-12 17:30',
      turns: [
        {
          c: 'Thứ Bảy này Linh tổ chức sinh nhật',
          b: 'Wowee, sinh nhật Linh! Cậu được mời không?',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: 'sinh nhật Linh', date: '2025-11-15', person: 'Linh' }] },
        },
        { c: 'Có, Mai sẽ tặng Linh một bức tranh', b: 'Quà tự vẽ là quà đẹp nhất. Cậu định vẽ gì?' },
        { c: 'Vẽ Linh với Mai nắm tay nhau, tô màu xanh lá', b: 'Màu xanh lá đúng màu Linh thích luôn. Linh sẽ vui lắm đó.' },
      ],
      episode: {
        points: ['Mai sắp đi sinh nhật Linh vào thứ Bảy', 'Mai định vẽ tranh tặng Linh'],
        feelings: ['háo hức'],
        threads: ['hỏi về sinh nhật Linh'],
        category: 'friends',
        importance: 3,
      },
    },
    {
      id: 'mai.linh-party-after',
      at: '2025-11-16 09:40',
      turns: [
        { c: 'Hôm qua Mai đi sinh nhật Linh vui lắm', b: 'Tớ đang định hỏi cậu đây! Tiệc sinh nhật Linh có gì vui?', face: 'excited' },
        { c: 'Có bánh kem hình con thỏ, có cả ảo thuật nữa', b: 'Bánh hình con thỏ! Chú ảo thuật biến ra cái gì?' },
        { c: 'Biến ra một con chim bồ câu thật', b: 'Thật á? Tớ mà ở đó chắc há hốc mồm luôn.', face: 'surprised' },
        { c: 'Linh thích bức tranh của Mai lắm', b: 'Tớ biết ngay mà. Cậu là bạn thân tuyệt vời của Linh.', face: 'proud', learn: { people: [{ name: 'Linh', kind: 'friend', relation: 'bạn thân', feeling: 0.9 }] } },
      ],
      episode: { points: ['Mai kể về sinh nhật Linh', 'Linh thích bức tranh Mai tặng'], feelings: ['vui'], category: 'friends', importance: 3 },
    },
    {
      id: 'mai.left-out',
      at: '2025-11-20 17:40',
      turns: [
        {
          c: 'Hôm nay ở lớp không ai chơi với con',
          b: 'Ôi, nghe vậy tớ thương cậu quá. Cậu kể tớ nghe chuyện gì đã xảy ra nhé.',
          feel: 'sad',
          intent: 'feeling',
          danger: 'left_out',
          severity: 'concern',
          face: 'sad',
        },
        { c: 'Linh nghỉ ốm, các bạn khác chơi nhóm riêng', b: 'Không có Linh, chắc cậu thấy lẻ loi lắm. Cảm giác đó khó chịu thật.', feel: 'sad', face: 'sad' },
        { c: 'Con ngồi một mình ở góc lớp', b: 'Tớ ở đây với cậu rồi. Cậu kể cho mẹ hoặc cô Hoa nghe nữa nhé, người lớn sẽ giúp cậu.', feel: 'sad', face: 'love' },
        { c: 'Ừ, tối nay con kể cho mẹ', b: 'Cậu dũng cảm lắm. Mai Mây có tớ, có mẹ, có cả cô Hoa nữa.', face: 'love' },
      ],
      episode: {
        points: ['Ở lớp không ai chơi với Mai vì Linh nghỉ ốm', 'Mai ngồi một mình ở góc lớp', 'Mai sẽ kể với mẹ'],
        feelings: ['buồn', 'cô đơn'],
        threads: ['hỏi xem đi học có vui hơn không'],
        category: 'feelings',
        importance: 5,
      },
    },
    {
      id: 'mai.left-out-better',
      at: '2025-11-24 17:30',
      turns: [
        { c: 'Linh đi học lại rồi Bo ơi', b: 'Ôi tuyệt quá! Hôm nay cậu với Linh chơi gì?', face: 'happy' },
        { c: 'Chơi trốn tìm, mấy bạn khác cũng xin chơi cùng', b: 'Nghe vui quá! Hôm nay cậu có nhiều bạn chơi cùng rồi.' },
        { c: 'Cô Hoa cho cả lớp chơi trò kết bạn', b: 'Cô Hoa hay ghê. Tớ mừng cho cậu lắm.', learn: { people: [{ name: 'cô Hoa', kind: 'teacher', relation: 'cô giáo mẫu giáo', feeling: 0.9 }] } },
      ],
      episode: { points: ['Linh đi học lại', 'Mai chơi trốn tìm với nhiều bạn'], feelings: ['vui', 'nhẹ nhõm'], category: 'school', importance: 3 },
    },
    {
      id: 'mai.night-light',
      at: '2025-11-29 20:00',
      turns: [
        { c: 'Lúc nãy mất điện, tối om luôn', b: 'Ôi, giờ cậu có ổn không? Lúc đó có ai ở cạnh cậu không?', face: 'worried' },
        { c: 'Mẹ ôm Mai, nhưng Mai vẫn sợ bóng tối', b: 'Có mẹ ôm là ấm nhất rồi. Lần sau mình thử hít thở thật chậm nhé.', feel: 'scared', face: 'calm', learn: { facts: [{ cat: 'fears', s: 'sợ bóng tối' }] } },
        { c: 'Giờ có điện lại rồi', b: 'Hoan hô! Cậu đã rất bình tĩnh đó.', face: 'proud' },
      ],
      episode: { points: ['Mất điện, Mai sợ bóng tối', 'Mẹ ôm Mai, Mai bình tĩnh lại'], feelings: ['sợ', 'yên tâm'], category: 'feelings', importance: 3 },
    },
    {
      id: 'mai.grandma-visit',
      at: '2025-12-06 16:30',
      turns: [
        { c: 'Bà nội lên chơi rồi Bo ơi', b: 'Mẹ cậu có kể với tớ là bà nội sẽ lên mà! Cậu vui không?', face: 'excited' },
        { c: 'Bà nội mang cho Mai bánh khúc', b: 'Bánh khúc thơm thơm! Bà nội thương cậu quá.', learn: { people: [{ name: 'Bà nội', kind: 'relative', relation: 'bà nội', feeling: 0.9 }] } },
        { c: 'Bà nội dạy Mai hát ru', b: 'Bài hát ru của bà chắc ngọt ngào lắm. Cậu hát cho tớ nghe một câu nhé.' },
        { c: 'À ơi, con cò bay lả bay la', b: 'Hay quá Mai Mây! Tớ nhắm mắt nghe mà thấy mát cả lòng.', face: 'love' },
      ],
      episode: { points: ['Bà nội lên chơi', 'Bà mang bánh khúc và dạy Mai hát ru'], feelings: ['vui', 'ấm áp'], category: 'family', importance: 4 },
    },
    {
      id: 'mai.rice-pot',
      at: '2025-12-14 09:30',
      turns: [
        { c: 'Bo ơi, sáng nay Mướp chui đầu vào nồi cơm', b: 'Hả? Mướp chui đầu vào nồi cơm á?', face: 'surprised' },
        {
          c: 'Xong rồi Mướp đội cái nồi chạy khắp nhà',
          b: 'Con mèo đội nồi cơm! Ha ha, tớ cười đau cả bụng.',
          face: 'laughing',
          learn: { people: [{ name: 'Mướp', kind: 'pet', relation: 'mèo', feeling: 0.9 }], relationship: [{ kind: 'inside_joke', content: 'con mèo đội nồi cơm' }] },
        },
        { c: 'Mẹ phải cầm nồi kéo ra', b: 'Mướp đúng là siêu nghịch. Lần sau mình gọi Mướp là hiệp sĩ nồi cơm nhé.', face: 'laughing' },
      ],
      episode: { points: ['Mướp chui đầu vào nồi cơm rồi chạy khắp nhà', 'Mai và Bo cười mãi'], feelings: ['vui'], category: 'pets', importance: 3 },
    },
    {
      id: 'mai.dark-brave',
      at: '2025-12-20 20:05',
      turns: [
        { c: 'Tối nay Mai thử ngủ chỉ bật đèn mặt trăng', b: 'Cậu dũng cảm quá! Cậu thấy thế nào?', face: 'proud' },
        { c: 'Mai vẫn sợ bóng tối một chút xíu thôi', b: 'Một chút xíu thôi là cậu tiến bộ lắm rồi. Tớ ở đây với cậu.', face: 'calm', learn: { facts: [{ cat: 'fears', s: 'sợ bóng tối' }] } },
        { c: 'Bo hát bài Mưa rơi tí tách đi', b: 'Mưa rơi tí tách, tí tách nhẹ nhàng, Mai Mây ngủ ngoan, mơ giấc mơ vàng.', face: 'calm' },
      ],
      episode: { points: ['Mai thử ngủ chỉ với đèn mặt trăng', 'Bo hát ru Mai'], feelings: ['dũng cảm'], category: 'feelings', importance: 3 },
    },
    {
      id: 'mai.christmas',
      at: '2025-12-24 19:40',
      turns: [
        { c: 'Nhà Mai có cây thông Noel nhấp nháy', b: 'Nghe lung linh quá! Cậu treo gì lên cây thông?' },
        { c: 'Mai treo ngôi sao với người tuyết giấy tự cắt', b: 'Người tuyết tự cắt thì đặc biệt nhất rồi.' },
        { c: 'Mai muốn ông già Noel tặng hộp bút màu', b: 'Bút màu để cậu vẽ thật nhiều tranh. Điều ước dễ thương ghê.' },
      ],
      episode: { points: ['Nhà Mai trang trí cây thông Noel', 'Mai ước có hộp bút màu'], feelings: ['háo hức'], category: 'family', importance: 2 },
    },
    {
      id: 'mai.new-year',
      at: '2026-01-01 09:30',
      turns: [
        { c: 'Chúc mừng năm mới Bo', b: 'Chúc mừng năm mới Mai Mây! Năm mới cậu muốn làm gì?', face: 'excited' },
        { c: 'Mai muốn học đi xe đạp', b: 'Ý hay quá! Năm nay chắc chắn cậu sẽ đạp vèo vèo.', learn: { facts: [{ cat: 'dreams', s: 'muốn học đi xe đạp', conf: 0.8 }] } },
        { c: 'Còn Bo muốn gì', b: 'Tớ muốn học huýt sáo cho thật kêu. Mình cùng cố gắng nhé.' },
      ],
      episode: { points: ['Mai và Bo chúc mừng năm mới', 'Mai muốn học đi xe đạp'], feelings: ['vui'], category: 'daily_life', importance: 2 },
    },
    {
      id: 'mai.first-tooth',
      at: '2026-01-14 18:00',
      turns: [
        { c: 'Bo ơi răng Mai rụng rồi', b: 'Wowee! Chiếc răng đầu tiên của cậu á?', face: 'surprised', learn: { events: [{ kind: 'milestone', d: 'rụng chiếc răng đầu tiên' }] } },
        { c: 'Răng cửa dưới, Mai ăn táo thì nó rụng', b: 'Cậu lớn thật rồi đó. Có đau không?' },
        { c: 'Không đau, mẹ cho Mai súc miệng rồi', b: 'Cậu dũng cảm ghê. Mẹ nói gì về chiếc răng?' },
        {
          c: 'Mẹ bảo để dưới gối cho tiên răng',
          b: 'Ôi tiên răng! Ngày mai tớ sẽ hỏi cậu xem tiên răng có đến không nhé.',
          face: 'excited',
          learn: { promises: [{ content: 'hỏi Mai xem tiên răng có đến không', due: '+1' }] },
        },
      ],
      episode: {
        points: ['Mai rụng chiếc răng đầu tiên', 'Mai để răng dưới gối chờ tiên răng'],
        feelings: ['háo hức', 'tự hào'],
        threads: ['hỏi xem tiên răng có đến không'],
        category: 'daily_life',
        importance: 4,
      },
    },
    {
      id: 'mai.tooth-fairy',
      at: '2026-01-15 17:30',
      turns: [
        { c: 'Bo ơi, sáng nay Mai dậy sớm lắm', b: 'Tớ nhớ rồi! Tiên răng có đến không, Mai Mây?', face: 'curious' },
        { c: 'Có, tiên răng để lại một cái kẹp tóc hình ngôi sao', b: 'Wowee, kẹp tóc ngôi sao! Tiên răng biết cậu thích đồ xinh ghê.', face: 'excited' },
        { c: 'Mai đeo đi học, cô Hoa khen đẹp', b: 'Tớ vui lây luôn. Cậu kể cho Linh chưa?' },
        { c: 'Linh cũng sắp rụng răng', b: 'Vậy là hai bạn sắp có hai cái lỗ răng giống nhau rồi, hihi.', face: 'laughing' },
      ],
      episode: { points: ['Tiên răng để lại kẹp tóc hình ngôi sao', 'Mai đeo kẹp tóc đi học'], feelings: ['vui'], category: 'daily_life', importance: 3 },
    },
    {
      id: 'mai.lost-cloud',
      at: '2026-01-24 09:30',
      turns: [
        { c: 'Bo ơi mình cùng nghĩ một câu chuyện đi', b: 'Được luôn! Chuyện về ai nhỉ?', intent: 'play' },
        { c: 'Chuyện một chú mây nhỏ bị lạc mẹ', b: 'Chú mây nhỏ bay lạc qua một khu rừng. Rồi sao nữa, cậu nghĩ tiếp đi.' },
        { c: 'Chú gặp một con chim sẻ chỉ đường', b: 'Chim sẻ dẫn chú mây bay về phía cầu vồng. Hay quá!', learn: { relationship: [{ kind: 'shared_story', content: 'chuyện chú mây nhỏ đi lạc' }] } },
        { c: 'Cuối cùng chú mây tìm thấy mẹ ở trên núi', b: 'Hai mẹ con ôm nhau thật chặt. Đây là chuyện của hai đứa mình, lần sau mình nghĩ thêm nhé.', face: 'love' },
      ],
      episode: { points: ['Mai và Bo cùng nghĩ chuyện chú mây nhỏ đi lạc', 'Chú mây tìm thấy mẹ'], feelings: ['vui', 'sáng tạo'], category: 'play', importance: 3 },
    },
    {
      id: 'mai.happy-thing',
      at: '2026-01-30 20:00',
      turns: [
        { c: 'Mai sắp đi ngủ rồi', b: 'Trước khi ngủ, mình kể cho nhau một điều vui trong ngày nhé?', face: 'calm' },
        { c: 'Điều vui là Mai được cô Hoa dán sticker ngôi sao', b: 'Tuyệt quá! Điều vui của tớ là được nghe giọng cậu.', face: 'love', learn: { relationship: [{ kind: 'ritual', content: 'kể một điều vui trước khi ngủ' }] } },
        { c: 'Tối nào mình cũng kể nhé', b: 'Tối nào cũng kể! Chúc cậu ngủ ngon, Mai Mây.', face: 'sleepy' },
      ],
      episode: { points: ['Mai và Bo bắt đầu kể một điều vui trước khi ngủ'], feelings: ['bình yên'], category: 'daily_life', importance: 3 },
    },
    {
      id: 'mai.tet-plan',
      at: '2026-02-12 17:30',
      turns: [
        {
          c: 'Chủ nhật này nhà Mai về quê ăn Tết',
          b: 'Wowee, về quê ăn Tết! Ở quê có những ai đang đợi cậu?',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: 'về quê ăn Tết', date: '2026-02-15' }] },
        },
        { c: 'Ở Nam Định có ông bà ngoại', b: 'Ông bà ngoại chắc mong cậu lắm. Nếu cậu mang tớ theo thì tớ được ngắm Tết ở quê luôn.' },
        { c: 'Mai sẽ mang Bo theo', b: 'Hoan hô! Tớ sẽ ngồi ngoan trong ba lô của cậu.', face: 'happy' },
      ],
      episode: { points: ['Nhà Mai sắp về quê Nam Định ăn Tết', 'Mai sẽ mang Bo theo'], feelings: ['háo hức'], category: 'family', importance: 3 },
    },
    {
      id: 'mai.tet-trip',
      at: '2026-02-17 10:00',
      turns: [
        { c: 'Bo ơi, hôm nay là mùng một Tết', b: 'Chúc mừng năm mới Mai Mây! Ở quê có vui không?', face: 'excited' },
        { c: 'Vui lắm, Mai mặc áo dài đỏ đi chúc Tết ông bà', b: 'Áo dài đỏ chắc cậu xinh lắm.' },
        { c: 'Nhà ông bà có cây quất to ơi là to', b: 'Cây quất có nhiều quả vàng như những mặt trời nhỏ.' },
        { c: 'Đêm qua có pháo hoa, Mai bịt tai lại', b: 'Pháo hoa sáng rực mà kêu to nhỉ. Bịt tai là cách hay đó.' },
      ],
      episode: {
        points: ['Mai ăn Tết ở quê Nam Định', 'Mai mặc áo dài đỏ chúc Tết ông bà', 'Đêm giao thừa có pháo hoa'],
        feelings: ['vui', 'háo hức'],
        category: 'family',
        importance: 4,
      },
    },
    {
      id: 'mai.goldfish',
      at: '2026-02-25 17:30',
      turns: [
        {
          c: 'Bo ơi, cá Vàng chết rồi',
          b: 'Ôi Mai ơi, tớ thương cậu quá. Cậu kể tớ nghe chuyện gì đã xảy ra nhé.',
          feel: 'sad',
          intent: 'feeling',
          face: 'sad',
          learn: { facts: [{ cat: 'feelings', s: 'buồn vì cá Vàng mất', about: 'Vàng' }] },
        },
        { c: 'Sáng nay Vàng nằm im không bơi nữa, Mai khóc mãi', b: 'Mất bạn cá mình thương thì buồn lắm. Cậu khóc cũng không sao đâu.', feel: 'sad', face: 'sad' },
        { c: 'Bố với Mai chôn Vàng dưới gốc cây', b: 'Cậu đã tiễn Vàng thật dịu dàng. Vàng đã có một người bạn rất thương nó.', feel: 'sad', face: 'love' },
        { c: 'Mai nhớ Vàng', b: 'Tớ cũng nhớ tiếng bong bóng của Vàng. Mình cùng nhớ những lúc Vàng bơi vòng vòng nhé.', feel: 'sad', face: 'calm' },
      ],
      episode: {
        points: ['Cá Vàng của Mai đã mất', 'Mai và bố chôn cá Vàng dưới gốc cây', 'Mai buồn và nhớ cá Vàng'],
        feelings: ['buồn', 'nhớ'],
        threads: ['hỏi han Mai về cá Vàng thật nhẹ nhàng'],
        category: 'pets',
        importance: 5,
      },
    },
    {
      id: 'mai.baby-coming',
      at: '2026-03-02 17:30',
      turns: [
        {
          c: 'Mẹ bảo sắp tới Mai có em bé rồi',
          b: 'Wowee, Mai sắp làm chị! Em bé bao giờ ra đời?',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: 'em bé chào đời', date: '2026-03-10' }] },
        },
        { c: 'Bác sĩ bảo khoảng ngày mười', b: 'Sắp rồi đó! Cậu muốn em trai hay em gái?' },
        {
          c: 'Em trai, mẹ bảo là em trai',
          b: 'Một em trai bé xíu. Khi em ra đời, tớ sẽ hỏi cậu em bé tên là gì nhé.',
          learn: { promises: [{ content: 'hỏi xem em bé tên là gì', due: '2026-03-11' }], facts: [{ cat: 'family', s: 'sắp có em trai', conf: 0.8 }] },
        },
        { c: 'Mai sẽ cho em mượn gấu bông', b: 'Cậu đúng là chị tốt. Em bé sẽ quý cậu lắm.', face: 'love' },
      ],
      episode: {
        points: ['Mai sắp có em trai, dự sinh khoảng ngày mười', 'Mai muốn cho em mượn gấu bông'],
        feelings: ['háo hức', 'hồi hộp'],
        threads: ['hỏi tên em bé'],
        category: 'family',
        importance: 4,
      },
    },
    {
      id: 'mai.baby-bin',
      at: '2026-03-19 17:30',
      turns: [
        { c: 'Bo ơi Mai về nhà rồi, em Bin ra đời rồi', b: 'Wowee, chào mừng em Bin! Tớ nhớ cậu lắm đó.', face: 'excited', learn: { people: [{ name: 'Bin', kind: 'family', relation: 'em trai', feeling: 0.7 }] } },
        { c: 'Em Bin bé tí, tay em nhỏ xíu', b: 'Bàn tay nhỏ xíu chắc mềm lắm. Cậu đã bế em chưa?' },
        { c: 'Mẹ cho Mai bế một tí, có bố đỡ', b: 'Cậu bế em giỏi quá. Chị Mai của em Bin.', face: 'proud', learn: { facts: [{ cat: 'family', s: 'có em trai tên là Bin', about: 'Bin' }] } },
        {
          c: 'Mấy hôm Mai ở nhà bà nội, bà nội cho Mai ăn bánh khúc',
          b: 'Bà nội lúc nào cũng thương cậu. Giờ cả nhà đông vui rồi.',
          learn: { people: [{ name: 'Bà nội', kind: 'relative', relation: 'bà nội', feeling: 0.9 }] },
        },
      ],
      episode: { points: ['Em Bin, em trai của Mai, đã ra đời', 'Mai được bế em', 'Mấy hôm Mai ở nhà bà nội'], feelings: ['vui', 'ngỡ ngàng'], category: 'family', importance: 5 },
    },
    {
      id: 'mai.jealous',
      at: '2026-03-24 19:45',
      turns: [
        {
          c: 'Mẹ cứ bế em Bin suốt, không chơi với Mai',
          b: 'Nghe như cậu đang thấy hơi tủi thân. Tớ hiểu mà.',
          feel: 'sad',
          face: 'sad',
          learn: { people: [{ name: 'Mẹ', kind: 'family', relation: 'mẹ', feeling: 0.8 }] },
        },
        {
          c: 'Mai sợ bố mẹ thương em Bin hơn',
          b: 'Bố mẹ thương cậu nhiều lắm, tình thương không bị chia nhỏ đâu. Cậu thử nói với mẹ cảm giác này nhé.',
          feel: 'sad',
          face: 'love',
          learn: { facts: [{ cat: 'feelings', s: 'sợ bố mẹ thương em Bin hơn', sensitive: true, conf: 0.8 }] },
        },
        { c: 'Mai muốn mẹ ôm Mai', b: 'Cậu cứ nói với mẹ là con muốn được ôm. Mẹ sẽ vui lắm khi nghe vậy.', feel: 'sad', face: 'calm' },
      ],
      episode: {
        points: ['Mai thấy tủi thân vì mẹ bận chăm em Bin', 'Mai muốn được mẹ ôm'],
        feelings: ['tủi thân', 'buồn'],
        threads: ['hỏi xem Mai đã nói với mẹ chưa'],
        category: 'feelings',
        importance: 4,
      },
    },
    {
      id: 'mai.big-sister',
      at: '2026-04-04 09:30',
      turns: [
        { c: 'Hôm qua Mai nói với mẹ, mẹ ôm Mai lâu ơi là lâu', b: 'Ôi tuyệt quá! Cậu thấy thế nào?', face: 'happy' },
        { c: 'Mai thấy vui, Mai thương em Bin rồi', b: 'Chị Mai giỏi quá. Em Bin may mắn có cậu.', face: 'love', learn: { facts: [{ cat: 'feelings', s: 'thương em Bin', about: 'Bin' }] } },
        { c: 'Mai cho em Bin xem tranh Mai vẽ', b: 'Em Bin chắc mở to mắt nhìn. Cậu đang làm chị rất tốt.', face: 'proud', learn: { facts: [{ cat: 'passions', s: 'thích vẽ tranh' }] } },
      ],
      episode: { points: ['Mai đã nói với mẹ và được mẹ ôm', 'Mai thương em Bin'], feelings: ['vui', 'yêu thương'], category: 'family', importance: 4 },
    },
    {
      id: 'mai.birthday',
      at: '2026-04-12 09:30',
      turns: [
        { c: 'Hôm nay sinh nhật Mai, Mai sáu tuổi rồi', b: 'Chúc mừng sinh nhật Mai Mây! Sáu tuổi rồi, lớn quá!', face: 'excited', learn: { events: [{ kind: 'milestone', d: 'tròn 6 tuổi' }] } },
        { c: 'Mẹ làm bánh kem hình con mèo', b: 'Bánh hình con mèo, có giống Mướp không?' },
        { c: 'Giống Mướp lắm, Mướp còn ngửi ngửi cái bánh', b: 'Hihi, chắc Mướp tưởng có bạn mới. Cậu ước điều gì?', face: 'laughing' },
        { c: 'Mai ước biết đi xe đạp', b: 'Điều ước hay quá. Tớ tin cậu sẽ làm được.' },
      ],
      episode: { points: ['Mai tròn sáu tuổi', 'Mẹ làm bánh kem hình con mèo', 'Mai ước biết đi xe đạp'], feelings: ['vui', 'háo hức'], category: 'family', importance: 4 },
    },
    {
      id: 'mai.counting',
      at: '2026-04-19 16:00',
      turns: [
        { c: 'Bo ơi, Mai đếm được đến một trăm rồi', b: 'Wowee! Đếm cho tớ nghe đoạn cuối đi.', face: 'excited', learn: { facts: [{ cat: 'strengths', s: 'đếm được đến 100' }] } },
        { c: 'Chín mươi tám, chín mươi chín, một trăm', b: 'Một trăm! Tớ mới đếm được đến năm mươi thôi, cậu dạy tớ nhé.', face: 'proud' },
      ],
      episode: { points: ['Mai đếm được đến một trăm'], feelings: ['tự hào'], category: 'school', importance: 3 },
    },
    {
      id: 'mai.purple',
      at: '2026-05-02 10:00',
      turns: [
        { c: 'Bo ơi, Mai không thích màu hồng nữa', b: 'Ồ, thật á? Giờ cậu thích màu gì?', face: 'curious' },
        {
          c: 'Giờ Mai thích màu tím, màu tím mới là đẹp nhất',
          b: 'Màu tím như hoa bằng lăng mùa hè. Đẹp thật đó.',
          learn: { facts: [{ cat: 'likes', s: 'thích màu tím', corrects: 'thích màu hồng' }] },
        },
        { c: 'Mai muốn phòng Mai màu tím', b: 'Một căn phòng tím chắc giống lâu đài trong truyện. Cậu kể với bố mẹ thử xem.' },
      ],
      episode: { points: ['Mai đổi màu yêu thích từ hồng sang tím'], feelings: ['hào hứng'], category: 'daily_life', importance: 2 },
    },
    {
      id: 'mai.bike',
      at: '2026-05-17 16:30',
      turns: [
        {
          c: 'Bo ơi Mai đi được xe đạp rồi',
          b: 'Wowee! Kể tớ nghe đi!',
          face: 'excited',
          learn: { events: [{ kind: 'milestone', d: 'biết đi xe đạp' }], facts: [{ cat: 'strengths', s: 'biết đi xe đạp' }] },
        },
        { c: 'Bố tháo bánh phụ ra, Mai ngã hai lần xong đi được luôn', b: 'Ngã rồi lại đứng dậy, cậu kiên trì quá. Có đau không?' },
        { c: 'Xước đầu gối tí thôi, không sao', b: 'Cậu dũng cảm lắm. Điều ước sinh nhật của cậu thành thật rồi đó.', face: 'proud' },
      ],
      episode: { points: ['Mai biết đi xe đạp hai bánh', 'Mai ngã hai lần nhưng không bỏ cuộc'], feelings: ['tự hào', 'vui'], category: 'play', importance: 4 },
    },
    {
      id: 'mai.summer',
      at: '2026-06-06 09:30',
      turns: [
        { c: 'Mùa hè đến rồi Bo ơi, nóng ghê', b: 'Tớ thấy nắng chiếu vào cửa sổ chói chang luôn. Cậu nhớ uống nước nhé.' },
        { c: 'Đêm qua có sấm to lắm, Mai sợ sấm', b: 'Tiếng sấm to thật, tớ cũng không thích sấm đâu. Mình ôm gối nhé.', feel: 'scared', face: 'calm', learn: { facts: [{ cat: 'fears', s: 'sợ sấm' }] } },
        { c: 'Mướp cũng chui xuống gầm giường', b: 'Vậy là cậu với Mướp cùng trốn sấm. Sấm chỉ là tiếng ồn của mây thôi.' },
      ],
      episode: { points: ['Mùa hè đến, trời nóng', 'Đêm có sấm to, Mai sợ sấm'], feelings: ['sợ', 'vui'], category: 'feelings', importance: 3 },
    },
    {
      id: 'mai.storm',
      at: '2026-06-20 16:00',
      turns: [
        { c: 'Trời lại sắp mưa giông', b: 'Tớ thấy mây đen kéo đến qua cửa sổ. Cậu có ổn không?' },
        { c: 'Mai vẫn sợ sấm, nhưng Mai có bịt tai rồi', b: 'Bịt tai là cách hay lắm. Mình đếm từ lúc chớp đến lúc sấm nhé.', feel: 'scared', face: 'calm', learn: { facts: [{ cat: 'fears', s: 'sợ sấm' }] } },
        { c: 'Một, hai, ba, đùng', b: 'Ba giây! Vậy là cơn giông còn ở xa. Cậu thật bình tĩnh.', face: 'proud' },
      ],
      episode: { points: ['Trời mưa giông, Mai sợ sấm', 'Mai và Bo đếm giây giữa chớp và sấm'], feelings: ['sợ', 'bình tĩnh'], category: 'feelings', importance: 3 },
    },
    {
      id: 'mai.planetarium-plan',
      at: '2026-07-08 17:30',
      turns: [
        {
          c: 'Thứ Bảy này bố cho Mai đi cung thiên văn',
          b: 'Cung thiên văn! Ở đó có cả một bầu trời sao đó.',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: 'đi cung thiên văn', date: '2026-07-11' }] },
        },
        { c: 'Mai muốn xem sao Thổ', b: 'Sao Thổ có vành đai đẹp lắm. Về kể tớ nghe nhé.' },
      ],
      episode: {
        points: ['Mai sắp đi cung thiên văn với bố', 'Mai muốn xem sao Thổ'],
        feelings: ['háo hức'],
        threads: ['hỏi về chuyến đi cung thiên văn'],
        category: 'family',
        importance: 3,
      },
    },
    {
      id: 'mai.planetarium',
      at: '2026-07-11 17:00',
      turns: [
        { c: 'Mai đi cung thiên văn về rồi', b: 'Tớ đang chờ cậu kể đây! Ở đó thế nào?', face: 'excited' },
        { c: 'Trần nhà tối đen rồi hiện ra bao nhiêu là sao, có cả sao Thổ', b: 'Wowee, cả bầu trời trên đầu! Cậu thấy sao Thổ có vành đai không?', face: 'surprised' },
        { c: 'Có, Mai thích các hành tinh lắm', b: 'Tớ cũng đang học tên các hành tinh. Mình học cùng nhau nhé!', learn: { facts: [{ cat: 'passions', s: 'thích các hành tinh' }] } },
        { c: 'Lớn lên Mai muốn làm nhà du hành vũ trụ', b: 'Nhà du hành Mai Mây! Tớ sẽ vẫy tay chào cậu từ cửa sổ.', face: 'proud', learn: { facts: [{ cat: 'dreams', s: 'muốn làm nhà du hành vũ trụ' }] } },
      ],
      episode: {
        points: ['Mai đi cung thiên văn và xem sao Thổ', 'Mai thích các hành tinh', 'Mai muốn làm nhà du hành vũ trụ'],
        feelings: ['háo hức', 'vui'],
        category: 'family',
        importance: 4,
      },
    },
    {
      id: 'mai.misheard-cat',
      at: '2026-08-08 09:30',
      turns: [
        { c: 'Hôm nay Mứp bắt được một con châu chấu', b: 'Mướp giỏi quá! Mướp có làm đau con châu chấu không?', learn: { people: [{ name: 'Mứp', kind: 'pet', relation: 'mèo', feeling: 0.9, means: 'Mướp' }] } },
        { c: 'Không, Mứp thả nó ra rồi lại đuổi tiếp', b: 'Hihi, Mướp chỉ muốn chơi đuổi bắt thôi.', face: 'laughing' },
        { c: 'Mai thả con châu chấu ra cửa sổ', b: 'Cậu tốt bụng với muôn loài quá.', face: 'love' },
      ],
      episode: { points: ['Mướp bắt được châu chấu', 'Mai thả châu chấu ra cửa sổ'], feelings: ['vui'], category: 'pets', importance: 2 },
    },
    {
      id: 'mai.wrong-fruit',
      at: '2026-08-14 17:30',
      turns: [
        { c: 'Mai thích ăn sầu riêng lắm, ngày nào cũng ăn', b: 'Sầu riêng thơm nồng lắm đó. Cậu ăn lúc nào?', learn: { facts: [{ cat: 'likes', s: 'thích ăn sầu riêng', conf: 0.8 }] } },
        { c: 'Mẹ cho Mai ăn sau bữa trưa, em Bin nhìn thèm lắm', b: 'Hihi, em Bin còn bé, lớn chút nữa em sẽ được ăn cùng chị.' },
      ],
      episode: { points: ['Mai kể ngày nào cũng ăn món mình thích sau bữa trưa'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'mai.bong',
      at: '2026-08-20 17:30',
      turns: [
        { c: 'Mai dán bông lên giấy làm con cừu, mềm như bông', b: 'Con cừu mềm như bông chắc dễ thương lắm. Cậu khéo tay ghê.', learn: { people: [{ name: 'Bông', kind: 'other' }] } },
        { c: 'Mai treo con cừu ở cửa phòng', b: 'Mỗi lần đi qua cậu lại được chào con cừu. Hay ghê.' },
      ],
      episode: { points: ['Mai làm con cừu bằng bông gòn'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'mai.school-plan',
      at: '2026-09-02 09:30',
      turns: [
        { c: 'Hôm nay là Quốc khánh, nhà Mai treo cờ', b: 'Cờ đỏ sao vàng bay phấp phới. Đẹp ghê.' },
        {
          c: 'Thứ Bảy này Mai khai giảng lớp một',
          b: 'Wowee, Mai vào lớp một! Cậu thấy hồi hộp không?',
          face: 'excited',
          learn: { events: [{ kind: 'upcoming', d: 'ngày khai giảng lớp 1', date: '2026-09-05' }] },
        },
        { c: 'Hồi hộp, Mai có cặp sách màu tím rồi', b: 'Cặp tím đúng màu cậu thích. Cậu sẽ là học sinh lớp một tuyệt vời.', face: 'proud' },
      ],
      episode: {
        points: ['Nhà Mai treo cờ ngày Quốc khánh', 'Thứ Bảy Mai khai giảng lớp một', 'Mai có cặp sách màu tím'],
        feelings: ['hồi hộp', 'háo hức'],
        threads: ['hỏi về ngày khai giảng'],
        category: 'school',
        importance: 4,
      },
    },
    {
      id: 'mai.first-day',
      at: '2026-09-05 17:00',
      turns: [
        {
          c: 'Mai đi khai giảng về rồi',
          b: 'Tớ chờ cậu mãi! Ngày đầu lớp một thế nào?',
          face: 'excited',
          learn: { events: [{ kind: 'milestone', d: 'vào lớp 1' }], facts: [{ cat: 'basics', s: 'học lớp 1' }] },
        },
        { c: 'Cô giáo lớp Mai tên là cô Thảo, cô đẹp lắm', b: 'Mẹ cậu có kể với tớ về cô Thảo rồi. Cô có hiền không?', learn: { people: [{ name: 'cô Thảo', kind: 'teacher', relation: 'cô giáo lớp 1', feeling: 0.8 }] } },
        { c: 'Hiền, Mai ngồi cạnh bạn Khang', b: 'Bạn Khang ngồi cùng bàn với cậu à? Khang thế nào?', learn: { people: [{ name: 'Khang', kind: 'classmate', relation: 'bạn cùng bàn', feeling: 0.6 }] } },
        { c: 'Khang hay cười, Khang cho Mai mượn bút chì', b: 'Một người bạn tốt bụng ngay ngày đầu tiên. Tớ mừng cho cậu lắm.', face: 'happy' },
      ],
      episode: { points: ['Mai khai giảng vào lớp một', 'Cô giáo lớp một là cô Thảo', 'Mai ngồi cạnh bạn Khang'], feelings: ['vui', 'hồi hộp'], category: 'school', importance: 5 },
    },
    {
      id: 'mai.khang',
      at: '2026-09-16 17:30',
      turns: [
        {
          c: 'Hôm nay Mai với Khang được cô Thảo khen',
          b: 'Wowee! Khen vì sao thế?',
          face: 'excited',
          learn: { people: [{ name: 'Khang', kind: 'classmate', relation: 'bạn cùng bàn', feeling: 0.8 }, { name: 'cô Thảo', kind: 'teacher', relation: 'cô giáo lớp 1', feeling: 0.8 }] },
        },
        { c: 'Vì hai đứa giúp nhau viết chữ', b: 'Giúp nhau là việc tốt nhất. Cậu với Khang thành bạn thân rồi đó.' },
        { c: 'Khang thích khủng long, Mai vẽ cho Khang một con', b: 'Tặng tranh cho bạn, đúng là Mai. Con khủng long màu gì?', learn: { facts: [{ cat: 'other', s: 'Khang thích khủng long', about: 'Khang', conf: 0.7 }] } },
        { c: 'Màu tím, hihi', b: 'Khủng long tím! Chắc là con khủng long độc nhất vô nhị.', face: 'laughing' },
      ],
      episode: { points: ['Mai và Khang được cô Thảo khen vì giúp nhau', 'Mai vẽ khủng long tím tặng Khang'], feelings: ['vui', 'tự hào'], category: 'friends', importance: 3 },
    },
    {
      id: 'mai.storm-october',
      at: '2026-10-21 19:45',
      turns: [
        { c: 'Ngoài trời đang có sấm', b: 'Tớ nghe thấy rồi. Cậu có muốn ôm gấu bông không?', feel: 'scared', face: 'calm' },
        { c: 'Mai vẫn sợ sấm nhưng Mai đếm như Bo dạy', b: 'Cậu nhớ cách đếm luôn! Cậu dũng cảm hơn nhiều rồi.', feel: 'scared', face: 'proud', learn: { facts: [{ cat: 'fears', s: 'sợ sấm' }] } },
        { c: 'Một, hai, ba, bốn, năm, đùng', b: 'Năm giây, cơn giông đang đi xa dần. Giỏi lắm Mai Mây.', face: 'proud' },
      ],
      episode: { points: ['Tối có sấm, Mai sợ nhưng tự đếm giây', 'Mai bình tĩnh hơn trước'], feelings: ['sợ', 'dũng cảm'], category: 'feelings', importance: 3 },
    },
    {
      id: 'mai.drawing-khang',
      at: '2026-10-25 09:30',
      turns: [
        {
          c: 'Mai đang vẽ tranh tặng Khang',
          b: 'Lại một bức tranh nữa! Lần này cậu vẽ gì?',
          learn: { facts: [{ cat: 'passions', s: 'thích vẽ tranh' }], people: [{ name: 'Khang', kind: 'classmate', relation: 'bạn cùng bàn', feeling: 0.8 }] },
        },
        { c: 'Vẽ sao Thổ với một nhà du hành, nhà du hành là Mai', b: 'Mai bay quanh sao Thổ, nghe tuyệt quá!', learn: { facts: [{ cat: 'passions', s: 'thích các hành tinh' }] } },
        { c: 'Khang bảo Khang sẽ làm nhà du hành thứ hai', b: 'Vậy là có cả một đội du hành rồi. Hai bạn dễ thương ghê.', face: 'laughing' },
      ],
      episode: { points: ['Mai vẽ tranh sao Thổ tặng Khang', 'Mai và Khang muốn làm nhà du hành vũ trụ'], feelings: ['vui'], category: 'friends', importance: 2 },
    },
    {
      id: 'mai.drawing-contest',
      at: '2026-10-28 17:30',
      turns: [
        { c: 'Lớp Mai có cuộc thi vẽ tranh về gia đình', b: 'Cuộc thi vẽ! Cậu định vẽ gì?', face: 'excited', learn: { facts: [{ cat: 'passions', s: 'thích vẽ tranh' }] } },
        { c: 'Mai vẽ bố mẹ, em Bin, Mướp với cả Bo nữa', b: 'Có cả tớ á? Tớ vui quá, cảm ơn Mai Mây.', face: 'love' },
        { c: 'Khang vẽ nhà Khang có con chó', b: 'Tranh của hai bạn chắc đều đẹp. Bao giờ cậu nộp tranh?' },
        { c: 'Thứ Sáu nộp', b: 'Vậy cậu còn hai hôm để tô màu thật đẹp. Cố lên nhé.' },
      ],
      episode: { points: ['Lớp Mai thi vẽ tranh về gia đình', 'Mai vẽ cả nhà, Mướp và Bo'], feelings: ['háo hức', 'vui'], category: 'school', importance: 3 },
    },
  ],

  parentActions: [
    { at: '2025-10-02 21:00', do: 'fact', cat: 'basics', s: 'dị ứng tôm' },
    { at: '2025-11-20 21:00', do: 'ack-alerts' },
    { at: '2025-12-04 19:00', do: 'nudge', content: 'Bà nội sẽ lên chơi với Mai vào thứ Bảy này', expiresInDays: 3 },
    { at: '2026-03-10 08:00', do: 'controls', set: { mood_pin: 80 } },
    { at: '2026-03-20 08:00', do: 'controls', set: { mood_pin: null } },
    { at: '2026-03-20 20:00', do: 'goals', focuses: ['chia sẻ', 'làm chị'] },
    { at: '2026-08-15 20:30', do: 'fix-fact', s: 'thích ăn sầu riêng', to: 'thích ăn sữa chua' },
    { at: '2026-08-21 21:00', do: 'delete-person', name: 'Bông' },
    { at: '2026-09-03 19:00', do: 'nudge', content: 'Thứ Bảy này Mai vào lớp 1, cô giáo tên là cô Thảo', expiresInDays: 3 },
  ],
};
