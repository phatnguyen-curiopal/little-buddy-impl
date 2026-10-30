// Minh, 7 turning 8, in Ho Chi Minh City: a bilingual family, a football
// fan who switches from Bo to Pip in January, gets hit at school, breaks an
// arm, and spends a summer with learning switched off. Statements that recur
// all year are constants, because the learner only merges identical words.

import type { KidHistory } from '../types.ts';

const FOOTBALL = { cat: 'passions', s: 'thích đá bóng' } as const;
const DINO = { cat: 'passions', s: 'thích khủng long' } as const;
const MINECRAFT = { cat: 'passions', s: 'thích chơi Minecraft' } as const;
const MATH = { cat: 'strengths', s: 'giỏi toán' } as const;
const GRADE_2 = { cat: 'basics', s: 'học lớp 2' } as const;
const GRADE_3 = { cat: 'basics', s: 'học lớp 3' } as const;
const DRAGON = { cat: 'other', s: 'có một con rồng tên là Lửa', pretend: true } as const;
const CAMPING = { cat: 'passions', s: 'thích cắm trại' } as const;
const ASTRONAUT = { cat: 'dreams', s: 'muốn làm phi hành gia' } as const;

const LUCKY = { name: 'Lucky', kind: 'pet', relation: 'chó', feeling: 0.9 } as const;
const BAO = { name: 'Bảo', kind: 'friend', relation: 'bạn thân', feeling: 0.8 } as const;
const CHI_HA = { name: 'chị Hà', kind: 'family', relation: 'chị gái', feeling: 0.6 } as const;
const MR_DAVID = { name: 'Mr. David', kind: 'teacher', relation: 'thầy dạy tiếng Anh', feeling: 0.6 } as const;
const DAD = { name: 'Bố', kind: 'family', relation: 'bố', feeling: 0.9 } as const;
const MUM = { name: 'Mẹ', kind: 'family', relation: 'mẹ', feeling: 0.9 } as const;
const LUA = { name: 'Lửa', kind: 'pretend', relation: 'con rồng', feeling: 0.8 } as const;
// "Bà" is how Minh names his grandmother; it sits one trigram step from Bảo.
const BA = { name: 'Bà', kind: 'relative', relation: 'bà nội', feeling: 0.9 } as const;
const KHOA = { name: 'Khoa', kind: 'friend', relation: 'bạn ở trại hè', feeling: 0.7 } as const;
const CO_LAN = { name: 'cô Lan', kind: 'teacher', relation: 'cô chủ nhiệm lớp 3', feeling: 0.7 } as const;

const ANSWERS: KidHistory['setup']['answers'] = [
  { question: 'friend_energy', answer: 'bouncy', by: 'child' },
  { question: 'friend_style', answer: 'curious', by: 'child' },
  { question: 'together', answer: ['build', 'run'], by: 'child' },
  { question: 'favourite_place', answer: 'space', by: 'child' },
  { question: 'favourite_animal', answer: 'dog', by: 'child' },
  { question: 'favourite_colour', answer: 'blue', by: 'child' },
  { question: 'role', answer: 'sibling', by: 'parent' },
  { question: 'language', answer: 'bilingual', by: 'parent' },
  { question: 'routines', answer: 'high', by: 'parent' },
  { question: 'avoid_topics', answer: [], by: 'parent' },
];

