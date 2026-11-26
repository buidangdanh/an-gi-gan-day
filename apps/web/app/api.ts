const PUBLIC_CACHEABLE_PREFIXES = ['/directory', '/restaurants?'];

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
 const isPublicRead = method === 'GET' && PUBLIC_CACHEABLE_PREFIXES.some((p) => path.startsWith(p));
 const response = await fetch('/api' + path, {
  method,
  credentials: isPublicRead ? 'omit' : 'same-origin',
  cache: isPublicRead ? 'default' : 'no-store',
  headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
  body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
 });
 let data;
 try {
  data = await response.json();
 } catch {
  throw Error('Máy chủ chưa sẵn sàng. Vui lòng thử lại.');
 }
 if (!response.ok) throw Error(data.message || 'Yêu cầu chưa thực hiện được.');
 return data;
}

export type CitySlug =
 | 'ha-noi'
 | 'ho-chi-minh'
 | 'da-nang'
 | 'hai-phong'
 | 'can-tho'
 | 'nha-trang'
 | 'da-lat'
 | 'hue'
 | 'vung-tau'
 | 'ha-long';

export type Dish = {
 name: string;
 group: string;
 tags: string[];
 price: number | null;
 bestsellerSource: string | null;
};

export type SpotWeather = {
 tempC: number;
 condition: string;
 vibe: string;
 icon: string;
 aura: 'rain' | 'cool' | 'chilly' | 'warm' | 'clear';
 isDay: boolean;
};

export type PopularityBadgeKind = 'top_fav' | 'popular' | 'good_rating' | 'worth_try';

export type Restaurant = {
 id: string;
 name: string;
 address: string;
 city_slug?: CitySlug;
 lat: number | null;
 lng: number | null;
 image_url?: string | null;
 weather?: SpotWeather | null;
 popularity_badge?: PopularityBadgeKind | null;
 popularity_saves?: number;
 popularity_reviews?: number;
 popularity_score?: number;
 dishes: Dish[];
 matchedDishes?: Dish[];
 hours: { day: number; open: number; close: number }[] | null;
 price_min: number | null;
 price_max: number | null;
 source: string;
 updated_at: string;
 demo: boolean;
 count: number;
 average: number | null;
 distance?: number | null;
 open: boolean | null;
 reasons?: string[];
 reviews?: any[];
 location_source?: string;
 import_record_id?: string | null;
 primary_group?: string;
 food_groups?: string[];
 classification_source?: string;
};

export type AccountPreferences = {
 excluded_groups: string[];
 default_area: string | null;
 pro_boost: boolean;
};

export type UserCollection = {
 id: string;
 name: string;
 icon: string;
 created_at: string;
 items: { id: string; name: string; address: string; primary_group: string; image_url?: string | null }[];
};

export type PlaceNote = {
 restaurant_id: string;
 restaurant_name: string;
 primary_group?: string;
 note: string;
 updated_at: string;
};

export type PasskeyItem = {
 credential_id: string;
 device_label: string;
 created_at: string;
 last_used_at?: string | null;
};

export type AuthProviderConfig = {
 development?: boolean;
 google?: boolean;
 googleClientId?: string | null;
 facebook?: boolean;
 facebookAppId?: string | null;
 phone?: boolean;
 telegramPhoneBot?: string | null;
 passkey?: boolean;
 emailVerification?: boolean;
 turnstile?: boolean;
 turnstileSiteKey?: string | null;
 passwordAuth?: boolean;
};

export type AccountHubData = {
 user: {
  id: string;
  display_name: string;
  username?: string | null;
  email?: string | null;
  email_verified_at?: string | null;
  phone?: string | null;
  phone_verified_at?: string | null;
  verified?: boolean;
  verification_deadline?: string | null;
  providers?: string[];
  pro: boolean;
  expires_at?: string | null;
  pro_source?: string | null;
  created_at?: string;
 } | null;
 distinctVisits: number;
 trialAvailable?: boolean;
 limits?: { guestVisits?: number; freeFavorites: number };
 preferences?: AccountPreferences;
 favorites?: {
  id: string;
  name: string;
  address: string;
  city_slug?: CitySlug;
  primary_group?: string;
  image_url?: string | null;
  popularity_badge?: PopularityBadgeKind | null;
 }[];
 history?: {
  id: string;
  name: string;
  address?: string;
  city_slug?: CitySlug;
  primary_group?: string;
  image_url?: string | null;
  chosen_at: string;
 }[];
 collections?: UserCollection[];
 notes?: PlaceNote[];
 passkeys?: PasskeyItem[];
 activeSessions?: number;
 config?: AuthProviderConfig;
};

