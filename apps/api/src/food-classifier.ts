import { normalize } from './domain';

export const extraGroups = [
 'cơm tấm',
 'hủ tiếu',
 'bún bò huế',
 'mì quảng & cao lầu',
 'bánh canh',
 'bánh đa cua',
 'bánh cuốn',
 'xôi',
 'cháo',
 'miến',
 'mì & hủ tiếu',
 'bánh xèo & nem lụi',
 'hải sản',
 'gà',
 'vịt & ngan',
 'bò',
 'chay',
 'chả cá',
 'pizza & mì Ý',
 'burger & đồ ăn nhanh',
 'bánh ngọt',
 'chè & tráng miệng',
 'kem',
 'trà sữa',
 'trà & đồ uống',
 'cà phê',
 'đồ uống & tráng miệng',
 'ẩm thực Nhật',
 'ẩm thực Hàn',
 'ẩm thực Trung Hoa',
 'nhà hàng',
 'quán ăn',
 'bar & bia',
 'chưa phân nhóm',
] as const;

const rules: [string, RegExp][] = [
 ['phở cuốn', /\bpho cuon\b/],
 ['phở bò', /\bpho bo\b/],
 ['phở gà', /\bpho ga\b/],
 ['phở', /\bpho\b/],
 ['bún bò huế', /\bbun bo\b/],
 ['bún chả', /\bbun cha\b/],
 ['bún đậu mắm tôm', /\bbun dau\b/],
 ['bún riêu cua', /\bbun rieu\b/],
 ['bún thang', /\bbun thang\b/],
 ['bún ốc', /\bbun oc\b/],
 ['bún', /\bbun\b|\bbun mam\b|\bbun thit nuong\b/],
 ['bánh đa cua', /\bbanh da cua\b|\bbanh da do\b/],
 ['bánh canh', /\bbanh canh\b/],
 ['mì quảng & cao lầu', /\bmi quang\b|\bmy quang\b|\bcao lau\b/],
 ['hủ tiếu', /\bhu tieu\b|\bhu tiu\b/],
 ['cơm tấm', /\bcom tam\b/],
 ['bánh mì sốt vang', /\bbanh mi.*sot vang\b/],
 ['bánh mì', /\bbanh mi\b|\bbami\b|\bdoner kebab\b/],
 ['bánh cuốn nóng', /\bbanh cuon nong\b/],
 ['bánh cuốn', /\bbanh cuon\b|\bbanh uot\b/],
 ['bánh giò', /\bbanh gio\b/],
 ['xôi xéo', /\bxoi xeo\b/],
 ['xôi', /\bxoi\b/],
 ['cháo sườn', /\bchao suon\b/],
 ['cháo', /\bchao\b/],
 ['miến lươn', /\bmien luon\b/],
 ['miến', /\bmien\b/],
 ['mì & hủ tiếu', /\bmi (?!cay |quang)|\bmy (van than|y|cay)|\bramen\b/],
 ['bánh xèo & nem lụi', /\bbanh xeo\b|\bnem lui\b|\bbanh khot\b|\bbanh can\b|\bnem nuong\b/],
 ['cơm', /\bcom\b/],
 ['lẩu', /\blau\b|\bhotpot\b/],
 ['nướng', /\bnuong\b|\bb b q\b|\bbbq\b/],
 ['hải sản', /\bhai san\b|\boc\b|\btom hum\b/],
 ['chả cá lã vọng', /\bcha ca la vong\b/],
 ['chả cá', /\bcha ca\b/],
 ['nem chua rán', /\bnem chua ran\b/],
 ['nộm bò khô', /\bnom bo kho\b/],
 ['gà', /\bga\b|\bchicken\b/],
 ['vịt & ngan', /\bvit\b|\bngan\b/],
 ['bò', /\bbo (to|ne|bit tet|sot vang|nhung|nha|nuong)\b|\bsteak\b|\bbeefsteak\b/],
 ['chay', /\bchay\b|\bvegan\b|\bvegetarian\b/],
 ['pizza & mì Ý', /\bpizza\b|\bpasta\b|\bspaghetti\b/],
 ['burger & đồ ăn nhanh', /\bburger\b|\bkfc\b|\blotteria\b|\bjollibee\b/],
 ['bánh ngọt', /\bbakery\b|\bbanh ngot\b|\bbanh kem\b|\bbanh sinh nhat\b|\bcake\b/],
 ['cà phê trứng', /\bca phe trung\b/],
 ['cà phê', /\bca phe\b|\bcafe\b|\bcoffee\b|\bkafa\b|\bcong caphe\b|\bhighlands\b|\bphuc long\b|\bkatinat\b/],
 ['trà sữa', /\btra sua\b|\bmilk tea\b|\btocotoco\b|\bkoi the\b|\bgong cha\b|\bphuc long\b/],
 ['trà & đồ uống', /\btra\b|\bnuoc ep\b|\bsinh to\b|\bjuice\b|\bdua dam\b/],
 ['kem tràng tiền', /\bkem trang tien\b/],
 ['kem', /\bkem\b|\bice cream\b|\bgelato\b/],
 ['chè & tráng miệng', /\bche\b|\bsua chua\b|\btao pho\b|\bdessert\b|\bflan\b/],
 ['ăn vặt', /\ban vat\b|\bbanh trang\b|\bchan ga\b|\bxien\b|\bnem\b|\bbanh tom\b|\bbanh ran\b|\bnom\b|\bbot chien\b|\bpha lau\b/],
 ['ẩm thực Nhật', /\bsushi\b|\bsashimi\b|\bnhat ban\b|\bjapanese\b/],
 ['ẩm thực Hàn', /\bhan quoc\b|\bkorean\b|\bkimbap\b|\btokbokki\b/],
 ['ẩm thực Trung Hoa', /\btrung hoa\b|\bdimsum\b|\bhongkong\b|\bchinese\b/],
 ['bar & bia', /\bbar\b|\bpub\b|\bbeer\b|\bbia\b/],
 ['nhà hàng', /\bnha hang\b|\brestaurant\b/],
];