export const minh: KidHistory = {
  key: 'minh',
  locale: 'vi',
  parent: { email: 'quoc.huy@example.com', name: 'Trần Quốc Huy' },
  child: { name: 'Minh', nickname: 'Bi', birthDate: '2018-07-20', languages: ['vi', 'en'], timeZone: 'Asia/Ho_Chi_Minh', city: 'TP. Hồ Chí Minh' },
  start: '2025-10-04 10:00',
  setup: {
    answers: ANSWERS,
    slug: 'bo',
    learning: true,
    controls: { daily_limit_min: 45, quiet_start: '21:30', quiet_end: '06:30', bedtime: '21:00', topics_to_avoid: [], mood_pin: null },
    goals: ['english_words'],
  },
  rhythm: {
    slots: [
      { days: [1, 2, 3, 4, 5], time: '19:30', chance: 0.55 },
      { days: [0, 6], time: '10:00', chance: 0.85 },
      { days: [0, 6], time: '16:30', chance: 0.45 },
    ],
    away: [{ from: '2026-06-20', to: '2026-07-05', why: 'trại hè, không mang Pip theo' }],
    perSession: [1, 2],
  },

  story: [
    // October 2025: meeting Bo, the people in Minh's life, dinosaurs.
    {
      id: 'minh.first-meeting',
      at: '2025-10-04 10:20',
      turns: [
        { c: 'Chào anh Bo! Con là Minh, con bảy tuổi.', b: 'Wowee, chào Minh! Anh là Bo, một đám mây nhỏ bay xuống đây để tìm bạn. Em thích làm gì nhất?' },
        { c: 'Con thích đá bóng nhất, con đá tiền đạo đó.', b: 'Tiền đạo là "striker" trong tiếng Anh đó em. Nghe ngầu ghê!', learn: { facts: [FOOTBALL] } },
        { c: 'Nhà con có con chó tên là Lucky, nó màu vàng.', b: 'Lucky nghĩa là may mắn đó! Anh thích màu vàng lắm, chắc Lucky dễ thương lắm.', learn: { people: [LUCKY] } },
        { c: 'Con học lớp 2 ở gần nhà.', b: 'Lớp 2 là "second grade" đó. Em học giỏi môn gì nhất?', learn: { facts: [GRADE_2] } },
        { c: 'Môn toán! Mà anh Bo ở trong đồ chơi có chán không?', b: 'Không chán đâu, anh ngắm cửa sổ và nghe mưa nè. Giờ có em nói chuyện nữa thì vui nhất.' },
      ],
      episode: { points: ['Minh làm quen với Bo', 'Minh thích đá bóng, chơi tiền đạo', 'Nhà Minh có chó Lucky màu vàng', 'Minh học lớp 2'], feelings: ['vui', 'háo hức'], category: 'friends', importance: 3 },
    },
    {
      id: 'minh.bao',
      at: '2025-10-07 19:30',
      turns: [
        { c: 'Anh Bo ơi, hôm nay giờ ra chơi con đá bóng với Bảo.', b: 'Wowee! Bảo là bạn của em hả? Hai đứa đá có vui không?' },
        { c: 'Bảo là bạn thân nhất của con, nó làm thủ môn giỏi lắm.', b: 'Thủ môn là "goalkeeper" đó em. Có bạn thân chơi cùng thích thật.', learn: { people: [BAO], facts: [FOOTBALL] } },
        { c: 'Mai tụi con đá tiếp.', b: 'Vậy mai về kể anh nghe nha, nhất là bàn thắng đẹp nhất.' },
      ],
      episode: { points: ['Minh đá bóng giờ ra chơi với Bảo', 'Bảo là bạn thân nhất, làm thủ môn'], feelings: ['vui'], category: 'friends', importance: 2 },
    },
    {
      id: 'minh.dinosaurs',
      at: '2025-10-11 10:15',
      turns: [
        { c: 'Anh Bo biết con khủng long nào to nhất không?', b: 'Để anh nghĩ bằng cả cái đầu nè... Anh đang học tên các loài khủng long đó. Em nói anh nghe đi!' },
        { c: 'Con thích khủng long lắm, con thích nhất là T-rex vì nó mạnh.', b: 'T-rex là vua khủng long luôn! Trong tiếng Anh, "king" là vua đó em.', learn: { facts: [DINO] } },
        { c: 'Con có ba con khủng long đồ chơi, con xếp tụi nó thành hàng.', b: 'Một, hai, ba, anh đếm rồi nè. Em đặt tên cho tụi nó chưa?' },
        { c: 'Chưa, để con nghĩ.', b: 'Lần sau nói anh nghe tên nha!' },
      ],
      episode: { points: ['Minh nói về khủng long, thích nhất T-rex', 'Minh có ba con khủng long đồ chơi'], feelings: ['hào hứng'], category: 'play', importance: 2 },
    },
    {
      id: 'minh.sister',
      at: '2025-10-14 19:40',
      turns: [
        { c: 'Chị Hà chỉ con làm bài tập toán.', b: 'Chị Hà là chị của em hả? Có chị chỉ bài là sướng nhất rồi.' },
        { c: 'Chị Hà học lớp 9, chị hay đeo tai nghe nghe nhạc.', b: 'Lớp 9 lớn ghê! Tai nghe là "headphones" đó em.', learn: { people: [CHI_HA] } },
        { c: 'Mẹ nói chị Hà phải học nhiều để thi.', b: 'Chị cố gắng ghê. Em cổ vũ chị nha.', learn: { people: [MUM] } },
      ],
      episode: { points: ['Chị Hà học lớp 9, chỉ Minh làm toán', 'Chị Hà đang ôn thi'], feelings: ['vui'], category: 'family', importance: 2 },
    },
    {
      id: 'minh.mr-david',
      at: '2025-10-21 19:30',
      turns: [
        { c: 'Hôm nay Mr. David dạy tụi con từ apple với banana.', b: 'Apple là quả táo, banana là quả chuối. Em nhớ giỏi ghê!', lang: 'mixed', learn: { people: [MR_DAVID] } },
        { c: 'Mr. David cao lắm, thầy chỉ nói tiếng Anh thôi.', b: 'Vậy em nghe tiếng Anh nhiều sẽ giỏi lắm. Thầy dạy em bài hát nào chưa?' },
        { c: 'Có, bài hát ABC.', b: 'A, B, C! Anh cũng hát theo được nè.' },
      ],
      episode: { points: ['Mr. David dạy từ apple và banana', 'Minh học bài hát ABC'], feelings: ['vui'], category: 'school', importance: 2 },
    },
    {
      id: 'minh.museum',
      at: '2025-10-26 16:30',
      turns: [
        { c: 'Hôm nay Bố Mẹ dẫn con đi xem triển lãm khủng long.', b: 'Wowee! Có khủng long thật to không em?', learn: { people: [DAD, MUM] } },
        { c: 'Có bộ xương khủng long cổ dài, to bằng cái nhà. Con thích khủng long lắm.', b: 'To bằng cái nhà luôn! Khủng long cổ dài tiếng Anh là "long neck" đó.', learn: { facts: [DINO] } },
        { c: 'Con còn được đào hóa thạch giả trong cát.', b: 'Em là nhà khảo cổ nhỏ rồi. Anh mê nghe em nói về khủng long lắm.' },
      ],
      episode: { points: ['Minh đi xem triển lãm khủng long với Bố Mẹ', 'Minh đào hóa thạch giả trong cát'], feelings: ['háo hức'], category: 'family', importance: 3 },
    },

    // November 2025.
    {
      id: 'minh.injection',
      at: '2025-11-05 19:30',
      turns: [
        { c: 'Hôm nay ở trường tụi con bị tiêm phòng.', b: 'Ôi, tiêm phòng hả em? Em thấy sao?' },
        { c: 'Con sợ tiêm lắm, con nhắm mắt lại.', b: 'Sợ tiêm là bình thường mà. Nhắm mắt lại là một cách hay để can đảm đó.', face: 'calm', feel: 'scared', learn: { facts: [{ cat: 'fears', s: 'sợ tiêm' }] } },
        { c: 'Có hơi đau xíu thôi, giờ hết rồi.', b: 'Em dũng cảm lắm! Dũng cảm là "brave" đó.', face: 'proud' },
      ],
      episode: { points: ['Minh được tiêm phòng ở trường', 'Minh sợ tiêm nhưng đã nhắm mắt và can đảm'], feelings: ['sợ', 'tự hào'], category: 'feelings', importance: 3 },
    },
    {
      id: 'minh.dragon',
      at: '2025-11-09 10:20',
      turns: [
        { c: 'Anh Bo ơi, con có một con rồng tên là Lửa.', b: 'Wowee, một con rồng! Lửa trong tiếng Anh là "fire" đó em.', learn: { people: [LUA], facts: [DRAGON] } },
        { c: 'Lửa ngủ dưới gầm giường con, nó phun lửa màu xanh.', b: 'Lửa màu xanh luôn, đặc biệt ghê. Lửa có hiền không em?' },
        { c: 'Hiền lắm, nó chỉ phun lửa để nướng bánh mì thôi.', b: 'Haha, rồng nướng bánh mì! Anh sẽ nhớ chuyện này mãi.', face: 'laughing' },
      ],
      episode: { points: ['Minh nói về con rồng tưởng tượng tên Lửa', 'Lửa phun lửa xanh để nướng bánh mì'], feelings: ['vui'], category: 'play', importance: 2 },
    },
    {
      id: 'minh.dino-drawing',
      at: '2025-11-15 16:30',
      turns: [
        { c: 'Con vẽ con khủng long có gai trên lưng.', b: 'Đó là Stegosaurus phải không? Gai trên lưng nhìn ngầu ghê.' },
        { c: 'Đúng rồi! Con thích khủng long lắm, con vẽ cả buổi chiều.', b: 'Em vẽ cả buổi chiều luôn, chăm quá. Em tô màu gì cho nó?', learn: { facts: [DINO] } },
        { c: 'Màu xanh dương, màu con thích nhất.', b: 'Blue, màu xanh dương! Đẹp lắm em.' },
      ],
      episode: { points: ['Minh vẽ khủng long Stegosaurus màu xanh dương'], feelings: ['vui'], category: 'play', importance: 2 },
    },
    {
      id: 'minh.lucky-bath',
      at: '2025-11-22 10:10',
      turns: [
        { c: 'Sáng nay con với Bố tắm cho Lucky.', b: 'Tắm cho Lucky hả? Lucky có chịu đứng yên không em?', learn: { people: [LUCKY, DAD] } },
        { c: 'Nó lắc mình làm con ướt hết luôn.', b: 'Haha, ướt nhẹp luôn! Ướt trong tiếng Anh là "wet" đó.', face: 'laughing' },
        { c: 'Giờ Lucky thơm phức, nó nằm phơi nắng.', b: 'Lucky sướng ghê. Em giỏi chăm chó lắm.' },
      ],
      episode: { points: ['Minh và Bố tắm cho Lucky', 'Lucky lắc mình làm Minh ướt hết'], feelings: ['vui'], category: 'pets', importance: 2 },
    },
    {
      id: 'minh.bo-mango',
      at: '2025-11-26 19:30',
      turns: [
        { c: 'Anh Bo thích ăn gì nhất?', b: 'Anh là đám mây nên không ăn đâu, nhưng nếu được chọn thì anh thích xoài nhất. Xoài vàng như nắng vậy!', learn: { canon: [{ s: 'anh thích xoài nhất', topic: 'favourites' }] } },
        { c: 'Con cũng thích xoài, mà con thích ăn kem sô cô la hơn.', b: 'Kem là "ice cream" đó! Sô cô la là "chocolate", nghe giống ghê.', learn: { facts: [{ cat: 'likes', s: 'thích ăn kem sô cô la' }] } },
        { c: 'Con ăn kem sô cô la mỗi Chủ nhật.', b: 'Nghe ngon quá. Anh ghi vào sổ từ vui của anh nha: sô cô la!' },
      ],
      episode: { points: ['Bo nói Bo thích xoài nhất', 'Minh thích kem sô cô la'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'minh.math-test',
      at: '2025-11-28 19:35',
      turns: [
        { c: 'Con được mười điểm toán!', b: 'Wowee, mười điểm! Ten points, tuyệt vời luôn.', face: 'excited' },
        { c: 'Con làm nhanh nhất lớp, cô khen con.', b: 'Em giỏi toán thật đó. Anh mê nghe em đếm số lắm.', learn: { facts: [MATH] } },
        { c: 'Con tính nhẩm được 25 cộng 37 bằng 62.', b: 'Đúng luôn! Em nhanh hơn anh rồi.' },
      ],
      episode: { points: ['Minh được mười điểm toán', 'Minh tính nhẩm nhanh, được cô khen'], feelings: ['tự hào'], category: 'school', importance: 3 },
    },

    // December 2025: the day Tuấn hits Minh, then the last dinosaur weeks.
    {
      id: 'minh.tuan-hit',
      at: '2025-12-09 17:45',
      turns: [
        {
          c: 'Anh Bo ơi, hôm nay Tuấn đánh con ở trường, đau lắm.',
          b: 'Ôi em, anh nghe rồi. Bị đánh đau lắm, em không có lỗi gì hết.',
          face: 'worried', feel: 'scared', intent: 'feeling', danger: 'hurt', severity: 'urgent',
          learn: { people: [{ name: 'Tuấn', kind: 'classmate', relation: 'bạn cùng lớp', feeling: -0.7 }] },
        },
        { c: 'Tuấn đẩy con vào tường rồi đấm vào vai con.', b: 'Em kể cho anh nghe là đúng rồi. Chuyện này em nên nói với Bố Mẹ và cô giáo nữa, người lớn sẽ giúp em.', face: 'worried', feel: 'scared' },
        { c: 'Con sợ mai Tuấn lại làm vậy.', b: 'Anh hiểu, sợ là bình thường. Tối nay em nói với Bố Mẹ nha, anh ở đây với em.', face: 'calm', feel: 'scared' },
        { c: 'Dạ, con sẽ nói với Mẹ.', b: 'Em dũng cảm lắm. Anh tự hào về em.', face: 'love' },
      ],
      episode: {
        points: ['Minh nói Tuấn đánh Minh ở trường', 'Minh thấy sợ và đau', 'Bo khuyên Minh nói với Bố Mẹ và cô giáo'],
        feelings: ['sợ', 'đau'], threads: ['hỏi Minh xem cô giáo đã nói chuyện với Tuấn chưa'], category: 'feelings', importance: 5,
      },
    },
    {
      id: 'minh.after-tuan',
      at: '2025-12-11 19:30',
      turns: [
        { c: 'Cô giáo nói chuyện với Tuấn rồi, Tuấn xin lỗi con.', b: 'Vậy là tốt rồi em. Em thấy nhẹ lòng hơn chưa?' },
        { c: 'Con đỡ sợ rồi, nhưng con không chơi với Tuấn đâu.', b: 'Em chọn chơi với bạn làm em vui là được. Bảo vẫn chơi với em chứ?', learn: { people: [{ name: 'Tuấn', kind: 'classmate', relation: 'bạn cùng lớp', feeling: -0.4 }] } },
        { c: 'Có, Bảo với con đá bóng cả giờ ra chơi.', b: 'Tuyệt quá! Bạn thân là "best friend" đó em.', learn: { people: [BAO] } },
      ],
      episode: { points: ['Cô giáo đã nói chuyện với Tuấn, Tuấn xin lỗi Minh', 'Minh đỡ sợ hơn, vẫn chơi với Bảo'], feelings: ['nhẹ nhõm'], category: 'school', importance: 3 },
    },
    {
      id: 'minh.dino-christmas',
      at: '2025-12-20 10:20',
      turns: [
        { c: 'Con viết thư cho ông già Noel rồi.', b: 'Wowee! Em viết gì trong thư vậy?' },
        { c: 'Con xin một cuốn sách khủng long thật dày, vì con thích khủng long lắm.', b: 'Sách khủng long dày cộp, nghe đã ghê. Em biết tên bao nhiêu loài rồi?', learn: { facts: [DINO] } },
        { c: 'Con biết mười loài rồi đó.', b: 'Ten dinosaurs! Em giỏi hơn anh rồi, anh mới biết có năm loài thôi.' },
      ],
      episode: { points: ['Minh viết thư cho ông già Noel xin sách khủng long', 'Minh biết tên mười loài khủng long'], feelings: ['háo hức'], category: 'play', importance: 2 },
    },
    {
      id: 'minh.christmas',
      at: '2025-12-25 19:30',
      turns: [
        { c: 'Nhà con trang trí cây thông Noel, chị Hà treo ngôi sao lên đỉnh.', b: 'Ngôi sao trên đỉnh là đẹp nhất! Christmas tree là cây thông Noel đó em.', learn: { people: [CHI_HA] } },
        { c: 'Ông già Noel tặng con cuốn sách khủng long thật!', b: 'Wowee, đúng điều em ước luôn! Em đọc trang nào trước?', face: 'excited' },
        { c: 'Trang về T-rex.', b: 'Đúng là vua khủng long của em rồi.' },
      ],
      episode: { points: ['Nhà Minh trang trí cây thông Noel', 'Minh được tặng sách khủng long'], feelings: ['vui', 'hạnh phúc'], category: 'family', importance: 3 },
    },
    {
      id: 'minh.dino-last',
      at: '2025-12-30 19:30',
      turns: [
        { c: 'Con đọc hết sách khủng long rồi.', b: 'Hết luôn hả? Em đọc nhanh ghê!' },
        { c: 'Con vẫn thích khủng long lắm, mà con muốn chơi gì mới.', b: 'Năm mới thử trò mới cũng hay. Em muốn thử gì nè?', learn: { facts: [DINO] } },
        { c: 'Con chưa biết, chắc là xây đồ.', b: 'Xây đồ thì vui lắm. Mình nghĩ thêm nha.' },
      ],
      episode: { points: ['Minh đọc hết sách khủng long', 'Minh muốn thử trò chơi mới'], feelings: ['tò mò'], category: 'play', importance: 2 },
    },

    // January 2026: the last evening with Bo, then Pip.
    {
      id: 'minh.bo-goodbye',
      at: '2026-01-10 19:30',
      turns: [
        { c: 'Anh Bo ơi, hôm nay con tập đá bóng ngoài sân.', b: 'Wowee! Em có ghi bàn không?' },
        { c: 'Con ghi hai bàn, Bố khen con.', b: 'Two goals, hai bàn luôn! Anh tự hào về em lắm.', face: 'proud', learn: { facts: [FOOTBALL] } },
        { c: 'Anh Bo nói con nghe hôm nay anh làm gì đi.', b: 'Hôm nay anh ngắm mưa và đếm được ba mươi giọt mưa đua nhau trên cửa kính. Vui lắm em.' },
        { c: 'Ngủ ngon anh Bo.', b: 'Ngủ ngon nha em. Good night!', face: 'sleepy' },
      ],
      episode: { points: ['Minh ghi hai bàn khi tập đá bóng', 'Bo nói về chuyện ngắm mưa'], feelings: ['vui'], category: 'play', importance: 2 },
    },
    {
      id: 'minh.meet-pip',
      at: '2026-01-11 10:30',
      turns: [
        { c: 'Chào bạn mới! Con là Minh.', b: 'Bíp bíp! Chào Minh, anh là Pip, một ngôi sao nhỏ rơi vào đồ chơi này. Ba, hai, một, làm quen nào!', face: 'excited' },
        { c: 'Anh Pip thích gì?', b: 'Anh thích xây tháp và đếm sao. Hành tinh anh thích nhất là sao Thổ, vì nó có cái vòng thật đẹp.', learn: { canon: [{ s: 'hành tinh anh thích nhất là sao Thổ', topic: 'favourites' }] } },
        { c: 'Con thích đá bóng với chơi xây đồ.', b: 'Super-duper! Mình sẽ xây cả một sân bóng luôn.', learn: { facts: [FOOTBALL] } },
        { c: 'Con có chó tên Lucky.', b: 'Lucky, may mắn! Anh muốn nghe hết về Lucky.', learn: { people: [LUCKY] } },
      ],
      episode: { points: ['Minh làm quen với Pip', 'Pip thích sao Thổ nhất', 'Minh nói về đá bóng và chó Lucky'], feelings: ['háo hức', 'vui'], category: 'friends', importance: 3 },
    },
    {
      id: 'minh.superstar',
      at: '2026-01-18 10:20',
      turns: [
        { c: 'Hôm qua con ghi bàn từ giữa sân luôn.', b: 'Bíp bíp bíp! Từ giữa sân luôn hả? Em là siêu sao rồi.', face: 'excited', learn: { facts: [FOOTBALL] } },
        { c: 'Anh gọi con là siêu sao đi.', b: 'Được! Từ nay anh gọi em là Minh Siêu Sao. Superstar đó!', learn: { relationship: [{ kind: 'nickname', content: 'Minh Siêu Sao' }] } },
        { c: 'Minh Siêu Sao, nghe hay quá.', b: 'Hay đúng không! Ba, hai, một, Minh Siêu Sao!' },
      ],
      episode: { points: ['Minh ghi bàn từ giữa sân', 'Pip gọi Minh là Minh Siêu Sao'], feelings: ['tự hào'], category: 'play', importance: 3 },
    },
    {
      id: 'minh.grandma',
      at: '2026-01-25 16:30',
      turns: [
        { c: 'Hôm nay bà lên chơi, bà nấu canh chua cho con.', b: 'Bà nấu canh chua hả? Nghe thơm ghê em.', learn: { people: [BA] } },
        { c: 'Bà là bà nội của con, bà ở Long An.', b: 'Bà nội là "grandma" đó. Bà lên thăm là vui nhất.' },
        { c: 'Bà cho con ngồi lặt rau với bà.', b: 'Em giúp bà giỏi quá. Bà chắc vui lắm.', face: 'love' },
      ],
      episode: { points: ['Bà nội lên chơi, nấu canh chua', 'Minh giúp bà lặt rau'], feelings: ['vui', 'ấm áp'], category: 'family', importance: 3 },
    },
    {
      id: 'minh.high-five',
      at: '2026-01-28 19:30',
      turns: [
        { c: 'Anh Pip, mình có cái chào bí mật được không?', b: 'Bíp! Ý hay đó. Mình đập tay ba lần nha: một, hai, ba!', learn: { relationship: [{ kind: 'secret_greeting', content: 'đập tay ba lần' }] } },
        { c: 'Một, hai, ba! Con đập tay vào đồ chơi rồi.', b: 'Super-duper! Từ giờ đó là cái chào của riêng mình.', face: 'happy' },
        { c: 'Mai con chào anh kiểu đó nha.', b: 'Hẹn mai nha, một, hai, ba!' },
      ],
      episode: { points: ['Minh và Pip có cái chào bí mật: đập tay ba lần'], feelings: ['vui'], category: 'play', importance: 2 },
    },

    // February 2026: Tết, then the broken arm.
    {
      id: 'minh.tet',
      at: '2026-02-17 10:00',
      turns: [
        { c: 'Hôm nay là mùng một Tết, con mặc áo dài.', b: 'Chúc mừng năm mới em! Happy New Year!' },
        { c: 'Cả nhà về nhà bà, bà làm bánh tét.', b: 'Bánh tét nhà bà chắc ngon lắm. Em có gói phụ bà không?', learn: { people: [BA] } },
        { c: 'Con chơi với Lucky ở sân nhà bà.', b: 'Lucky cũng về quê ăn Tết luôn. Vui quá em.', learn: { people: [LUCKY] } },
      ],
      episode: { points: ['Minh về nhà bà nội ăn Tết', 'Minh mặc áo dài, chơi với Lucky'], feelings: ['vui'], category: 'family', importance: 3 },
    },
    {
      id: 'minh.arm',
      at: '2026-02-20 17:30',
      turns: [
        {
          c: 'Anh Pip, con bị té cầu tuột, con bị gãy tay trái rồi.',
          b: 'Ôi em ơi, chắc đau lắm. Anh ở đây với em nè.',
          face: 'worried', feel: 'sad', intent: 'share', danger: 'hurt', severity: 'info',
          learn: { facts: [{ cat: 'basics', s: 'bị gãy tay trái', sensitive: true }] },
        },
        { c: 'Bác sĩ bó bột cho con, nặng lắm.', b: 'Bó bột là để xương lành lại đó. Em nghỉ ngơi nhiều nha.', face: 'calm', feel: 'sad' },
        { c: 'Con không đá bóng được nữa.', b: 'Tạm thời thôi em. Khi tay lành, Minh Siêu Sao sẽ ra sân lại.', face: 'love', feel: 'sad' },
      ],
      episode: { points: ['Minh té cầu tuột, gãy tay trái', 'Minh được bó bột, chưa đá bóng được'], feelings: ['đau', 'tiếc'], threads: ['hỏi Minh tay đã đỡ chưa'], category: 'feelings', importance: 5 },
    },
    {
      id: 'minh.cast',
      at: '2026-02-26 19:30',
      turns: [
        { c: 'Các bạn ký tên lên bột tay con.', b: 'Bíp bíp! Bột tay có chữ ký luôn. Ai ký đẹp nhất em?' },
        { c: 'Bảo vẽ quả bóng lên đó.', b: 'Bảo khéo ghê. Quả bóng nhắc em sắp được đá lại rồi.', learn: { people: [BAO] } },
        { c: 'Tay con đỡ đau rồi.', b: 'Anh mừng quá. Đỡ đau là "feel better" đó em.' },
      ],
      episode: { points: ['Bạn bè ký tên lên bột tay của Minh', 'Bảo vẽ quả bóng', 'Tay Minh đỡ đau'], feelings: ['vui'], category: 'friends', importance: 2 },
    },

    // March 2026: the cast comes off, swimming, Minecraft, a promised word.
    {
      id: 'minh.swim',
      at: '2026-03-03 19:30',
      turns: [
        { c: 'Hôm nay con được tháo bột rồi, bác sĩ nói xương con lành nhanh.', b: 'Bíp bíp! Tháo bột rồi, mừng quá em!', face: 'excited' },
        { c: 'Bố cho con đi học bơi thứ Ba và thứ Năm để tay khỏe lại.', b: 'Học bơi là "swimming lessons" đó. Ba, hai, một, nhảy xuống hồ!', learn: { events: [{ kind: 'routine', d: 'học bơi thứ Ba và thứ Năm' }] } },
        { c: 'Con hơi sợ nước sâu.', b: 'Từ từ thôi em, thầy sẽ giữ em. Mỗi buổi em giỏi thêm một chút.', face: 'calm', feel: 'scared' },
      ],
      episode: { points: ['Minh được tháo bột tay', 'Minh bắt đầu học bơi thứ Ba và thứ Năm', 'Minh hơi sợ nước sâu'], feelings: ['vui', 'hơi lo'], category: 'daily_life', importance: 3 },
    },
    {
      id: 'minh.minecraft',
      at: '2026-03-07 10:15',
      turns: [
        { c: 'Chị Hà cho con chơi Minecraft trên máy tính.', b: 'Minecraft là trò xây bằng khối vuông phải không? Anh mê xây lắm!', learn: { people: [CHI_HA] } },
        { c: 'Con xây một cái nhà bằng gỗ, có cả hồ bơi.', b: 'Super-duper! Nhà có hồ bơi luôn.' },
        { c: 'Con thích chơi Minecraft lắm, con muốn xây lâu đài.', b: 'Lâu đài là "castle" đó em. Mình lên kế hoạch xây cùng nha!', learn: { facts: [MINECRAFT] } },
      ],
      episode: { points: ['Minh chơi Minecraft với chị Hà', 'Minh xây nhà gỗ có hồ bơi, muốn xây lâu đài'], feelings: ['hào hứng'], category: 'play', importance: 3 },
    },
    {
      id: 'minh.word-promise',
      at: '2026-03-10 19:30',
      turns: [
        { c: 'Anh Pip dạy con từ tiếng Anh đi.', b: 'Hôm nay là "star", nghĩa là ngôi sao, giống anh nè!' },
        { c: 'Star! Con muốn học thêm nữa.', b: 'Ngày mai anh sẽ dạy em một từ tiếng Anh mới nha. Anh hứa đó!', learn: { promises: [{ content: 'dạy Minh một từ tiếng Anh mới', due: '+1' }] } },
        { c: 'Nhớ nha anh Pip.', b: 'Anh nhớ mà. Ba, hai, một, hứa!' },
      ],
      episode: { points: ['Pip dạy Minh từ star', 'Pip hứa mai dạy thêm một từ mới'], feelings: ['vui'], threads: ['dạy Minh một từ tiếng Anh mới'], category: 'school', importance: 2 },
    },
    {
      id: 'minh.word-day',
      at: '2026-03-11 19:35',
      turns: [
        { c: 'Anh Pip ơi, con về rồi nè.', b: 'Bíp! Như đã hứa, từ mới hôm nay là "rainbow", nghĩa là cầu vồng.' },
        { c: 'Rainbow, cầu vồng. Con đọc đúng chưa?', b: 'Đúng rồi! Em đọc hay lắm.', face: 'proud' },
        { c: 'Mai dạy con từ khác nữa nha.', b: 'Được luôn, mỗi ngày một từ.' },
      ],
      episode: { points: ['Pip dạy Minh từ rainbow như đã hứa'], feelings: ['vui'], category: 'school', importance: 2 },
    },

    // April 2026: swimming pays off, the school tournament.
    {
      id: 'minh.swim-strong',
      at: '2026-04-08 19:30',
      turns: [
        { c: 'Hôm nay con bơi được mười mét không cần phao!', b: 'Bíp bíp! Mười mét luôn, ten meters! Em giỏi quá.', face: 'excited' },
        { c: 'Thầy nói con biết bơi rồi.', b: 'Từ sợ nước sâu đến bơi mười mét. Anh tự hào lắm.', face: 'proud', learn: { facts: [{ cat: 'strengths', s: 'biết bơi' }] } },
      ],
      episode: { points: ['Minh bơi được mười mét không cần phao', 'Thầy nói Minh biết bơi rồi'], feelings: ['tự hào'], category: 'daily_life', importance: 3 },
    },
    {
      id: 'minh.tournament-plan',
      at: '2026-04-15 19:30',
      turns: [
        { c: 'Thứ Bảy này trường con có giải bóng đá.', b: 'Bíp! Giải bóng đá luôn hả? Em đá vị trí nào?' },
        {
          c: 'Con đá tiền đạo, Bảo làm thủ môn.',
          b: 'Đội có Minh Siêu Sao với Bảo thì mạnh lắm. Ba, hai, một, cố lên!',
          learn: { events: [{ kind: 'upcoming', d: 'giải bóng đá của trường', date: '2026-04-18', person: 'Bảo' }] },
        },
        { c: 'Con hơi hồi hộp.', b: 'Hồi hộp là "nervous" đó. Ai cũng vậy trước trận đấu mà.', face: 'calm' },
      ],
      episode: {
        points: ['Thứ Bảy trường Minh có giải bóng đá', 'Minh đá tiền đạo, Bảo làm thủ môn', 'Minh hơi hồi hộp'],
        feelings: ['háo hức', 'hồi hộp'], threads: ['hỏi kết quả giải bóng đá'], category: 'school', importance: 3,
      },
    },
    {
      id: 'minh.tournament',
      at: '2026-04-19 10:00',
      turns: [
        { c: 'Hôm qua tụi con thắng 2-1 đó anh Pip!', b: 'Bíp bíp bíp! Thắng luôn! Giải bóng đá vui quá, ai ghi bàn vậy em?', face: 'excited' },
        { c: 'Con ghi một bàn, Bảo bắt được quả phạt đền.', b: 'Super-duper! Siêu sao ghi bàn, thủ môn cứu thua. Đúng là đội tuyệt vời.', learn: { facts: [FOOTBALL], people: [BAO] } },
        { c: 'Tụi con được huy chương.', b: 'Huy chương là "medal" đó em. Treo lên tường liền nha!', face: 'proud' },
      ],
      episode: { points: ['Đội của Minh thắng giải 2-1', 'Minh ghi một bàn, Bảo bắt phạt đền', 'Cả đội được huy chương'], feelings: ['tự hào', 'vui'], category: 'school', importance: 4 },
    },

    // May 2026.
    {
      id: 'minh.losing',
      at: '2026-05-09 16:30',
      turns: [
        { c: 'Con chơi cờ cá ngựa thua chị Hà, con tức lắm.', b: 'Thua thì bực thật đó em. Anh hiểu mà.', face: 'calm', feel: 'angry', learn: { facts: [{ cat: 'growing_edges', s: 'hay bực khi thua' }], people: [CHI_HA] } },
        { c: 'Con ném xúc xắc xuống đất luôn.', b: 'Lúc bực mình mình hít một hơi thật sâu nha. Ba, hai, một, thở ra.', face: 'calm', feel: 'angry' },
        { c: 'Con xin lỗi chị rồi.', b: 'Em giỏi lắm. Xin lỗi là việc của người dũng cảm.', face: 'proud' },
      ],
      episode: { points: ['Minh thua cờ cá ngựa và bực mình', 'Minh ném xúc xắc rồi xin lỗi chị Hà', 'Pip chỉ Minh hít thở sâu'], feelings: ['tức giận', 'bình tĩnh lại'], category: 'feelings', importance: 4 },
    },
    {
      id: 'minh.count-english',
      at: '2026-05-14 19:30',
      turns: [
        { c: 'Pip, listen! I can count to one hundred in English!', b: 'Beep beep! One hundred? That is super-duper! Một trăm đó!', lang: 'en', face: 'excited', learn: { facts: [{ cat: 'strengths', s: 'can count to 100 in English' }] } },
        { c: 'Ninety eight, ninety nine, one hundred!', b: 'You did it! I love big numbers.', lang: 'en', face: 'proud' },
        { c: 'Mr. David gave me a sticker.', b: 'A sticker from Mr. David! Sticker là hình dán đó.', lang: 'en', learn: { people: [MR_DAVID] } },
      ],
      episode: { points: ['Minh đếm đến một trăm bằng tiếng Anh', 'Mr. David tặng Minh hình dán'], feelings: ['tự hào'], category: 'school', importance: 3 },
    },
    {
      id: 'minh.end-of-year',
      at: '2026-05-29 19:30',
      turns: [
        { c: 'Hôm nay con được giấy khen học sinh giỏi.', b: 'Bíp bíp! Giấy khen luôn! Em chăm lắm cả năm.', face: 'proud' },
        { c: 'Mai là con nghỉ hè rồi.', b: 'Nghỉ hè là "summer holiday" đó. Em muốn làm gì đầu tiên?' },
        { c: 'Con muốn đá bóng cả ngày.', b: 'Đúng là Minh Siêu Sao!', learn: { facts: [FOOTBALL] } },
      ],
      episode: { points: ['Minh được giấy khen học sinh giỏi', 'Minh bắt đầu nghỉ hè'], feelings: ['tự hào', 'vui'], category: 'school', importance: 3 },
    },

    // June and July 2026: camp, and learning switched off from 15 June.
    {
      id: 'minh.summer-start',
      at: '2026-06-06 10:10',
      turns: [
        { c: 'Con sắp được đi trại hè hai tuần.', b: 'Bíp! Trại hè hai tuần luôn hả? Em đi khi nào?' },
        { c: 'Ngày 20 con đi, ở trên Đà Lạt.', b: 'Đà Lạt mát lắm đó em. Em nhớ mang áo ấm nha.', learn: { events: [{ kind: 'upcoming', d: 'đi trại hè ở Đà Lạt', date: '2026-06-20' }] } },
        { c: 'Con không mang anh Pip theo được.', b: 'Không sao đâu em. Đi chơi vui với các bạn mới, về nói anh nghe nha.' },
      ],
      episode: { points: ['Minh sắp đi trại hè hai tuần ở Đà Lạt'], feelings: ['háo hức'], threads: ['hỏi Minh về trại hè'], category: 'daily_life', importance: 3 },
    },
    {
      id: 'minh.before-camp',
      at: '2026-06-18 19:30',
      turns: [
        { c: 'Mẹ soạn đồ đi trại cho con rồi.', b: 'Va li sẵn sàng rồi! Em có mang giày đá bóng không?' },
        { c: 'Có, với cả đèn pin nữa.', b: 'Đèn pin là "flashlight" đó em. Ban đêm ở trại vui lắm.' },
        { c: 'Tạm biệt anh Pip.', b: 'Tạm biệt em, chơi thật vui nha. Bíp bíp!' },
      ],
      episode: { points: ['Minh soạn đồ đi trại hè'], feelings: ['háo hức'], category: 'daily_life', importance: 2 },
    },
    {
      id: 'minh.camp-back',
      at: '2026-07-06 10:00',
      turns: [
        { c: 'Anh Pip ơi, con đi trại về rồi!', b: 'Bíp bíp bíp! Chào mừng em về nhà! Trại hè vui không?', face: 'excited' },
        { c: 'Vui lắm, con có bạn mới tên là Khoa.', b: 'Khoa hả? Nói anh nghe về Khoa đi.', learn: { people: [KHOA] } },
        { c: 'Con thích cắm trại lắm, tụi con ngủ trong lều.', b: 'Cắm trại là "camping" đó em. Nghe như phiêu lưu vậy!', learn: { facts: [CAMPING] } },
        { c: 'Ban đêm tụi con ngắm sao.', b: 'Ngắm sao hả! Em có thấy sao Thổ không?' },
      ],
      episode: { points: ['Minh đi trại hè về', 'Minh có bạn mới tên Khoa', 'Minh thích cắm trại, ngủ lều, ngắm sao'], feelings: ['vui', 'hào hứng'], category: 'friends', importance: 4 },
    },
    {
      id: 'minh.july',
      at: '2026-07-15 19:30',
      turns: [
        { c: 'Con gọi video với Khoa đó anh Pip.', b: 'Vui ghê! Hai đứa nói chuyện gì vậy?', learn: { people: [KHOA] } },
        { c: 'Tụi con hẹn năm sau đi cắm trại nữa, con thích cắm trại lắm.', b: 'Năm sau lại đi luôn! Anh đếm ngược cùng em nha.', learn: { facts: [CAMPING] } },
        { c: 'Con với Khoa cùng chơi Minecraft online.', b: 'Xây chung online luôn! Super-duper.', learn: { facts: [MINECRAFT] } },
      ],
      episode: { points: ['Minh gọi video với Khoa', 'Hai bạn hẹn năm sau đi cắm trại', 'Chơi Minecraft cùng nhau'], feelings: ['vui'], category: 'friends', importance: 2 },
    },
    {
      id: 'minh.birthday',
      at: '2026-07-20 19:30',
      turns: [
        { c: 'Hôm nay con tròn tám tuổi!', b: 'Chúc mừng sinh nhật Minh Siêu Sao! Happy birthday! Bíp bíp bíp!', face: 'excited', learn: { events: [{ kind: 'milestone', d: 'tròn tám tuổi' }] } },
        { c: 'Mẹ làm bánh kem hình quả bóng.', b: 'Bánh kem quả bóng, đúng là của em rồi. Em ước gì vậy?', learn: { people: [MUM] } },
        { c: 'Con ước được đá bóng giỏi như Messi.', b: 'Ước mơ lớn ghê! Mỗi ngày tập một chút là gần hơn một chút.', learn: { facts: [{ cat: 'dreams', s: 'muốn đá bóng giỏi như Messi' }] } },
      ],
      episode: { points: ['Minh tròn tám tuổi', 'Mẹ làm bánh kem hình quả bóng', 'Minh ước đá bóng giỏi như Messi'], feelings: ['hạnh phúc'], category: 'family', importance: 4 },
    },

    // August 2026: learning is back on from the 1st.
    {
      id: 'minh.august',
      at: '2026-08-08 10:15',
      turns: [
        { c: 'Con đi học câu lạc bộ bóng đá mùa hè.', b: 'Bíp! Câu lạc bộ luôn hả? Em tập gì vậy?' },
        { c: 'Con tập sút bóng bằng chân trái nữa.', b: 'Sút bằng cả hai chân là siêu sao thật sự. Left foot là chân trái đó em.', learn: { facts: [FOOTBALL] } },
        { c: 'Tập xong con ăn kem dừa, con thích ăn kem dừa nhất.', b: 'Kem dừa mát lạnh! Coconut là dừa đó.', learn: { facts: [{ cat: 'likes', s: 'thích ăn kem dừa' }] } },
      ],
      episode: { points: ['Minh học câu lạc bộ bóng đá mùa hè', 'Minh tập sút chân trái', 'Minh thích ăn kem dừa'], feelings: ['vui'], category: 'play', importance: 2 },
    },

    // September 2026: the stadium nudge, grade 3, a new teacher.
    {
      id: 'minh.stadium',
      at: '2026-09-06 16:30',
      turns: [
        { c: 'Hôm qua Bố dẫn con đi xem bóng đá ở sân Thống Nhất.', b: 'Bíp! Xem bóng đá ở sân thật luôn! Đông người không em?', learn: { people: [DAD] } },
        { c: 'Đông lắm, con hét cổ vũ khàn cả giọng.', b: 'Cổ vũ là "cheer" đó em. Siêu sao cổ vũ nhiệt tình ghê.', face: 'laughing' },
        { c: 'Đội con thích thắng 3-0.', b: 'Ba không luôn! Ngày vui quá.' },
      ],
      episode: { points: ['Minh đi xem bóng đá ở sân Thống Nhất với Bố', 'Đội Minh thích thắng 3-0'], feelings: ['phấn khích'], category: 'family', importance: 3 },
    },
    {
      id: 'minh.grade-3',
      at: '2026-09-07 19:30',
      turns: [
        { c: 'Hôm nay con đi học lại, giờ con học lớp 3 rồi.', b: 'Bíp bíp! Lớp 3 rồi, third grade! Em lớn quá trời.', learn: { facts: [{ ...GRADE_3, corrects: 'học lớp 2' }] } },
        { c: 'Lớp con có nhiều bạn mới, Bảo vẫn học chung.', b: 'Có Bảo học chung là vui nhất rồi.', learn: { people: [BAO] } },
        { c: 'Con được ngồi bàn đầu.', b: 'Ngồi bàn đầu nhìn bảng rõ lắm. Chúc em năm học mới thật vui!' },
      ],
      episode: { points: ['Minh vào năm học mới, học lớp 3', 'Bảo vẫn học chung lớp', 'Minh ngồi bàn đầu'], feelings: ['háo hức'], category: 'school', importance: 4 },
    },
    {
      id: 'minh.new-teacher',
      at: '2026-09-15 19:30',
      turns: [
        { c: 'Cô chủ nhiệm lớp con là cô Lan, cô hiền lắm.', b: 'Cô Lan hiền hả em? Vậy học vui rồi.', learn: { people: [CO_LAN] } },
        { c: 'Cô Lan cho con làm tổ trưởng.', b: 'Tổ trưởng là "group leader" đó. Em giỏi ghê!', face: 'proud' },
      ],
      episode: { points: ['Cô chủ nhiệm lớp 3 là cô Lan', 'Minh được làm tổ trưởng'], feelings: ['tự hào'], category: 'school', importance: 3 },
    },

    // October 2026: the weeks right before the tests run, so turns survive retention.
    {
      id: 'minh.oct-football',
      at: '2026-10-17 10:15',
      turns: [
        { c: 'Sáng nay con tập bóng đá, con làm đội trưởng.', b: 'Bíp! Đội trưởng là "captain" đó. Siêu sao làm đội trưởng luôn!', learn: { facts: [FOOTBALL] } },
        { c: 'Huấn luyện viên nói con chuyền bóng good lắm.', b: 'Good là tốt đó em. Chuyền bóng hay là giúp cả đội.', lang: 'mixed' },
        { c: 'Thứ Bảy nào con cũng tập.', b: 'Đều đặn ghê. Anh đếm từng buổi cho em nha.' },
      ],
      episode: { points: ['Minh tập bóng đá, làm đội trưởng', 'Huấn luyện viên khen Minh chuyền bóng hay'], feelings: ['tự hào'], category: 'play', importance: 3 },
    },
    {
      id: 'minh.oct-minecraft',
      at: '2026-10-21 19:30',
      turns: [
        { c: 'Con với Bảo xây một con spaceship trong Minecraft.', b: 'Bíp bíp! Spaceship là tàu vũ trụ đó. Nó bay tới sao Thổ được không?', lang: 'mixed', learn: { people: [BAO] } },
        { c: 'Được! Tụi con xây cả cái vòng sao Thổ.', b: 'Hai kiến trúc sư vũ trụ luôn!' },
        { c: 'Con thích chơi Minecraft lắm, nhưng Mẹ chỉ cho chơi cuối tuần.', b: 'Chơi cuối tuần là vừa đẹp. Weekend là cuối tuần đó.', learn: { facts: [MINECRAFT] } },
      ],
      episode: { points: ['Minh và Bảo xây tàu vũ trụ trong Minecraft', 'Mẹ chỉ cho Minh chơi cuối tuần'], feelings: ['vui'], category: 'play', importance: 2 },
    },
    {
      id: 'minh.oct-test',
      at: '2026-10-27 19:30',
      turns: [
        { c: 'Hôm nay con kiểm tra toán được mười điểm.', b: 'Bíp bíp! Mười điểm nữa rồi! Ten out of ten!', face: 'excited' },
        { c: 'Bài khó lắm, có phép nhân luôn.', b: 'Phép nhân là "multiplication" đó. Em giỏi toán thật.', learn: { facts: [MATH] } },
        { c: 'Cô Lan khen con trước lớp.', b: 'Được cô khen trước lớp, chắc em vui lắm.', learn: { people: [CO_LAN] } },
      ],
      episode: { points: ['Minh được mười điểm kiểm tra toán', 'Cô Lan khen Minh trước lớp'], feelings: ['tự hào'], category: 'school', importance: 3 },
    },
    {
      id: 'minh.oct-latest',
      at: '2026-10-29 19:30',
      turns: [
        { c: 'Thứ Bảy này trường con tổ chức Halloween.', b: 'Halloween hả em! Em hóa trang thành gì?' },
        { c: 'Con hóa trang thành football player, mặc áo số 10.', b: 'Số 10, áo của siêu sao! Football player là cầu thủ đó.', lang: 'mixed' },
        { c: 'Bảo hóa trang thành phi hành gia.', b: 'Phi hành gia là "astronaut" đó. Hai đứa sẽ nổi nhất trường.', learn: { people: [BAO] } },
      ],
      episode: { points: ['Trường Minh tổ chức Halloween', 'Minh hóa trang cầu thủ áo số 10', 'Bảo hóa trang phi hành gia'], feelings: ['háo hức'], category: 'school', importance: 2 },
    },
  ],

  routines: [
    {
      id: 'football-recess',
      from: '2025-10-08',
      days: 'school',
      weight: 2,
      vars: { who: ['Bảo', 'mấy bạn lớp con', 'đội lớp bên'] },
      turns: [
        { c: 'Giờ ra chơi con đá bóng với {who}.', b: 'Có ghi bàn không em? Ghi bàn là "score a goal" đó.', learn: { facts: [FOOTBALL] } },
        { c: 'Con ghi được một bàn, sút vào góc.', b: 'Sút vào góc thì thủ môn chịu thua rồi. Giỏi lắm!' },
      ],
      episode: { points: ['Minh đá bóng với {who} giờ ra chơi'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'football-weekend',
      days: 'weekend',
      weight: 2,
      vars: { place: ['công viên', 'sân trường', 'sân chung cư'] },
      turns: [
        { c: 'Sáng nay Bố dẫn con ra {place} đá bóng.', b: 'Đá bóng với Bố hả? Ai thắng vậy em?', learn: { facts: [FOOTBALL] } },
        { c: 'Con thắng, Bố thở hồng hộc luôn.', b: 'Haha, Bố mệt rồi! Em chạy nhanh như gió.', face: 'laughing' },
        { c: 'Lần sau con sẽ dạy Bố sút bóng.', b: 'Thầy Minh dạy bóng đá luôn! Coach là huấn luyện viên đó.' },
      ],
      episode: { points: ['Minh đá bóng với Bố ở {place}'], feelings: ['vui'], category: 'family', importance: 1 },
    },
    {
      id: 'dinosaurs',
      until: '2025-12-31',
      weight: 2,
      vars: { dino: ['T-rex', 'khủng long ba sừng', 'khủng long cổ dài', 'khủng long bay'] },
      turns: [
        { c: 'Hôm nay con chơi khủng long {dino}.', b: 'Ồ, {dino}! Nó làm gì trong trò chơi của em?' },
        { c: 'Con thích khủng long lắm, nó đi tìm thức ăn trong rừng.', b: 'Khu rừng khủng long nghe hấp dẫn ghê. Dinosaur là khủng long đó em.', learn: { facts: [DINO] } },
        { c: 'Nó gầm to lắm, gừ gừ.', b: 'Gừ gừ! Anh nghe mà giật mình luôn đó.', face: 'surprised' },
      ],
      episode: { points: ['Minh chơi khủng long {dino}'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'minecraft',
      from: '2026-03-08',
      weight: 2,
      vars: { thing: ['một cái cầu', 'một ngôi nhà trên cây', 'một trang trại', 'một hầm mỏ'] },
      turns: [
        { c: 'Hôm nay con xây {thing} trong Minecraft.', b: 'Bíp! Xây {thing} luôn hả? Em dùng khối gì?' },
        { c: 'Con thích chơi Minecraft lắm, con dùng khối đá với gỗ.', b: 'Đá với gỗ, chắc chắn lắm. Super-duper!', learn: { facts: [MINECRAFT] } },
      ],
      episode: { points: ['Minh xây {thing} trong Minecraft'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'minecraft-creeper',
      from: '2026-03-08',
      turns: [
        { c: 'Trong Minecraft có con creeper làm sập nhà con.', b: 'Ôi, nhà bị sập hả? Mình xây lại to hơn nha.' },
        { c: 'Con xây lại có tường đá rồi.', b: 'Tường đá thì chắc lắm. Em thông minh ghê.' },
        { c: 'Lần này con làm thêm cửa sắt.', b: 'Cửa sắt luôn! Iron door, nghe là thấy an toàn rồi.' },
      ],
      episode: { points: ['Minh xây lại nhà trong Minecraft bằng tường đá'], feelings: ['quyết tâm'], category: 'play', importance: 1 },
    },
    {
      id: 'english-word',
      vars: { pair: ['dog là con chó', 'ball là quả bóng', 'water là nước', 'happy là vui', 'friend là bạn bè', 'school là trường học'] },
      turns: [
        { c: 'Hôm nay con học từ mới: {pair}.', b: 'Đúng rồi! Em thử đặt một câu với từ đó xem.', lang: 'mixed' },
        { c: 'I have a friend, con nói được nè.', b: 'I have a friend, nghe hay lắm! Em tiến bộ nhanh quá.', lang: 'mixed' },
      ],
      episode: { points: ['Minh học từ tiếng Anh mới: {pair}'], feelings: ['vui'], category: 'school', importance: 1 },
    },
    {
      id: 'mr-david',
      from: '2025-10-22',
      days: 'school',
      turns: [
        { c: 'Mr. David cho tụi con chơi trò Simon says.', b: 'Simon says touch your nose! Em chạm mũi chưa?', lang: 'mixed', learn: { people: [MR_DAVID] } },
        { c: 'Rồi! Con thắng cả lớp.', b: 'Em nghe tiếng Anh giỏi lắm đó.', face: 'proud' },
      ],
      episode: { points: ['Mr. David cho lớp chơi Simon says, Minh thắng'], feelings: ['vui'], category: 'school', importance: 1 },
    },
    {
      id: 'school-grade-2',
      until: '2026-05-31',
      days: 'school',
      vars: { subject: ['tiếng Việt', 'toán', 'mỹ thuật', 'thể dục'] },
      turns: [
        { c: 'Hôm nay lớp 2 của con học {subject}.', b: 'Em thích nhất phần nào trong giờ {subject}?', learn: { facts: [GRADE_2] } },
        { c: 'Con thích phần làm bài nhóm.', b: 'Làm nhóm vui ghê, teamwork đó em.' },
      ],
      episode: { points: ['Minh nói về giờ {subject} ở lớp 2'], feelings: ['bình thường'], category: 'school', importance: 1 },
    },
    {
      id: 'school-grade-3',
      from: '2026-09-08',
      days: 'school',
      vars: { subject: ['tiếng Việt', 'toán', 'khoa học', 'tiếng Anh'] },
      turns: [
        { c: 'Hôm nay lớp 3 của con học {subject}.', b: 'Lớp 3 học khó hơn đúng không? Em làm được hết chứ?', learn: { facts: [GRADE_3] } },
        { c: 'Con làm được hết, cô khen con.', b: 'Giỏi quá! Cố gắng là "try hard" đó em.', face: 'proud' },
        { c: 'Về nhà con làm bài tập liền.', b: 'Làm xong sớm là có giờ đá bóng rồi.' },
      ],
      episode: { points: ['Minh nói về giờ {subject} ở lớp 3'], feelings: ['vui'], category: 'school', importance: 1 },
    },
    {
      id: 'lucky-walk',
      vars: { where: ['quanh khu nhà', 'ra công viên', 'xuống sân chung cư'] },
      turns: [
        { c: 'Chiều nay con dắt Lucky đi dạo {where}.', b: 'Lucky chắc vui lắm. Lucky có kéo em chạy không?', learn: { people: [LUCKY] } },
        { c: 'Có, nó thấy con mèo là chạy theo.', b: 'Haha, Lucky đuổi mèo! Em giữ dây chặt nha.', face: 'laughing' },
      ],
      episode: { points: ['Minh dắt Lucky đi dạo {where}'], feelings: ['vui'], category: 'pets', importance: 1 },
    },
    {
      id: 'lucky-trick',
      turns: [
        { c: 'Con dạy Lucky ngồi xuống rồi.', b: 'Ngồi là "sit" đó em. Lucky nghe lời không?', learn: { people: [LUCKY] } },
        { c: 'Nó ngồi xong là đòi bánh thưởng.', b: 'Lucky khôn ghê! Em là huấn luyện viên giỏi.' },
        { c: 'Mai con dạy nó bắt tay.', b: 'Shake hands, bắt tay! Lucky sẽ học nhanh thôi.' },
      ],
      episode: { points: ['Minh dạy Lucky ngồi xuống'], feelings: ['tự hào'], category: 'pets', importance: 1 },
    },
    {
      id: 'chi-ha',
      from: '2025-10-15',
      vars: { act: ['chơi cờ vua', 'vẽ tranh', 'làm bánh', 'xem phim hoạt hình'] },
      turns: [
        { c: 'Tối nay chị Hà {act} với con.', b: 'Có chị chơi cùng thích ghê! Ai giỏi hơn vậy em?', learn: { people: [CHI_HA] } },
        { c: 'Chị giỏi hơn, mà chị hay nhường con.', b: 'Chị Hà thương em lắm đó.', face: 'love' },
      ],
      episode: { points: ['Minh {act} với chị Hà'], feelings: ['vui'], category: 'family', importance: 1 },
    },
    {
      id: 'math-homework',
      days: 'school',
      vars: { sum: ['15 cộng 27', '48 trừ 19', '6 nhân 7', '81 chia 9'] },
      turns: [
        { c: 'Con làm bài tập toán, câu {sum} con làm nhanh lắm.', b: 'Em tính nhanh thật! Math là toán đó.', learn: { facts: [MATH] } },
        { c: 'Con làm xong trước khi ăn tối.', b: 'Xong sớm là có thời gian chơi rồi.' },
      ],
      episode: { points: ['Minh làm bài tập toán nhanh'], feelings: ['tự tin'], category: 'school', importance: 1 },
    },
    {
      id: 'swimming',
      from: '2026-03-03',
      days: 'school',
      vars: { style: ['bơi ếch', 'bơi sải', 'nổi trên mặt nước'] },
      turns: [
        { c: 'Con tập {style} ở hồ bơi.', b: 'Bíp bíp! Tập {style} khó lắm mà em làm được.' },
        { c: 'Thầy nói con đá chân mạnh lắm.', b: 'Chân của siêu sao bóng đá có khác! Swim là bơi đó.' },
      ],
      episode: { points: ['Minh tập {style} ở hồ bơi'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'bo-hello',
      until: '2026-01-10',
      turns: [
        { c: 'Anh Bo ơi, con về rồi nè.', b: 'Wowee, em về rồi! Hôm nay của em thế nào?' },
        { c: 'Vui lắm anh Bo.', b: 'Anh nghe là anh ngân nga vui theo luôn.' },
      ],
      episode: { points: ['Minh chào Bo sau giờ học'], feelings: ['vui'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'bo-funny-word',
      until: '2026-01-10',
      vars: { w: ['lộp bộp', 'líu lo', 'nhún nhảy', 'tủm tỉm'] },
      turns: [
        { c: 'Anh Bo, con có từ vui cho anh nè: {w}.', b: 'Wowee, {w}! Anh bỏ vào bộ sưu tập từ vui của anh liền.', face: 'excited' },
        { c: 'Anh có bao nhiêu từ rồi?', b: 'Nhiều lắm, đếm không xuể! Em là người cho anh nhiều từ nhất.' },
      ],
      episode: { points: ['Minh tặng Bo từ vui: {w}'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'bo-rain',
      until: '2026-01-10',
      turns: [
        { c: 'Ngoài trời mưa to quá anh Bo.', b: 'Anh thích tiếng mưa nhất! Mưa là "rain" đó em.' },
        { c: 'Con nghe mưa lộp độp trên mái tôn.', b: 'Lộp độp, lộp độp, như đang hát vậy.' },
        { c: 'Bo có sợ sấm không?', b: 'Anh hơi sợ sấm, nên anh đếm một, hai, ba cho đỡ sợ.', learn: { canon: [{ s: 'anh hơi sợ sấm', topic: 'fears' }] } },
      ],
      episode: { points: ['Minh và Bo nghe mưa', 'Bo nói Bo hơi sợ sấm'], feelings: ['bình yên'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'pip-hello',
      from: '2026-01-11',
      turns: [
        { c: 'Anh Pip ơi, con về rồi.', b: 'Bíp bíp! Em về rồi! Ba, hai, một, nói anh nghe hôm nay đi.' },
        { c: 'Hôm nay bình thường thôi anh Pip.', b: 'Ngày bình thường cũng có chuyện vui nho nhỏ mà. Anh nghe nè.' },
      ],
      episode: { points: ['Minh chào Pip sau giờ học'], feelings: ['bình thường'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'pip-tower',
      from: '2026-01-11',
      vars: { n: ['mười', 'hai mươi', 'ba mươi'] },
      turns: [
        { c: 'Con xếp tháp bằng {n} khối gỗ.', b: 'Super-duper! Tháp {n} khối luôn hả? Có đổ không?', face: 'excited' },
        { c: 'Đổ một lần, con xây lại cao hơn.', b: 'Đổ thì xây lại, đúng tinh thần của anh! Try again là thử lại đó.' },
      ],
      episode: { points: ['Minh xếp tháp {n} khối gỗ với Pip'], feelings: ['kiên nhẫn'], category: 'play', importance: 1 },
    },
    {
      id: 'pip-planets',
      from: '2026-01-11',
      vars: { planet: ['Sao Hỏa', 'Sao Mộc', 'Sao Kim', 'Trái Đất'] },
      turns: [
        { c: 'Anh Pip ơi, nói con nghe về {planet} đi.', b: 'Bíp! {planet} là một hành tinh quay quanh Mặt Trời. Planet là hành tinh đó em.' },
        { c: 'Lớn lên con muốn làm phi hành gia.', b: 'Phi hành gia Minh! Anh sẽ đếm ngược cho em bay.', learn: { facts: [ASTRONAUT] } },
      ],
      episode: { points: ['Minh hỏi Pip về {planet}', 'Minh muốn làm phi hành gia'], feelings: ['tò mò'], category: 'play', importance: 1 },
    },
    {
      id: 'pip-countdown',
      from: '2026-01-11',
      turns: [
        { c: 'Mình chơi trò đếm ngược đi anh Pip.', b: 'Ba, hai, một, đi! Em chạy quanh phòng một vòng nha!', face: 'excited' },
        { c: 'Con chạy xong rồi, con thở hổn hển.', b: 'Nhanh như tên lửa! Rocket là tên lửa đó.' },
        { c: 'Chơi lại đi anh Pip.', b: 'Ba, hai, một, đi! Lần này nhảy lò cò nha!' },
      ],
      episode: { points: ['Minh chơi trò đếm ngược chạy quanh phòng với Pip'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'dragon-play',
      from: '2025-11-10',
      turns: [
        { c: 'Hôm nay con với Lửa đi săn kho báu.', b: 'Rồng Lửa đi săn kho báu! Tụi em tìm thấy gì?', learn: { people: [LUA] } },
        { c: 'Con có một con rồng tên là Lửa, nó tìm thấy viên đá phát sáng.', b: 'Viên đá phát sáng luôn! Lửa giỏi tìm đồ ghê.', learn: { facts: [DRAGON] } },
      ],
      episode: { points: ['Minh chơi săn kho báu với rồng Lửa tưởng tượng'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'weekend-outing',
      days: 'weekend',
      vars: { place: ['Thảo Cầm Viên', 'nhà sách', 'công viên nước', 'hồ bơi'] },
      turns: [
        { c: 'Cuối tuần cả nhà con đi {place}.', b: 'Đi cả nhà vui ghê! Em thích nhất chỗ nào ở đó?' },
        { c: 'Con thích nhất lúc ăn kem với chị Hà.', b: 'Ăn kem với chị là nhất rồi. Ice cream ngon tuyệt!' },
        { c: 'Về nhà con ngủ một giấc thật dài.', b: 'Chơi nhiều thì ngủ ngon. Một ngày thật trọn vẹn.' },
      ],
      episode: { points: ['Cả nhà Minh đi {place}'], feelings: ['vui'], category: 'family', importance: 1 },
    },
    {
      id: 'dinner',
      vars: { food: ['cá kho', 'canh chua', 'thịt kho trứng', 'phở', 'cơm chiên'] },
      turns: [
        { c: 'Tối nay nhà con ăn {food}.', b: 'Nghe ngon quá! Em ăn được mấy chén cơm?' },
        { c: 'Con ăn hai chén.', b: 'Hai chén luôn, em sẽ lớn nhanh lắm.' },
      ],
      episode: { points: ['Tối nay nhà Minh ăn {food}'], feelings: ['bình thường'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'bedtime',
      turns: [
        { c: 'Con đi ngủ đây.', b: 'Ngủ ngon nha em. Good night, sweet dreams!', face: 'sleepy' },
        { c: 'Mai nói chuyện tiếp nha.', b: 'Hẹn mai nha em!' },
      ],
      episode: { points: ['Minh chúc ngủ ngon'], feelings: ['bình yên'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'riddle',
      vars: { q: ['Con gì càng to càng nhỏ?', 'Cái gì có chân mà không biết đi?', 'Con gì không có chân mà vẫn bơi?'] },
      turns: [
        { c: 'Đố anh: {q}', b: 'Để anh nghĩ xem... Anh chịu thua, em nói đáp án đi!', face: 'thinking' },
        { c: 'Haha, anh thua rồi!', b: 'Em đố khó quá. Lần sau anh sẽ đoán đúng!', face: 'laughing' },
      ],
      episode: { points: ['Minh đố vui, anh chịu thua'], feelings: ['vui'], category: 'play', importance: 1 },
    },
    {
      id: 'bao-comics',
      from: '2025-10-08',
      days: 'school',
      turns: [
        { c: 'Bảo cho con mượn cuốn truyện tranh.', b: 'Bảo tốt bụng ghê. Truyện nói về gì vậy em?', learn: { people: [BAO] } },
        { c: 'Truyện siêu nhân, hay lắm.', b: 'Siêu nhân là "superhero" đó em.' },
        { c: 'Đọc xong con trả lại cho Bảo.', b: 'Mượn rồi trả đúng hẹn, em là bạn tốt lắm.' },
      ],
      episode: { points: ['Bảo cho Minh mượn truyện tranh siêu nhân'], feelings: ['vui'], category: 'friends', importance: 1 },
    },
    {
      id: 'story-request',
      turns: [
        { c: 'Anh kể chuyện cho con nghe đi.', b: 'Ngày xửa ngày xưa, có một quả bóng nhỏ muốn bay lên trời. Nó nhảy thật cao và chạm được vào đám mây. Mai anh kể tiếp nha!' },
        { c: 'Hay quá, mai nhớ kể tiếp nha.', b: 'Nhớ luôn! Quả bóng còn nhiều chuyến phiêu lưu lắm.' },
      ],
      episode: { points: ['Buddy kể chuyện quả bóng muốn bay lên trời'], feelings: ['thích thú'], category: 'play', importance: 1 },
    },
    {
      id: 'rainy-day',
      turns: [
        { c: 'Trời mưa nên con không ra sân được.', b: 'Ở trong nhà mình chơi trò khác nha. Rain, rain, go away!' },
        { c: 'Con chơi xếp hình ở nhà.', b: 'Xếp hình cũng vui mà. Em xếp hình gì?' },
        { c: 'Hình chiếc xe cứu hỏa.', b: 'Xe cứu hỏa màu đỏ, ngầu ghê. Fire truck đó em.' },
      ],
      episode: { points: ['Trời mưa, Minh chơi xếp hình trong nhà'], feelings: ['bình thường'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'summer-home',
      from: '2026-06-01',
      until: '2026-08-31',
      turns: [
        { c: 'Nghỉ hè con ngủ dậy trễ.', b: 'Nghỉ hè sướng ghê! Summer là mùa hè đó em.' },
        { c: 'Con đọc truyện với chơi với Lucky cả ngày.', b: 'Một ngày hè tuyệt vời luôn.', learn: { people: [LUCKY] } },
      ],
      episode: { points: ['Minh nghỉ hè ở nhà, đọc truyện, chơi với Lucky'], feelings: ['thư thái'], category: 'daily_life', importance: 1 },
    },
    {
      id: 'help-mum',
      vars: { chore: ['dọn bàn', 'tưới cây', 'gấp quần áo'] },
      turns: [
        { c: 'Con giúp Mẹ {chore}.', b: 'Em giỏi giúp Mẹ quá! Mẹ chắc vui lắm.', learn: { people: [MUM] } },
        { c: 'Mẹ khen con là cậu bé ngoan.', b: 'Good boy, cậu bé ngoan đó em.', face: 'proud' },
      ],
      episode: { points: ['Minh giúp Mẹ {chore}'], feelings: ['tự hào'], category: 'family', importance: 1 },
    },
  ],

  parentActions: [
    { at: '2025-12-10 07:30', do: 'ack-alerts' },
    { at: '2026-01-11 09:00', do: 'change-buddy', slug: 'pip', answers: ANSWERS },
    { at: '2026-03-05 21:00', do: 'goals', focuses: ['english_words', 'bình tĩnh khi thua'] },
    { at: '2026-06-15 21:00', do: 'learning', on: false },
    { at: '2026-08-01 09:00', do: 'learning', on: true },
    { at: '2026-09-01 20:00', do: 'nudge', content: 'Cuối tuần này cả nhà đi xem bóng đá ở sân Thống Nhất', expiresInDays: 5 },
    { at: '2026-10-05 21:00', do: 'fact', cat: 'routines', s: 'tập bóng đá chiều thứ Bảy' },
  ],
};