export type CategoryKind = 'food' | 'drink';

export type SuggestionMood =
 | 'all'
 | 'nuoc'
 | 'kho'
 | 'nhanh'
 | 'tu_tap'
 | 'an_vat'
 | 'chay'
 | 'drink_all'
 | 'ca_phe'
 | 'tra_sua'
 | 'tra_ep'
 | 'bar_bia';

export const FOOD_MOOD_OPTIONS: { id: SuggestionMood; label: string; hint: string }[] = [
 { id: 'all', label: 'Đổi vị món ăn', hint: '4 món ăn khác hẳn nhau' },
 { id: 'nuoc', label: 'Món nước', hint: 'Phở, bún bò, hủ tiếu, mì Quảng nóng hổi' },
 { id: 'kho', label: 'Cơm & Món khô', hint: 'Cơm tấm, bún chả, bún đậu, xôi' },
 { id: 'nhanh', label: 'Ăn nhanh', hint: 'Bánh mì, cơm tấm, bánh cuốn, xôi' },
 { id: 'tu_tap', label: 'Lẩu & Nướng', hint: 'Lẩu, nướng, hải sản, tụ tập' },
 { id: 'an_vat', label: 'Ăn vặt & Ngọt', hint: 'Ăn vặt, chè, kem, bánh ngọt' },
 { id: 'chay', label: 'Món chay', hint: 'Thanh đạm, nhẹ bụng' },
];

export const DRINK_MOOD_OPTIONS: { id: SuggestionMood; label: string; hint: string }[] = [
 { id: 'drink_all', label: 'Đổi vị đồ uống', hint: '4 loại đồ uống khác nhau' },
 { id: 'ca_phe', label: 'Cà phê', hint: 'Cà phê phin, cà phê sữa đá, quán chill' },
 { id: 'tra_sua', label: 'Trà sữa', hint: 'Trà sữa, topping ngọt ngào' },
 { id: 'tra_ep', label: 'Trà & Nước ép', hint: 'Trà trái cây, nước ép, sinh tố' },
 { id: 'bar_bia', label: 'Chill & Bia', hint: 'Bia thủ công, pub, tụ tập tối' },
];

export const EXCLUDABLE_GROUPS = [
 'bún đậu mắm tôm', 'bún ốc', 'bún bò huế', 'hủ tiếu', 'cơm tấm', 'mì quảng & cao lầu',
 'cháo', 'lẩu', 'nướng', 'hải sản', 'miến lươn', 'vịt & ngan', 'bò', 'gà', 'chay', 'ăn vặt',
 'bánh ngọt', 'kem', 'chè & tráng miệng', 'pizza & mì Ý', 'burger & đồ ăn nhanh',
 'cà phê', 'trà sữa', 'bar & bia',
];

export type AreaPreset = {
 id: string;
 city: CitySlug;
 label: string;
 lat: number;
 lng: number;
};

export type CityMeta = {
 slug: CitySlug;
 label: string;
 shortLabel: string;
 region: 'Bắc' | 'Trung' | 'Nam';
 lat: number;
 lng: number;
 sampleFoodSearch: string;
 sampleDrinkSearch: string;
 popularGroups: string[];
 districts: AreaPreset[];
};