export function classifyFood(name: string, categoryIds: number[] = []) {
 const text = normalize(name.replace(/(^|[\s-])phố(?=\s|$)/giu, '$1street'))
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
 const found = rules
  .filter(([group, re]) =>
   re.test(
    group === 'mì & hủ tiếu'
     ? text.replace(/\bbanh mi\b/g, '')
     : group === 'kem'
      ? text.replace(/\bbanh kem\b/g, '')
      : text,
   ),
  )
  .map(([g]) => g);

 const parents: Record<string, string> = {
  'phở bò': 'phở',
  'phở gà': 'phở',
  'phở cuốn': 'phở',
  'bún bò huế': 'bún',
  'bún chả': 'bún',
  'bún đậu mắm tôm': 'bún',
  'bún riêu cua': 'bún',
  'bún thang': 'bún',
  'bún ốc': 'bún',
  'cơm tấm': 'cơm',
  'hủ tiếu': 'mì & hủ tiếu',
  'bánh mì sốt vang': 'bánh mì',
  'bánh cuốn nóng': 'bánh cuốn',
  'xôi xéo': 'xôi',
  'cháo sườn': 'cháo',
  'miến lươn': 'miến',
  'cà phê trứng': 'cà phê',
  'kem tràng tiền': 'kem',
  'trà sữa': 'trà & đồ uống',
  'chả cá lã vọng': 'chả cá',
 };

 const result = found.filter((g) => !found.some((child) => parents[child] === g));
 if (result.length) return { groups: [...new Set(result)].slice(0, 6), source: 'name_inferred' };
 const categoryMap: Record<number, string> = {
  1: 'nhà hàng',
  2: 'đồ uống & tráng miệng',
  3: 'quán ăn',
  4: 'bar & bia',
  6: 'bánh ngọt',
  11: 'ăn vặt',
  12: 'nhà hàng',
  39: 'nhà hàng',
  43: 'bar & bia',
  54: 'bar & bia',
  56: 'chay',
  28: 'cơm',
 };
 const fallback = [...new Set(categoryIds.map((id) => categoryMap[id]).filter(Boolean))];
 return { groups: fallback.length ? fallback : ['chưa phân nhóm'], source: fallback.length ? 'source_category' : 'unclassified' };
}