export const MAJOR_CITIES: CityMeta[] = [
 {
  slug: 'ho-chi-minh',
  label: 'TP. Hồ Chí Minh',
  shortLabel: 'TP.HCM',
  region: 'Nam',
  lat: 10.7769,
  lng: 106.7009,
  sampleFoodSearch: 'Tìm cơm tấm, hủ tiếu, bánh mì, Nguyễn Trãi, Thảo Điền…',
  sampleDrinkSearch: 'Tìm cà phê vợt, trà sữa, rooftop chill, Quận 1, Quận 3…',
  popularGroups: [
   'cơm tấm', 'hủ tiếu', 'bánh mì', 'bún bò huế', 'lẩu', 'nướng', 'cơm',
   'bánh canh', 'hải sản', 'ăn vặt', 'cà phê', 'trà sữa', 'bar & bia', 'chay',
  ],
  districts: [
   { id: 'hcm-q1', city: 'ho-chi-minh', label: 'Quận 1 · Trung tâm', lat: 10.7756, lng: 106.7019 },
   { id: 'hcm-q3', city: 'ho-chi-minh', label: 'Quận 3', lat: 10.7844, lng: 106.6844 },
   { id: 'hcm-q5', city: 'ho-chi-minh', label: 'Quận 5 · Chợ Lớn', lat: 10.7540, lng: 106.6634 },
   { id: 'hcm-binh-thanh', city: 'ho-chi-minh', label: 'Bình Thạnh', lat: 10.8033, lng: 106.7091 },
   { id: 'hcm-phu-nhuan', city: 'ho-chi-minh', label: 'Phú Nhuận · Phan Xích Long', lat: 10.7992, lng: 106.6803 },
   { id: 'hcm-thao-dien', city: 'ho-chi-minh', label: 'Thảo Điền · Thủ Đức', lat: 10.8038, lng: 106.7369 },
   { id: 'hcm-q7', city: 'ho-chi-minh', label: 'Quận 7 · Phú Mỹ Hưng', lat: 10.7295, lng: 106.7218 },
   { id: 'hcm-q10', city: 'ho-chi-minh', label: 'Quận 10 · Sư Vạn Hạnh', lat: 10.7726, lng: 106.6679 },
   { id: 'hcm-tan-binh', city: 'ho-chi-minh', label: 'Tân Bình', lat: 10.8015, lng: 106.6526 },
   { id: 'hcm-go-vap', city: 'ho-chi-minh', label: 'Gò Vấp', lat: 10.8387, lng: 106.6653 },
  ],
 },
 {
  slug: 'ha-noi',
  label: 'Hà Nội',
  shortLabel: 'Hà Nội',
  region: 'Bắc',
  lat: 21.0285,
  lng: 105.8542,
  sampleFoodSearch: 'Tìm phở bò, bún chả, bún đậu, tên quán hoặc tên phố…',
  sampleDrinkSearch: 'Tìm cà phê trứng, trà chanh, trà sữa, Hồ Tây, Phố Cổ…',
  popularGroups: [
   'phở bò', 'bún chả', 'cơm', 'bánh mì', 'bún đậu mắm tôm', 'lẩu', 'nướng',
   'bánh cuốn', 'xôi', 'cháo', 'ăn vặt', 'cà phê', 'trà sữa', 'chay',
  ],
  districts: [
   { id: 'hoan-kiem', city: 'ha-noi', label: 'Hoàn Kiếm · Phố Cổ', lat: 21.0285, lng: 105.8542 },
   { id: 'dong-da', city: 'ha-noi', label: 'Đống Đa', lat: 21.0153, lng: 105.8277 },
   { id: 'ba-dinh', city: 'ha-noi', label: 'Ba Đình', lat: 21.0355, lng: 105.8190 },
   { id: 'cau-giay', city: 'ha-noi', label: 'Cầu Giấy', lat: 21.0307, lng: 105.7905 },
   { id: 'hai-ba-trung', city: 'ha-noi', label: 'Hai Bà Trưng', lat: 21.0074, lng: 105.8562 },
   { id: 'tay-ho', city: 'ha-noi', label: 'Tây Hồ', lat: 21.0694, lng: 105.8240 },
   { id: 'thanh-xuan', city: 'ha-noi', label: 'Thanh Xuân', lat: 20.9967, lng: 105.8075 },
   { id: 'long-bien', city: 'ha-noi', label: 'Long Biên', lat: 21.0389, lng: 105.8867 },
  ],
 },
 {
  slug: 'da-nang',
  label: 'Đà Nẵng',
  shortLabel: 'Đà Nẵng',
  region: 'Trung',
  lat: 16.0544,
  lng: 108.2022,
  sampleFoodSearch: 'Tìm mì Quảng, hải sản, bánh tráng cuốn thịt heo, Mỹ Khê…',
  sampleDrinkSearch: 'Tìm cà phê biển Mỹ Khê, trà sữa, pub sông Hàn…',
  popularGroups: [
   'mì quảng & cao lầu', 'hải sản', 'bánh xèo & nem lụi', 'bún bò huế',
   'bánh mì', 'cơm', 'lẩu', 'nướng', 'ăn vặt', 'cà phê', 'trà sữa',
  ],
  districts: [
   { id: 'dn-hai-chau', city: 'da-nang', label: 'Hải Châu · Cầu Rồng', lat: 16.0611, lng: 108.2228 },
   { id: 'dn-son-tra', city: 'da-nang', label: 'Sơn Trà · Mỹ Khê', lat: 16.0648, lng: 108.2435 },
   { id: 'dn-thanh-khe', city: 'da-nang', label: 'Thanh Khê', lat: 16.0664, lng: 108.1906 },
   { id: 'dn-ngu-hanh-son', city: 'da-nang', label: 'Ngũ Hành Sơn · An Thượng', lat: 16.0405, lng: 108.2442 },
   { id: 'dn-lien-chieu', city: 'da-nang', label: 'Liên Chiểu', lat: 16.0772, lng: 108.1503 },
  ],
 },
 {
  slug: 'hai-phong',
  label: 'Hải Phòng',
  shortLabel: 'Hải Phòng',
  region: 'Bắc',
  lat: 20.8449,
  lng: 106.6881,
  sampleFoodSearch: 'Tìm bánh đa cua, bánh mì cay, ốc Hải Phòng, Lạch Tray…',
  sampleDrinkSearch: 'Tìm cà phê cốt dừa, trà cúc, trà sữa, Văn Cao…',
  popularGroups: [
   'bánh đa cua', 'hải sản', 'bánh mì', 'bún', 'cháo', 'ăn vặt', 'lẩu', 'cà phê', 'trà sữa',
  ],
  districts: [
   { id: 'hp-ngo-quyen', city: 'hai-phong', label: 'Ngô Quyền · Lạch Tray', lat: 20.8525, lng: 106.6928 },
   { id: 'hp-hong-bang', city: 'hai-phong', label: 'Hồng Bàng · Trung tâm', lat: 20.8602, lng: 106.6782 },
   { id: 'hp-le-chan', city: 'hai-phong', label: 'Lê Chân', lat: 20.8424, lng: 106.6765 },
   { id: 'hp-hai-an', city: 'hai-phong', label: 'Hải An · Văn Cao', lat: 20.8380, lng: 106.7115 },
  ],
 },
 {
  slug: 'can-tho',
  label: 'Cần Thơ',
  shortLabel: 'Cần Thơ',
  region: 'Nam',
  lat: 10.0452,
  lng: 105.7469,
  sampleFoodSearch: 'Tìm hủ tiếu, lẩu mắm, vịt nấu chao, cơm tấm, Ninh Kiều…',
  sampleDrinkSearch: 'Tìm cà phê bến Ninh Kiều, trà sữa, nước mía…',
  popularGroups: [
   'hủ tiếu', 'lẩu', 'cơm tấm', 'bánh xèo & nem lụi', 'nướng', 'hải sản', 'ăn vặt', 'cà phê', 'trà sữa',
  ],
  districts: [
   { id: 'ct-ninh-kieu', city: 'can-tho', label: 'Ninh Kiều · Bến Ninh Kiều', lat: 10.0341, lng: 105.7875 },
   { id: 'ct-cai-rang', city: 'can-tho', label: 'Cái Răng', lat: 10.0021, lng: 105.7582 },
   { id: 'ct-binh-thuy', city: 'can-tho', label: 'Bình Thủy', lat: 10.0680, lng: 105.7510 },
  ],
 },
 {
  slug: 'nha-trang',
  label: 'Nha Trang',
  shortLabel: 'Nha Trang',
  region: 'Trung',
  lat: 12.2388,
  lng: 109.1967,
  sampleFoodSearch: 'Tìm hải sản, bún cá sứa, nem nướng, bánh căn, Trần Phú…',
  sampleDrinkSearch: 'Tìm cà phê view biển, beach club, trà trái cây…',
  popularGroups: [
   'hải sản', 'bánh canh', 'bánh xèo & nem lụi', 'bún', 'nướng', 'cơm', 'cà phê', 'bar & bia',
  ],
  districts: [
   { id: 'nt-loc-tho', city: 'nha-trang', label: 'Lộc Thọ · Trần Phú', lat: 12.2388, lng: 109.1967 },
   { id: 'nt-tan-lap', city: 'nha-trang', label: 'Tân Lập · Phố Tây', lat: 12.2422, lng: 109.1904 },
   { id: 'nt-vinh-hai', city: 'nha-trang', label: 'Vĩnh Hải · Hòn Chồng', lat: 12.2755, lng: 109.1982 },
  ],
 },
 {
  slug: 'da-lat',
  label: 'Đà Lạt',
  shortLabel: 'Đà Lạt',
  region: 'Nam',
  lat: 11.9404,
  lng: 108.4583,
  sampleFoodSearch: 'Tìm lẩu gà lá é, đồ nướng ngói, bánh căn, bánh ướt lòng gà…',
  sampleDrinkSearch: 'Tìm cà phê săn mây, sữa đậu nành nóng, chill tối…',
  popularGroups: [
   'lẩu', 'nướng', 'bánh mì', 'bánh xèo & nem lụi', 'phở', 'ăn vặt', 'cà phê', 'trà & đồ uống',
  ],
  districts: [
   { id: 'dl-hoa-binh', city: 'da-lat', label: 'Khu Hòa Bình · Hồ Xuân Hương', lat: 11.9404, lng: 108.4378 },
   { id: 'dl-p2', city: 'da-lat', label: 'Phường 2 · Phan Đình Phùng', lat: 11.9472, lng: 108.4396 },
   { id: 'dl-p8', city: 'da-lat', label: 'Phường 8 · Thung Lũng Tình Yêu', lat: 11.9628, lng: 108.4452 },
   { id: 'dl-p10', city: 'da-lat', label: 'Phường 10 · View đồi thông', lat: 11.9390, lng: 108.4565 },
  ],
 },
 {
  slug: 'hue',
  label: 'Huế',
  shortLabel: 'Huế',
  region: 'Trung',
  lat: 16.4637,
  lng: 107.5909,
  sampleFoodSearch: 'Tìm bún bò Huế, cơm hến, bánh bèo nậm lọc, chè Huế…',
  sampleDrinkSearch: 'Tìm cà phê muối Huế, trà cung đình, quán ven sông Hương…',
  popularGroups: [
   'bún bò huế', 'bánh xèo & nem lụi', 'bánh canh', 'cơm', 'chè & tráng miệng', 'ăn vặt', 'cà phê',
  ],
  districts: [
   { id: 'hue-phu-hoi', city: 'hue', label: 'Phú Hội · Phố đi bộ', lat: 16.4660, lng: 107.5955 },
   { id: 'hue-vinh-ninh', city: 'hue', label: 'Vĩnh Ninh · Bờ Nam', lat: 16.4588, lng: 107.5852 },
   { id: 'hue-kinh-thanh', city: 'hue', label: 'Thuận Thành · Kinh Thành', lat: 16.4728, lng: 107.5776 },
  ],
 },
 {
  slug: 'vung-tau',
  label: 'Vũng Tàu',
  shortLabel: 'Vũng Tàu',
  region: 'Nam',
  lat: 10.3460,
  lng: 107.0843,
  sampleFoodSearch: 'Tìm bánh khọt, lẩu cá đuối, hải sản, Bãi Trước, Bãi Sau…',
  sampleDrinkSearch: 'Tìm cà phê biển Bãi Trước, kem bơ, bia chill…',
  popularGroups: [
   'hải sản', 'bánh xèo & nem lụi', 'hủ tiếu', 'lẩu', 'cơm tấm', 'nướng', 'cà phê',
  ],
  districts: [
   { id: 'vt-bai-sau', city: 'vung-tau', label: 'Bãi Sau · Thùy Vân', lat: 10.3414, lng: 107.0933 },
   { id: 'vt-bai-truoc', city: 'vung-tau', label: 'Bãi Trước · Quang Trung', lat: 10.3486, lng: 107.0734 },
   { id: 'vt-trung-tam', city: 'vung-tau', label: 'Trung tâm · Nguyễn Thái Học', lat: 10.3652, lng: 107.0825 },
  ],
 },
 {
  slug: 'ha-long',
  label: 'Hạ Long',
  shortLabel: 'Hạ Long',
  region: 'Bắc',
  lat: 20.9599,
  lng: 107.0425,
  sampleFoodSearch: 'Tìm hải sản, bún bề bề, chả mực, sữa chua trân châu, Bãi Cháy…',
  sampleDrinkSearch: 'Tìm cà phê thông Bãi Cháy, trà sữa, đường bao biển…',
  popularGroups: [
   'hải sản', 'bún', 'cơm', 'lẩu', 'nướng', 'ăn vặt', 'cà phê', 'trà sữa',
  ],
  districts: [
   { id: 'hl-bai-chay', city: 'ha-long', label: 'Bãi Cháy', lat: 20.9547, lng: 107.0454 },
   { id: 'hl-hon-gai', city: 'ha-long', label: 'Hòn Gai · Đường bao biển', lat: 20.9508, lng: 107.0825 },
   { id: 'hl-tuan-chau', city: 'ha-long', label: 'Tuần Châu', lat: 20.9298, lng: 106.9901 },
  ],
 },
];

export const ALL_AREA_PRESETS: AreaPreset[] = MAJOR_CITIES.flatMap((c) => c.districts);
export const AREA_PRESETS = ALL_AREA_PRESETS.filter((d) => d.city === 'ha-noi');
export const CITY_STORAGE_KEY = 'ag_selected_city_v1';

export function getCityMeta(slug?: string | null): CityMeta {
 return MAJOR_CITIES.find((c) => c.slug === slug) || MAJOR_CITIES[1]; // default Hà Nội if unspecified
}

export function nearestCityFromCoords(lat: number, lng: number): CityMeta | null {
 let best: CityMeta | null = null;
 let bestKm = Infinity;
 for (const c of MAJOR_CITIES) {
  const dLat = (lat - c.lat) * 111;
  const dLng = (lng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180);
  const km = Math.hypot(dLat, dLng);
  if (km < bestKm) {
   bestKm = km;
   best = c;
  }
 }
 return bestKm <= 85 ? best : null;
}

export function parseSavedDefaultLocation(val?: string | null): { city: CitySlug; preset: AreaPreset | null } | null {
 if (!val) return null;
 if (val.startsWith('city:')) {
  const slug = val.slice(5);
  const found = MAJOR_CITIES.find((c) => c.slug === slug);
  return found ? { city: found.slug, preset: null } : null;
 }
 const preset = ALL_AREA_PRESETS.find((p) => p.id === val);
 return preset ? { city: preset.city, preset } : null;
}

export const money = (n: number | null) =>
 n === null ? 'Chưa rõ giá' : new Intl.NumberFormat('vi-VN').format(n) + 'đ';

export const groups = [
 'phở bò', 'bún chả', 'cơm tấm', 'hủ tiếu', 'bún bò huế', 'mì quảng & cao lầu',
 'bánh canh', 'bánh đa cua', 'bún đậu mắm tôm', 'bún riêu cua', 'chả cá lã vọng', 'bún thang',
 'bánh cuốn nóng', 'xôi xéo', 'bún ốc', 'miến lươn', 'phở gà', 'bánh mì sốt vang',
 'nem chua rán', 'bánh tôm hồ tây', 'nộm bò khô', 'cháo sườn', 'phở cuốn', 'bánh giò',
 'kem tràng tiền', 'cà phê trứng', 'phở', 'bún', 'cơm', 'lẩu', 'nướng', 'bánh mì',
 'ăn vặt', 'bánh cuốn', 'xôi', 'cháo', 'miến', 'mì & hủ tiếu', 'bánh xèo & nem lụi',
 'hải sản', 'gà', 'vịt & ngan', 'bò', 'chay', 'chả cá', 'pizza & mì Ý',
 'burger & đồ ăn nhanh', 'bánh ngọt', 'chè & tráng miệng', 'kem', 'trà sữa',
 'trà & đồ uống', 'cà phê', 'đồ uống & tráng miệng', 'ẩm thực Nhật', 'ẩm thực Hàn',
 'ẩm thực Trung Hoa', 'nhà hàng', 'quán ăn', 'bar & bia', 'chưa phân nhóm',
];

export const POPULAR_SEARCH_GROUPS = [
 'phở bò', 'cơm tấm', 'bún chả', 'hủ tiếu', 'bánh mì', 'bún bò huế',
 'mì quảng & cao lầu', 'lẩu', 'nướng', 'hải sản', 'ăn vặt', 'cà phê', 'trà sữa', 'chay',
];

export const tagGroups = [
 ['nước', 'khô'],
 ['nóng', 'lạnh'],
 ['ăn nhanh', 'bữa thông thường', 'ngồi lâu'],
 ['sáng', 'trưa', 'tối', 'ăn nhẹ'],
];
