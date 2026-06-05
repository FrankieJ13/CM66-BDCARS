/* Expanded AUTO_ASSISTANT_DICTIONARY for Russian chat search.
 * Drop-in replacement for the old window.AUTO_ASSISTANT_DICTIONARY.
 * It keeps the same public shape: { brands, models, cities, transmissions, stopWords }.
 */
(function () {
  "use strict";

  const uniq = (arr) => [...new Set((arr || []).map(v => String(v).trim().toLowerCase()).filter(Boolean))];
  const slugify = (s) => String(s)
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/&/g, "-")
    .replace(/\+/g, "-plus")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  const ruToLat = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"e", ж:"zh", з:"z", и:"i", й:"y",
    к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f",
    х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya"
  };
  const translitRuToLat = (s) => String(s).toLowerCase().replace(/[а-яё]/g, ch => ruToLat[ch] || ch);

  const latinToRuChunks = [
    ["shch","щ"],["sch","щ"],["yo","ё"],["yu","ю"],["ya","я"],["zh","ж"],["ch","ч"],["sh","ш"],["ts","ц"],
    ["kh","х"],["ph","ф"],["qu","кв"],["x","кс"],["w","в"],["q","к"],["a","а"],["b","б"],["c","к"],
    ["d","д"],["e","е"],["f","ф"],["g","г"],["h","х"],["i","и"],["j","дж"],["k","к"],["l","л"],
    ["m","м"],["n","н"],["o","о"],["p","п"],["r","р"],["s","с"],["t","т"],["u","у"],["v","в"],
    ["y","й"],["z","з"]
  ];
  function roughLatinToRu(s) {
    let x = String(s).toLowerCase();
    for (const [a,b] of latinToRuChunks) x = x.replaceAll(a,b);
    return x;
  }

  function typoVariants(s) {
    const x = String(s).trim().toLowerCase();
    const squeezed = x.replace(/([a-zа-яё])\1+/gi, "$1");
    const out = [squeezed];
    out.push(squeezed.replace(/[\s\-_.]+/g, ""));
    out.push(squeezed.replace(/[\s_.]+/g, "-"));
    out.push(squeezed.replace(/[\-_.]+/g, " "));
    return uniq(out.filter(v => v && v !== x));
  }

  function compactVariants(s) {
    const x = String(s).trim().toLowerCase();
    const base = [x];
    base.push(x.replace(/[\s\-_.]+/g, ""));
    base.push(x.replace(/[\s_.]+/g, "-"));
    base.push(x.replace(/[\-_.]+/g, " "));
    base.push(x.replace(/\bplus\b/g, "+"));
    base.push(x.replace(/\+/g, " plus"));
    base.push(x.replace(/\bev\b/g, "электро"));
    base.push(x.replace(/\bphev\b/g, "гибрид"));
    base.push(x.replace(/\bhybrid\b/g, "гибрид"));
    base.push(x.replace(/\ballroad\b/g, "аллроад"));
    base.push(x.replace(/\bcross\b/g, "кросс"));
    base.push(x.replace(/\bsport\b/g, "спорт"));
    base.push(x.replace(/\bprime\b/g, "прайм"));
    base.push(x.replace(/\bmax\b/g, "макс"));
    base.push(x.replace(/\bpro\b/g, "про"));
    base.push(x.replace(/\bgrand\b/g, "гранд"));
    base.push(x.replace(/\bclass\b/g, "класс"));
    return uniq(base);
  }

  function makeAliases(name, extra = []) {
    const raw = uniq([name, ...compactVariants(name), ...extra]);
    const out = [];
    for (const a of raw) {
      const forms = [
        a,
        translitRuToLat(a),
        roughLatinToRu(a),
        a.replace(/ё/g, "е"),
        a.replace(/[\s\-_.]+/g, ""),
        a.replace(/([a-zа-я]+)(\d+)/gi, "$1 $2"),
        a.replace(/(\d+)([a-zа-я]+)/gi, "$1 $2")
      ];
      for (const form of forms) out.push(form, ...typoVariants(form));
    }
    return uniq(out);
  }

  const brandAliases = {
    "Volkswagen": ["vw", "vag", "фв", "фольц", "фолькс", "фольс", "фольцваген", "фольксваген", "фольсваген", "вольксваген", "ваген", "ваг"],
    "Lada (ВАЗ)": ["lada", "лада", "vaz", "ваз", "жигули", "автоваз", "ваз лада", "лада ваз"],
    "ВАЗ (LADA)": ["lada", "лада", "vaz", "ваз", "жигули", "автоваз", "ваз лада", "лада ваз"],
    "Toyota": ["тойота", "таета", "тоета", "тайота", "тойта", "таёта"],
    "Nissan": ["ниссан", "нисан"],
    "Kia": ["kia", "киа", "кия"],
    "KIA": ["kia", "киа", "кия"],
    "Hyundai": ["хендай", "хундай", "хендэ", "хенде", "хёндэ", "хёндай", "хёнде"],
    "Renault": ["рено"],
    "Ford": ["форд"],
    "Mazda": ["мазда"],
    "Skoda": ["шкода", "skoda", "škoda"],
    "BMW": ["бмв", "бэмвэ", "беэмве"],
    "Mercedes-Benz": ["mercedes", "мерседес", "мерседез", "мерседец", "мерс", "мерин", "бенц", "benz"],
    "Audi": ["ауди"],
    "Chery": ["чери", "черри"],
    "Geely": ["джили", "джилли", "жили", "гили"],
    "Haval": ["хавал", "хавейл", "хавэйл"],
    "Chevrolet": ["chevy", "шевроле", "шеви"],
    "Mitsubishi": ["митсубиси", "мицубиси", "митсубиши"],
    "Honda": ["хонда"],
    "Lexus": ["лексус"],
    "Subaru": ["субару"],
    "Suzuki": ["сузуки"],
    "Opel": ["опель"],
    "Peugeot": ["пежо"],
    "Citroen": ["ситроен", "ситроэн"],
    "Daewoo": ["дэу", "деу", "дайву"],
    "Datsun": ["датсун"],
    "Omoda": ["омода"],
    "Exeed": ["эксид", "ексид", "эксит", "exeed"],
    "Lifan": ["лифан"],
    "УАЗ": ["uaz", "уаз"],
    "Belgee": ["белджи", "белги", "белджи"],
    "Cadillac": ["кадиллак", "кадилак"],
    "Changan": ["чанган", "чаньган"],
    "Chrysler": ["крайслер"],
    "Daihatsu": ["дайхатсу", "дайхацу"],
    "Dongfeng": ["донгфенг", "дунфэн"],
    "FAW": ["фав"],
    "FIAT": ["фиат"],
    "GAC": ["гак", "джи эй си", "гак мотор"],
    "GAC Trumpchi": ["трампчи", "гак трампчи", "gac trumpchi"],
    "GMC": ["джиэмси", "джи эм си"],
    "Great Wall": ["greatwall", "грейтуолл", "грейт волл", "грейт вол", "ховер"],
    "Infiniti": ["инфинити", "инфинити"],
    "JAC": ["джак", "жак"],
    "Jaecoo": ["джейку", "джеку", "джайку", "джейко", "джеко"],
    "Jeep": ["джип"],
    "Jetour": ["джетур", "жетур", "джетор", "жетор"],
    "Land Rover": ["landrover", "лэнд ровер", "ленд ровер", "ровер"],
    "Livan": ["ливан"],
    "Lynk & Co": ["lynk co", "lynk&co", "линк ко", "линк энд ко", "линк и ко"],
    "Oshan": ["ошан", "аушан", "очан"],
    "Porsche": ["порше"],
    "Ravon": ["равон"],
    "SsangYong": ["санг енг", "сангйонг", "ссангйонг", "ссанг енг"],
    "Tank": ["танк"],
    "Tenet": ["тенет"],
    "Volvo": ["вольво"],
    "Voyah": ["воя", "войя", "воях"],
    "Zeekr": ["зикр", "зикер", "зикр"],
    "Tesla": ["тесла"],
    "Genesis": ["генезис", "дженезис"],
    "Jaguar": ["ягуар", "джагуар"],
    "MINI": ["mini", "мини"],
    "SEAT": ["сеат", "сиат"],
    "BAIC": ["baic", "баик", "баик", "бэйк", "бейк"],
    "BYD": ["byd", "бид", "би вай ди", "биуайди"],
    "Kaiyi": ["каи", "кайи", "каий", "kaiyi"],
    "Haima": ["хайма"],
    "Aito": ["aito", "айто", "аито"],
    "Xcite": ["иксайт", "ксайт", "xcite"],
    "ГАЗ": ["gaz", "газ"],
    "ЗАЗ": ["zaz", "заз", "запорожец"],
    "Москвич": ["moskvich", "москвич"]
  };

  const catalog = {
    "Aito": ["M5", "M5 EV", "M7", "M7 EV", "M9", "M9 EV"],
    "Audi": ["A1", "A3", "A4", "A4 allroad", "A5", "A6", "A6 allroad", "A7", "A8", "Q2", "Q3", "Q4 e-tron", "Q5", "Q5 e-tron", "Q7", "Q8", "e-tron", "e-tron GT", "TT", "R8", "RS3", "RS4", "RS5", "RS6", "RS7", "RS Q3", "RS Q8", "S3", "S4", "S5", "S6", "S7", "S8", "SQ5", "SQ7", "SQ8"],
    "BAIC": ["BJ20", "BJ30", "BJ40", "BJ40 Plus", "BJ60", "BJ80", "BJ90", "X25", "X35", "X55", "X65", "X7", "U5 Plus", "U7 Plus", "D20", "D50", "D60", "D70", "D80", "CC", "Senova", "Warrior", "Ace M7", "Weiwang M20", "Weiwang M30", "Weiwang M50", "Weiwang M60", "EU-Series", "EX-Series", "EC-Series", "S5"],
    "BMW": ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "8 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "XM", "i3", "i4", "i5", "i7", "iX", "iX1", "iX3", "Z4", "M2", "M3", "M4", "M5", "M8", "X3 M", "X4 M", "X5 M", "X6 M", "2 Series Active Tourer", "2 Series Gran Tourer"],
    "BYD": ["Qin", "Qin Plus", "Qin L", "Han", "Han EV", "Seal", "Seal 05", "Seal 06", "Seal 07", "Dolphin", "Seagull", "Yuan", "Yuan Plus", "Yuan Up", "Song", "Song Pro", "Song Plus", "Song L", "Tang", "Frigate 07", "Destroyer 05", "Sea Lion 05", "Sea Lion 07", "E1", "E2", "E3", "E5", "E6", "M3", "M6", "D1", "Song MAX"],
    "Cadillac": ["CT4", "CT5", "CT6", "XT4", "XT5", "XT6", "Escalade", "Escalade ESV", "Lyriq", "Optiq", "Celestiq", "XT7"],
    "Changan": ["CS15", "CS35", "CS35 Plus", "CS55", "CS55 Plus", "CS75", "CS75 Plus", "CS75 FL", "CS85 Coupe", "CS95", "UNI-K", "UNI-T", "UNI-Z", "UNI-V", "Eado", "Eado Plus", "Eado DT", "Alsvin", "Raeton", "Raeton Plus", "Raeton CC", "Yida", "Benben Mini", "Lumin", "Deepal SL03", "Deepal S7", "Avatr 11", "Avatr 12", "Qiyuan A05", "Qiyuan A06", "Qiyuan A07", "Qiyuan Q05", "Auchan X5", "Auchan X7", "Auchan Z6", "LingXuan", "Joice", "Ruixing M60", "Ruixing M70", "Ruixing M80", "Ruixing M90"],
    "Chery": ["QQ", "QQ Ice Cream", "Little Ant", "eQ1", "Big Ant", "eQ7", "Arrizo 3", "Arrizo 5", "Arrizo 5 Plus", "Arrizo 7", "Arrizo 8", "Arrizo EX", "Arrizo GX", "Tiggo 2", "Tiggo 2 Pro", "Tiggo 3", "Tiggo 3x", "Tiggo 3xe", "Tiggo 4", "Tiggo 4 Pro", "Tiggo 5", "Tiggo 5x", "Tiggo 7", "Tiggo 7 Pro", "Tiggo 7 Pro Max", "Tiggo 8", "Tiggo 8 Pro", "Tiggo 8 Pro Max", "Tiggo 8 L", "Tiggo 9", "Tiggo 9 C-DM", "Fengyun A8", "Fengyun T9", "Fengyun T10", "Amulet", "Fora", "Bonus", "Very", "indiS", "Eastar", "M11", "CrossEastar"],
    "Chevrolet": ["Spark", "Aveo", "Cruze", "Malibu", "Impala", "Sonic", "Bolt EV", "Bolt EUV", "Blazer EV", "Equinox EV", "Silverado EV", "Trailblazer", "Trax", "Equinox", "Blazer", "Traverse", "Tahoe", "Suburban", "Colorado", "Silverado 1500", "Silverado 2500HD", "Silverado 3500HD", "Camaro", "Corvette", "Express", "Niva", "Cobalt", "Lacetti", "Captiva"],
    "Citroen": ["C1", "C2", "C3", "C3 Aircross", "C4", "C4 Cactus", "C4 Picasso", "C5", "C5 Aircross", "C6", "DS3", "DS4", "DS5", "Berlingo", "Jumpy", "Jumper", "SpaceTourer", "Ami", "Ë-C4", "ë-Berlingo", "ë-SpaceTourer", "Grand C4 Picasso", "C-Crosser", "C-Zero"],
    "Daewoo": ["Matiz", "Tico", "Damas", "Labo", "Nexia", "Espero", "Lanos", "Nubira", "Leganza", "Magnus", "Tacuma", "Kalos", "Gentra", "Winstorm", "Lacetti", "Tosca", "Alpheon", "Statesman"],
    "Daihatsu": ["Mira", "Move", "Tanto", "Rocky", "Terios", "Be-go", "Copen", "Boon", "Xenia", "Sirion", "Cuore", "Charade", "Applause", "Feroza", "Gran Move", "Materia", "Taft"],
    "Exeed": ["TX", "TXL", "LX", "VX", "RX", "RX C-DM", "Starlight", "Exlantix ES", "Exlantix ET", "VX L", "TLX"],
    "FAW": ["Bestune B30", "Bestune B50", "Bestune B70", "Bestune B90", "Bestune T33", "Bestune T55", "Bestune T77", "Bestune T90", "Bestune T99", "Bestune X40", "Bestune X60", "Bestune X80", "Bestune NAT", "Bestune Pony", "Hongqi H5", "Hongqi H6", "Hongqi H7", "Hongqi H9", "Hongqi L5", "Hongqi HS3", "Hongqi HS5", "Hongqi HS7", "Hongqi E-HS9", "Hongqi EH7", "Hongqi HQ9", "J6", "J7", "V80"],
    "Ford": ["Ka", "Fiesta", "Focus", "Mondeo", "Fusion", "EcoSport", "Kuga", "Escape", "Edge", "Explorer", "Expedition", "Bronco Sport", "Bronco", "Mustang", "Mustang Mach-E", "Ranger", "F-150", "F-250", "F-350", "Maverick", "Transit", "Transit Connect", "E-Transit", "F-150 Lightning", "Galaxy", "S-MAX", "C-MAX", "Puma", "Territory", "Everest", "Tourneo"],
    "GAC": ["GS3", "GS4", "GS4 Plus", "GS4 Coupe", "GS5", "GS7", "GS8", "Shadow Cool", "Shadow Leopard", "GA3", "GA3S", "GA4", "GA6", "GA8", "Empow", "GM6", "GM8", "GN8", "M8", "E9", "Aion S", "Aion Y", "Aion V", "Aion LX", "Hyper GT", "Hyper SSR", "Hyper HT", "Aion RT", "EMKOO", "E8"],
    "Geely": ["Atlas", "Atlas Pro", "Boyue", "Boyue L", "Coolray", "Emgrand", "Emgrand L", "Emgrand GS", "Emgrand GT", "Emgrand X7", "Vision", "Xingrui", "Binrui", "GC6", "GC7", "Icon", "Monjaro", "Tugella", "Xingyue", "Xingyue L", "Okavango", "Haoyue", "Jiaji", "Farizon Xingxiang V6E", "Geometry A", "Geometry C", "Geometry E", "Geometry G6", "Galaxy L6", "Galaxy L7", "Galaxy E5", "Galaxy E8", "Panda Mini", "Zeekr 001", "Zeekr 007", "Zeekr 009", "Zeekr X", "Zeekr 7X", "Lynk & Co 01", "Lynk & Co 03", "Lynk & Co 05", "Lynk & Co 06", "Lynk & Co 08", "Lynk & Co 09"],
    "Genesis": ["G70", "G80", "G90", "GV60", "GV70", "GV80", "GV90", "Electrified G70", "Electrified G80", "Electrified GV70", "X Gran Berlinetta", "X Gran Coupe"],
    "Great Wall": ["Hover H3", "Hover H5", "Hover H6", "Wingle 3", "Wingle 5", "Wingle 6", "Wingle 7", "Poer", "King Kong", "Cannon", "Shanhai Poer", "Shanhai Cannon", "Orlando", "Sailor", "Deer", "SoCool", "Pao"],
    "Haima": ["M3", "M6", "M8", "S5", "S7", "S8", "7X", "8S", "E3", "Aishang EV", "Love Me EV", "6P", "2EV", "7P"],
    "Haval": ["Chitu", "Cool Dog", "Dargo", "Dargo X", "F5", "F7", "F7x", "H2", "H2s", "H3", "H4", "H5", "H6", "H6 Coupe", "H6 GT", "H7", "H8", "H9", "Jolion", "Jolion Pro", "M6", "M6 Plus", "Shenshou", "Xiaolong", "Xiaolong Max", "Raptor", "Raptor Hi4", "First Love", "Concept B", "H-Concept"],
    "Honda": ["Fit", "Jazz", "Civic", "Accord", "Insight", "Clarity", "HR-V", "Vezel", "CR-V", "ZR-V", "Pilot", "Passport", "Prologue", "Ridgeline", "Odyssey", "Freed", "Stepwgn", "N-Box", "N-One", "N-WGN", "City", "Amaze", "Brio", "WR-V", "BR-V", "e", "e:Ny1", "CR-Z", "Element", "Crosstour"],
    "Hyundai": ["i10", "i20", "i30", "i40", "Elantra", "Avante", "Sonata", "Grandeur", "Azera", "Creta", "ix25", "Tucson", "ix35", "Santa Fe", "Palisade", "Kona", "Venue", "Bayon", "Nexo", "Ioniq", "Ioniq 5", "Ioniq 6", "Ioniq 7", "Kona Electric", "Niro", "Niro EV", "Niro PHEV", "Stargazer", "Custo", "Alcazar", "Aura", "Verna", "Grand i10", "i20 N", "Kona N", "Elantra N", "i30 N", "Veloster", "Veloster N", "Genesis Coupe", "Solaris", "Getz"],
    "Infiniti": ["Q30", "Q50", "Q60", "QX30", "QX50", "QX55", "QX60", "QX70", "QX80", "EX25", "EX35", "EX37", "FX35", "FX37", "FX45", "FX50", "G25", "G35", "G37", "M25", "M35", "M37", "M45", "M56", "Q45", "Q70", "QX4", "JX35", "ESQ"],
    "Jaecoo": ["J7", "J8"],
    "Jaguar": ["XE", "XF", "XJ", "F-Pace", "E-Pace", "I-Pace", "F-Type", "XKR", "XFR", "XJR", "S-Type", "X-Type", "XK8", "XJ220", "D-Type", "E-Type", "C-X75", "Project 7"],
    "Jeep": ["Wrangler", "Wrangler Unlimited", "Gladiator", "Grand Cherokee", "Grand Cherokee L", "Cherokee", "Compass", "Renegade", "Avenger", "Recon", "Wagoneer", "Grand Wagoneer", "Commander", "Patriot", "Liberty", "Grand Wagoneer SJ", "J-Series", "Scrambler", "CJ-5", "CJ-7", "CJ-8"],
    "Jetour": ["X70", "X70M", "X70S", "X70 Plus", "X70 Coupe", "X90", "X90 Plus", "X95", "Dashing", "Traveler", "Shanhai L6", "Shanhai L7", "Shanhai T1", "Shanhai T2", "T1", "T2", "X50", "X90 Pro", "Dasheng"],
    "Kaiyi": ["E5", "E5 EV", "X3", "X3 Pro", "X7", "X7 Kunlun", "Shiyue", "Xuanjie", "Xuanjie Pro EV", "V7", "Showjet", "Cowin X3", "Cowin X5", "Cowin V3"],
    "Kia": ["Picanto", "Rio", "Rio X", "Cerato", "Forte", "K3", "K5", "Optima", "K7", "Cadenza", "K8", "K9", "Quoris", "Stinger", "Soul", "Seltos", "Sonet", "Sportage", "Sorento", "Telluride", "Mohave", "Carnival", "Carens", "Venga", "Ceed", "ProCeed", "XCeed", "EV3", "EV4", "EV5", "EV6", "EV9", "Niro", "Niro EV", "Niro PHEV", "Soul EV", "Ray", "Morning", "Avella", "Pride", "Sephia", "Shuma", "Magentis", "Opirus", "Borrego"],
    "Lada (ВАЗ)": ["2101", "2102", "2103", "2104", "2105", "2106", "2107", "2108", "2109", "21099", "2110", "2111", "2112", "2113", "2114", "2115", "1111 Oka", "Niva", "Niva Legend", "Niva Travel", "Niva Urban", "Kalina", "Kalina Cross", "Kalina Sport", "Granta", "Granta Sport", "Granta Cross", "Granta Drive Active", "Vesta", "Vesta SW", "Vesta Cross", "Vesta Sport", "Vesta NG", "Largus", "Largus Cross", "Largus Van", "XRAY", "XRAY Cross", "4x4", "4x4 Urban", "Aura", "e-Largus", "Evolution", "Revolution", "Priora"],
    "Land Rover": ["Defender", "Defender 90", "Defender 110", "Defender 130", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Sport", "Range Rover Velar", "Range Rover Evoque", "Freelander", "Freelander 2", "LR2", "LR3", "LR4", "Series I", "Series II", "Series III", "Range Rover Classic", "Discovery Series I", "Discovery Series II", "Defender Works V8", "Range Rover SV"],
    "Lexus": ["CT", "IS", "ES", "GS", "LS", "RC", "LC", "UX", "NX", "RX", "GX", "LX", "TX", "RZ", "LFA", "SC", "HS", "XM", "GS F", "RC F", "IS F", "UX 250h", "NX 350h", "RX 450h", "GX 460", "LX 600", "TX 350", "TX 500h"],
    "Lifan": ["Smily", "Breez", "Solano", "Solano II", "Cebrium", "X50", "X60", "X70", "X80", "Myway", "320", "520", "620", "720", "820", "Xuanlang", "Lotto", "650 EV", "820 EV", "330 EV", "530 EV", "630 EV", "650", "Murman", "Fengshun", "Xuanlang EV"],
    "Mazda": ["2", "3", "5", "6", "323", "626", "929", "MX-3", "MX-5", "MX-6", "MX-30", "CX-3", "CX-30", "CX-4", "CX-5", "CX-50", "CX-60", "CX-70", "CX-8", "CX-9", "CX-90", "RX-7", "RX-8", "B-Series", "Tribute", "MPV", "Premacy", "Demio", "Atenza", "Axela", "Biante", "Carol", "Flair", "Laputa", "Proceed", "Roadster", "Verisa", "Millenia", "Navajo", "Protege", "Familia", "Capella", "Cronos", "Efini MS-6", "Efini MS-8", "Lantis", "Sentia", "Xedos 6", "Xedos 9"],
    "Mercedes-Benz": ["A-Class", "B-Class", "C-Class", "CLA", "CLS", "E-Class", "S-Class", "GLA", "GLB", "GLC", "GLE", "GLS", "G-Class", "EQA", "EQB", "EQC", "EQE", "EQE SUV", "EQS", "EQS SUV", "EQG", "EQT", "EQV", "AMG GT", "AMG GT 4-Door", "SL", "SLC", "SLK", "CLC", "CLK", "CL", "ML", "R-Class", "GL", "GLK", "V-Class", "Vito", "Sprinter", "Citan", "T-Class", "X-Class", "Maybach S-Class", "Maybach GLS", "Maybach EQS SUV", "Citan Tourer", "eVito", "eSprinter", "Vaneo", "Viano"],
    "MINI": ["One", "Cooper", "Cooper S", "Cooper SE", "John Cooper Works", "3-door", "5-door", "Convertible", "Clubman", "Countryman", "Paceman", "Coupe", "Roadster", "Aceman", "Aceman S", "Cooper Electric", "Countryman Electric", "Aceman Electric"],
    "Mitsubishi": ["Mirage", "Colt", "Lancer", "Galant", "Eclipse", "3000GT", "Pajero", "Pajero Sport", "Pajero Mini", "Pajero iO", "Montero", "Outlander", "Outlander PHEV", "Eclipse Cross", "ASX", "RVR", "Delica", "Delica D:2", "Delica D:3", "Delica D:5", "Xpander", "Xpander Cross", "Attrage", "Space Star", "Carisma", "Sigma", "Diamante", "Verada", "Magna", "Triton", "L200", "Strada", "Raider", "i-MiEV", "eK Wagon", "eK Space", "eK Cross", "eK X", "Minica", "Minicab", "Town Box", "Toppo", "eK", "Grandis", "Chariot", "Space Wagon", "Space Runner", "Space Gear", "Nativa", "FTO", "GTO", "Starion", "Cordia", "Tredia", "Precis", "Expo", "Mighty Max", "Diamante Wagon", "Endeavor", "i", "Outlander Sport"],
    "Nissan": ["Micra", "March", "Note", "Versa", "Almera", "Sentra", "Sylphy", "Altima", "Maxima", "Leaf", "Ariya", "Juke", "Qashqai", "Rogue", "Rogue Sport", "X-Trail", "Murano", "Pathfinder", "Armada", "Patrol", "Terrano", "Kicks", "Magnite", "Navara", "Frontier", "Titan", "NV200", "NV300", "NV400", "e-NV200", "Serena", "Elgrand", "Quest", "Cube", "Tiida", "Livina", "Bluebird", "Sunny", "Cefiro", "Laurel", "Skyline", "GT-R", "Z", "370Z", "350Z", "300ZX", "240Z", "280Z", "260Z", "100NX", "200SX", "300C", "Pulsar", "Primera", "Stanza", "Axxess", "Vanette", "Urvan", "Caravan", "Atlas", "Cabstar", "Clipper", "Roox", "Dayz", "Sakura", "X-Trail Hybrid", "Kicks e-POWER", "Note e-POWER", "Serena e-POWER", "Teana"],
    "Omoda": ["C5", "C5 EV", "S5", "GT"],
    "Opel": ["Corsa", "Astra", "Insignia", "Vectra", "Omega", "Calibra", "Tigra", "Meriva", "Zafira", "Combo", "Vivaro", "Movano", "Antara", "Mokka", "Mokka-e", "Crossland", "Grandland", "Cascada", "Adam", "Karl", "Ampera", "Ampera-e", "Agila", "Speedster", "GT", "Monza", "Senator", "Rekord", "Kadett", "Ascona", "Manta", "Campo", "Frontera", "Monterey", "Sintra", "Signum", "Astra GTC", "Astra OPC", "Corsa OPC", "Insignia OPC", "Astra Sports Tourer", "Zafira Life", "Combo Life", "Grandland X", "Crossland X", "Mokka X", "Vivaro-e", "Movano-e"],
    "Oshan": ["A600", "A800", "Cosmos", "X5", "X7", "Z6", "Cos Pro", "Corse", "X7 Plus", "X70A", "X90", "X95", "COS1°", "COS3°", "COS5°", "EV", "QiYue", "Changxing", "Ruixing"],
    "Peugeot": ["106", "107", "108", "206", "207", "208", "306", "307", "308", "406", "407", "408", "508", "607", "806", "807", "1007", "3008", "4007", "4008", "5008", "Partner", "Bipper", "Expert", "Traveller", "Boxer", "iOn", "e-208", "e-2008", "e-308", "e-3008", "e-5008", "e-Expert", "e-Traveller", "e-Partner", "Rifter", "Landtrek", "508 PSE", "308 SW", "508 SW", "3008 Hybrid", "5008 Hybrid", "408 Fastback", "2008", "308 GTi", "508 RXH", "RCZ", "Hoggar", "605", "405", "309", "205", "104", "504", "505", "604", "P4", "J5", "J7", "J9"],
    "Porsche": ["911", "718 Boxster", "718 Cayman", "Panamera", "Taycan", "Macan", "Cayenne", "918 Spyder", "Carrera GT", "959", "928", "944", "968", "924", "356", "550 Spyder", "904", "906", "907", "908", "910", "917", "936", "956", "962", "911 GT3", "911 GT2", "911 Turbo", "911 Targa", "Boxster S", "Cayman S", "Cayman GT4", "Macan S", "Macan GTS", "Macan Turbo", "Cayenne S", "Cayenne GTS", "Cayenne Turbo", "Cayenne Coupe", "Panamera 4S", "Panamera GTS", "Panamera Turbo", "Taycan 4S", "Taycan Turbo", "Taycan Cross Turismo", "Mission E", "Mission R", "Vision Spyder"],
    "Ravon": ["R2", "R3", "R4", "Nexia R3", "Matiz", "Gentra", "Cobalt", "Spark", "Nexia 3", "R5"],
    "Renault": ["Clio", "Megane", "Laguna", "Scenic", "Espace", "Talisman", "Koleos", "Kadjar", "Austral", "Arkana", "Captur", "Kaptur", "Duster", "Duster Oroch", "Sandero", "Sandero Stepway", "Logan", "Symbol", "Thalia", "Twingo", "Zoe", "Kangoo", "Trafic", "Master", "Dokker", "Lodgy", "Alaskan", "Oroch", "Kwid", "Triber", "Kiger", "Austral E-Tech", "Megane E-Tech", "Scenic E-Tech", "Arkana E-Tech", "Captur E-Tech", "Clio E-Tech", "Twingo Electric", "Kangoo E-Tech", "Master E-Tech", "Trafic E-Tech", "4", "5", "6", "8", "10", "12", "14", "16", "17", "18", "19", "20", "21", "25", "30", "Fuego", "Alliance", "Encore", "Le Car", "Sport Spider", "Avantime", "Vel Satis", "Wind", "Fluence", "Latitude", "Samsung SM3", "Samsung SM5", "Samsung SM7", "Samsung QM3", "Samsung QM5", "Samsung QM6", "Samsung XM3"],
    "SEAT": ["Ibiza", "Leon", "Toledo", "Cordoba", "Altea", "Altea XL", "Altea Freetrack", "Ateca", "Arona", "Tarraco", "Mii", "Malaga", "Ronda", "Terra", "Inca", "Marbella", "Fura", "Ritmo", "Exeo", "Bocanegra", "Cupra Formentor", "Cupra Leon", "Cupra Ateca", "Cupra Born", "Cupra Tavascan", "Cupra UrbanRebel", "Cupra DarkRebel"],
    "Skoda": ["Fabia", "Felicia", "Octavia", "Superb", "Rapid", "Scala", "Kamiq", "Karoq", "Kodiaq", "Kodiaq GT", "Kodiaq Coupe", "Enyaq iV", "Enyaq Coupe iV", "Citigo", "Citigo-e iV", "Roomster", "Yeti", "Octavia Scout", "Superb Scout", "Kodiaq Scout", "Karoq Scout", "Kamiq Scout", "Octavia RS", "Superb RS", "Kodiaq RS", "Karoq RS", "Fabia RS", "Scala RS", "Kamiq RS", "Enyaq RS iV", "Vision iV", "Vision IN", "Vision C", "Vision E", "Vision D", "MissionL", "Joyster", "Atero", "Tudor", "Favorit", "Forman", "Pick-up"],
    "SsangYong": ["Korando", "Tivoli", "XLV", "Rexton", "Rexton Sports", "Rexton Sports Khan", "Musso", "Musso Grand", "Actyon", "Kyron", "Chairman", "Chairman W", "Chairman H", "Stavic", "Rodius", "Turismo", "Korando C", "Korando Sports", "Actyon Sports", "Nomad", "Istana", "Kallista", "Divo", "XAV", "XAVL", "e-XIV", "e-SIV", "Torres", "Torres EVX", "Grandmaster"],
    "Subaru": ["Justy", "Rex", "Vivio", "Pleo", "R1", "R2", "Sambar", "Domingo", "Libero", "Leone", "Legacy", "Outback", "Impreza", "WRX", "WRX STI", "Forester", "Tribeca", "B9 Tribeca", "Baja", "SVX", "XT", "BRZ", "Solterra", "Crosstrek", "XV", "Ascent", "Levorg", "Exiga", "Traviq", "Dex", "Stella", "Lucra", "Chiffon", "Sambar Truck", "Sambar Van", "Dias Wagon", "Pleo Plus", "R1e", "Plug-in Stella", "WRX S4", "Levorg GT", "Outback Sport", "Impreza WRX", "Forester XT", "Legacy GT", "B9 Scrambler", "Alcyone"],
    "Suzuki": ["Alto", "Celerio", "Swift", "Baleno", "Ignis", "Dzire", "Ciaz", "Ertiga", "XL6", "Vitara", "S-Cross", "SX4", "Grand Vitara", "Jimny", "Jimny Sierra", "Carry", "Every", "Wagon R", "Spacia", "Hustler", "Lapin", "Solio", "Landy", "Xbee", "Across", "Swace", "Jimny Sierra 5-Door", "e-Vitara", "Fronx", "Grand Vitara Hybrid", "Jimny 5-Door", "Ciaz Hybrid", "Ertiga Hybrid", "XL7", "APV", "Carry Futura", "Every Wagon", "MR Wagon", "Palette", "Splash", "Liana", "Aerio", "Esteem", "Cultus", "Mehran", "Bolan", "Ravi", "Potohar", "FX", "SS80", "SS120", "GV", "Forenza", "Reno", "Verona", "SX4 Sedan", "Kizashi", "Equator", "X-90", "Sidekick", "Samurai", "SJ410", "SJ413", "Sierra", "Vitara Brezza", "S-Presso", "Swift Sport", "Swift Hybrid", "Celerio Hybrid", "Wagon R Hybrid", "Spacia Hybrid", "Solio Hybrid", "Hustler Hybrid", "Lapin Hybrid", "Every Electric", "eVX"],
    "Tank": ["300", "300 Hi4-T", "400", "400 Hi4T", "500", "500 PHEV", "700", "800", "300 Cyberpunk", "300 Off-Road", "500 Luxury", "700 PHEV", "800 PHEV", "600", "900"],
    "Tenet": ["T7", "T9"],
    "Tesla": ["Roadster", "Model S", "Model 3", "Model X", "Model Y", "Model 2", "Cybertruck", "Semi", "Optimus"],
    "Toyota": ["Yaris", "Yaris Cross", "Vitz", "Aqua", "Prius", "Prius c", "Prius v", "Prius Prime", "Corolla", "Corolla Cross", "Camry", "Avalon", "Crown", "Crown Sport", "Crown Sedan", "Crown Signia", "Mirai", "bZ4X", "bZ3", "C-HR", "RAV4", "RAV4 Prime", "Venza", "Harrier", "Kluger", "Highlander", "Grand Highlander", "Sequoia", "4Runner", "Land Cruiser Prado", "Land Cruiser", "Land Cruiser 70", "Land Cruiser 200", "Land Cruiser 300", "Century", "Alphard", "Vellfire", "Noah", "Voxy", "Esquire", "Sienna", "Granvia", "Hiace", "Proace", "Dyna", "Toyoace", "Hilux", "Tacoma", "Tundra", "Cressida", "Mark II", "Mark X", "Chaser", "Cresta", "Verossa", "Altezza", "Brevis", "Progrès", "Origin", "Sera", "Soarer", "Supra", "MR2", "MR-S", "Celica", "Carina", "Corona", "Starlet", "Tercel", "Paseo", "Previa", "Estima", "Ipsum", "Picnic", "Avensis", "Auris", "Verso", "Urban Cruiser", "Aygo", "iQ", "GT86", "GR86", "GR Supra", "GR Corolla", "GR Yaris", "FJ Cruiser", "Mega Cruiser", "Camry Hybrid", "Highlander Hybrid", "Avalon Hybrid", "Corolla Hybrid", "RAV4 Hybrid", "Venza Hybrid", "Sienna Hybrid", "Sequoia Hybrid", "Tundra Hybrid", "Tacoma Hybrid", "Prius AWD-e", "RAV4 AWD-i", "Highlander AWD", "Corolla AWD", "Camry AWD", "Allion"],
    "Volkswagen": ["Polo", "Golf", "Jetta", "Passat", "Arteon", "Phaeton", "ID.3", "ID.4", "ID.5", "ID.6", "ID.7", "ID. Buzz", "ID. Aero", "T-Cross", "Taigo", "T-Roc", "Tiguan", "Tiguan Allspace", "Touareg", "Atlas", "Teramont", "Talagon", "Viloran", "Caddy", "Transporter", "Multivan", "Amarok", "Saveiro", "up!", "e-up!", "Lupo", "Fox", "Bora", "Lavida", "Sagitar", "Magotan", "Phideon", "Teramont X", "Tayron", "Tharu", "Taos", "Nivus", "Virtus", "Voyage", "Gol", "Parati", "Saveiro Cross", "CrossFox", "SpaceFox", "Suran", "Polo Sedan", "Golf Variant", "Passat Variant", "Atlas Cross Sport"],
    "Volvo": ["240", "740", "940", "850", "S40", "V40", "S60", "V60", "S70", "V70", "S80", "S90", "V90", "C30", "C70", "XC40", "XC60", "XC70", "XC90", "EX30", "EX90", "EC40", "EM90", "C40 Recharge", "XC40 Recharge", "XC60 Recharge", "XC90 Recharge", "S60 Recharge", "V60 Recharge", "S90 Recharge", "V90 Recharge", "Polestar 1", "Polestar 2", "Polestar 3", "Polestar 4", "140", "164", "260", "340", "360", "440", "460", "480", "760", "780", "960", "Amazon", "PV444", "PV544", "P1800", "V60 Cross Country", "V90 Cross Country"],
    "Voyah": ["Free", "Free PHEV", "Free EV", "Dream", "Dream PHEV", "Dream EV", "Passion", "Passion PHEV", "Passion EV", "iFree", "iDream", "iPassion", "Free Long Range", "Dream Long Range", "Passion Long Range", "Free Performance", "Dream Performance", "Passion Performance"],
    "Xcite": ["X-Cross 3", "X-Cross 5", "X-Cross 7", "X-Cross 8", "X-Cross 3 EV", "X-Cross 5 EV", "X-Cross 7 EV", "X-Cross 8 EV"],
    "ЗАЗ": ["965", "966", "968", "968A", "968M", "1102 Tаврия", "1103 Славута", "1105 Дана", "11055", "11057", "Forza", "Vida", "Chance", "Sens", "Lanos", "Slavuta", "Tavria Nova", "Pick-Up", "Van", "21099", "2110", "2111", "2112", "2113", "2114", "2115", "1111 Oka"],
    "Москвич": ["3", "3e", "6", "6e", "M70", "2140", "2141", "2137", "2715", "2734", "400", "401", "402", "403", "407", "408", "410", "411", "412", "426", "427", "433", "434"],
    "УАЗ": ["3151", "31512", "31514", "31519", "3153", "3159", "3160", "3162", "3163", "3165", "3741", "3909", "39094", "39095", "39099", "3962", "2206", "2360", "2363", "2772", "3303", "33036", "33039", "Патриот", "Патриот Спорт", "Пикап", "Профи", "Профи ГАЗ", "Хантер", "Хантер Классик", "СГР Буханка", "Буханка Фургон", "Буханка Микроавтобус", "469", "469Б"]
  };

  const extraCatalog = {
    "Toyota": ["Funcargo", "Vista Ardeo", "Nadia", "Corolla Runx", "Passo", "Town Ace Noah", "Wish", "Corolla Fielder", "Vista", "Raum", "Ist", "Corolla Axio", "Ractis", "Isis", "Rise", "Allion", "Allex", "Premio", "Trezia", "Roomy", "Probox", "Spacio", "Sienta", "Platz", "Boon", "Vellfire", "Duet", "Echo", "Caldina", "Estima Emina"],
    "Nissan": ["Almera Tino", "Tino", "Wingroad", "Liberty", "Tiida Latio", "Dayz Roox", "NV200", "Primera", "Bluebird Sylphy", "NP300", "Almera Classic"],
    "Mazda": ["Familia S-Wagon", "Atenza", "Axela", "Bongo", "Tribute", "Biante"],
    "Honda": ["Stepwgn", "Stepwgn Spada", "N-WGN", "Fit Shuttle", "N-Box Slash", "Shuttle", "HR-V", "Mobilio Spike", "N-Box", "Airwave", "Torneo", "Breeze", "Freed", "Jade"],
    "Mitsubishi": ["Dingo", "Pajero Pinin", "Pajero iO", "Delica D5", "Airtrek", "Grandis"],
    "Hyundai": ["Verna", "H-1", "Grand Starex", "Equus", "Avante", "Matrix", "Atos", "Coupe", "ix55"],
    "Kia": ["Spectra", "Morning", "Rio X-Line", "Rio X", "Mohave", "Opirus"],
    "Lada (ВАЗ)": ["2115 Samara", "2114 Samara", "2121 4x4 Urban", "2121 4x4 Lynx", "4x4 Niva", "Niva Legend", "Niva Travel"],
    "Chevrolet": ["Lacetti", "Cruze HR", "Matiz Creative", "Viva", "TrailBlazer"],
    "Citroen": ["C-Crosser", "C-Elysee", "C-Max"],
    "Daewoo": ["Nexia", "Matiz Creative"],
    "Datsun": ["on-DO", "mi-DO"],
    "Geely": ["Emgrand EC7", "Emgrand 7", "MK Cross", "CK Otaka"],
    "Great Wall": ["Hover H3", "Hover H5", "Hover H6"],
    "Haval": ["F7x", "Haval H9"],
    "Lifan": ["Myway", "Murman", "Breez"],
    "Mercedes-Benz": ["GLS-Class AMG", "GLS-Class Coupe", "GLK-Class", "GLE-Class", "M-Class", "A-Class", "B-Class", "C-Class", "E-Class", "GLA-Class"],
    "Peugeot": ["Crosser"],
    "Renault": ["Logan Stepway", "Sandero Stepway", "Samsung XM3", "Samsung QM6"],
    "Suzuki": ["SX4", "XL7", "Kizashi", "Solio", "Escudo"],
    "Volkswagen": ["Passat CC", "Golf Plus", "Caravelle", "Scirocco", "Rogue Sport"],
    "Subaru": ["Pleo Plus", "Torneo"],
    "Infiniti": ["JX"],
    "Land Rover": ["Range Rover Evoque"],
    "Chery": ["Tiggo T11", "Kimo A1", "M11 A3", "Very", "Bonus A13", "IndiS C18D"],
    "Changan": ["CS35 Plus", "CS55 Plus", "CS75", "CS95", "UNI-T", "UNI-S"],
    "FAW": ["Bestune X40", "Bestune T55", "Bestune B70", "Bestune T99"],
    "Exeed": ["RX", "LX"],
    "Jaecoo": ["J8"],
    "Jetour": ["Dashing"],
    "Tank": ["300", "500", "900"],
    "Zeekr": ["001", "9X"],
    "JAC": ["JS6", "T6"],
    "Kaiyi": ["E5"],
    "Omoda": ["C5"],
    "ЗАЗ": ["Chance"],
    "ГАЗ": ["Volga Siber"]
  };

  Object.entries(extraCatalog).forEach(([brand, models]) => {
    catalog[brand] = uniq([...(catalog[brand] || []), ...models]);
  });

  const manualModelAliases = {
    "Tiguan": ["тигуан", "тиг", "тига", "фольц тигуан"], "Polo": ["поло"], "Passat": ["пассат", "пасат", "пасат б", "пассат б"], "Jetta": ["джетта", "джета"],
    "Touareg": ["туарег", "таурег", "тур"], "Vesta": ["веста", "вэста"], "Granta": ["гранта", "грантa"], "Camry": ["камри", "кемри", "камрюха"],
    "Corolla": ["королла", "корола", "каролла", "карола"], "Corolla Cross": ["королла кросс", "корола кросс"], "RAV4": ["rav", "рав4", "рав", "рав 4", "равчик"],
    "Sportage": ["спортейдж", "спортаж", "спортэдж"], "Solaris": ["солярис", "салярис"], "Creta": ["крета", "крэтa"], "Logan": ["логан"],
    "Rio": ["рио"], "Duster": ["дастер", "дастeр"], "Focus": ["фокус"], "Octavia": ["октавия", "актавия"], "X-Trail": ["икстрейл", "икс трейл", "хтрейл", "х трейл"],
    "Qashqai": ["кашкай", "кашак", "кашкай"], "Priora": ["приора"], "Kalina": ["калина"], "Largus": ["ларгус"],
    "Niva": ["нива"], "Almera": ["альмера", "алмера"], "Teana": ["теана", "тиана"], "Murano": ["мурано"],
    "Ceed": ["сид", "сиед"], "Cerato": ["церато", "серато"], "Optima": ["оптима"], "Elantra": ["элантра"],
    "Tucson": ["туссан", "туcсан", "тусан", "туксон", "тюксон"], "Santa Fe": ["санта фе", "сантафе"], "Sandero": ["сандеро"],
    "Kaptur": ["каптур"], "Captur": ["каптюр", "каптур"], "Mondeo": ["мондео"], "Kuga": ["куга"],
    "CX-5": ["сх5", "сх 5", "ц икс 5", "си икс 5"], "Mazda3": ["мазда3", "мазда 3"], "Mazda6": ["мазда6", "мазда 6"],
    "Outlander": ["аутлендер", "аутлэндер", "аут"], "Lancer": ["лансер", "ланцер"], "ASX": ["асх", "а эс икс"], "Civic": ["цивик", "сивик"],
    "CR-V": ["срв", "црв", "цр в", "ср в"], "Forester": ["форестер", "форик"], "Legacy": ["легаси"], "Swift": ["свифт"],
    "Grand Vitara": ["гранд витара", "витара гранд"], "Astra": ["астра"], "Mokka": ["мокка", "мока"], "Cobalt": ["кобальт"],
    "Cruze": ["круз"], "Nexia": ["нексия"], "Matiz": ["матиз"], "Jolion": ["джолион"],
    "Tiggo": ["тигго", "тиго"], "Coolray": ["кулрей", "кулрэй", "кулрай"], "Atlas": ["атлас"], "Allion": ["аллион"],
    "Auris": ["аурис"], "Avensis": ["авенсис"], "C-HR": ["снр", "с нр", "си эйч ар"],
    "Highlander": ["хайлендер", "хай"], "Land Cruiser": ["крузак", "ленд крузер", "лэнд крузер", "лк", "lc"], "Prado": ["прадо", "прадик"],
    "Aqua": ["аква"], "Note": ["ноут"], "Tiida": ["тиида", "тида"], "Juke": ["жук", "джук"], "Pathfinder": ["патфайндер", "патфайндер"],
    "Soul": ["соул", "соул"], "Seltos": ["селтос"], "Sorento": ["соренто", "саренто"], "Stinger": ["стингер"],
    "Getz": ["гетц", "гец"], "Sonata": ["соната"], "Fluence": ["флюенс", "флуенс"], "Megane": ["меган", "меганн"],
    "Kodiaq": ["кодиак"], "Rapid": ["рапид"], "Superb": ["суперб"], "Yeti": ["йети"],
    "Golf": ["гольф"], "Caddy": ["кадди"], "Transporter": ["транспортер"],
    "3 Series": ["трёшка", "трешка", "бмв 3", "третья серия"], "5 Series": ["пятерка", "бмв 5", "пятая серия"],
    "X1": ["х1", "икс1", "икс 1", "бмв х1"], "X3": ["х3", "икс3", "икс 3", "бмв х3"], "X5": ["х5", "икс5", "икс 5", "бмв х5"],
    "C-Class": ["ц класс", "с класс", "цешка"], "E-Class": ["е класс", "ешка"],
    "GLA": ["гла", "gla"], "GLC": ["глц", "glc"], "Aveo": ["авео"], "Captiva": ["каптива"], "Lacetti": ["лачетти", "лачети"],
    "Jolion": ["джолион", "жолион"],
    "Monjaro": ["монжаро", "манджаро"], "Dargo": ["дарго", "дарго"], "Patriot": ["патриот"], "Hunter": ["хантер"], "Bukhanka": ["буханка"]
  };

  const extraManualModelAliases = {
    "2115": ["2115 самара", "пятнашка", "ваз 2115", "лада 2115"],
    "2115 Samara": ["2115 самара", "самара 2115", "пятнашка"],
    "2114 Samara": ["2114 самара", "четырка", "четырнадцатая", "лада 2114", "ваз 2114"],
    "2104": ["ваз 2104", "лада 2104", "четверка"],
    "2107": ["ваз 2107", "лада 2107", "семерка"],
    "2109": ["ваз 2109", "лада 2109", "девятка"],
    "2110": ["ваз 2110", "лада 2110", "десятка"],
    "2112": ["ваз 2112", "лада 2112", "двенашка"],
    "2121 4x4 Urban": ["2121 урбан", "4x4 урбан", "нива урбан"],
    "2121 4x4 Lynx": ["2121 рысь", "4x4 рысь", "нива рысь"],
    "4x4 Niva": ["4x4 нива", "нива 4x4", "2121"],
    "Niva Legend": ["нива легенд", "нива легенда"],
    "Niva Travel": ["нива тревел", "нива travel"],
    "Nexia": ["нексия", "дэу нексия", "деу нексия", "равон нексия"],
    "Camry": ["камри", "тойота камри"],
    "Funcargo": ["функарго", "тойота функарго"],
    "Familia S-Wagon": ["фамилия с вагон", "фамилия s вагон", "фамилия s-wagon", "фамилия свэгон", "мазда фамилия"],
    "Logan": ["логан", "рено логан"],
    "Corsa": ["корса", "опель корса"],
    "Almera Tino": ["альмера тино", "алмера тино"],
    "Tino": ["тино"],
    "Lancer": ["лансер", "митсубиси лансер"],
    "Note": ["ноут", "ниссан ноут"],
    "Vitz": ["витц", "виц", "тойота витц"],
    "Spectra": ["спектра", "киа спектра"],
    "Picanto": ["пиканто", "киа пиканто"],
    "C3": ["с3", "c3", "ситроен с3"],
    "Wingroad": ["вингроад", "вингроуд", "ниссан вингроад"],
    "Lacetti": ["лачетти", "лачети", "шевроле лачетти"],
    "Vista Ardeo": ["виста ардео", "тойота виста ардео"],
    "Atenza": ["атенза", "мазда атенза"],
    "Nadia": ["надя", "тойота надя"],
    "Corolla Runx": ["королла ранкс", "корола ранкс", "ранкс"],
    "Passo": ["пассо", "пасо"],
    "X-Trail": ["икс трейл", "икстрейл", "х трейл", "x trail", "x-trail"],
    "Odyssey": ["одиссей", "хонда одиссей"],
    "Vista": ["виста", "тойота виста"],
    "Verna": ["верна", "хендай верна", "хёндэ верна"],
    "Serena": ["серена", "ниссан серена"],
    "Town Ace Noah": ["таун эйс ноа", "таун айс ноа", "тойота таун эйс ноа"],
    "Stepwgn": ["степвгн", "степвагон", "степ вагон"],
    "Wish": ["виш", "виш"],
    "Liberty": ["либерти", "ниссан либерти"],
    "CR-V": ["ср-в", "срв", "црв", "crv", "cr-v"],
    "on-DO": ["он до", "он-до", "ондo", "датсун он до"],
    "Ipsum": ["ипсум", "тойота ипсум"],
    "Tiida Latio": ["тиида латио", "тида латио"],
    "Corolla Fielder": ["королла филдер", "корола филдер", "филдер"],
    "Teana": ["теана", "тиана"],
    "Passat": ["пассат", "пасат", "фольксваген пассат"],
    "Tucson": ["туссан", "туксон", "тюксон"],
    "N-WGN": ["н-вгн", "н вгн", "n wgn", "n-wgn"],
    "Myway": ["мивэй", "майвей", "лифан мивэй"],
    "Tiggo T11": ["тигго т11", "тигго t11", "тиго т11"],
    "SX4": ["сх4", "sx4", "с икс 4"],
    "Leaf": ["лиф", "ниссан лиф"],
    "Kluger": ["клюгер", "тойота клюгер"],
    "Fit Shuttle": ["фит шаттл", "фит шатл"],
    "Outback": ["аутбэк", "аутбек"],
    "XRAY": ["иксрей", "xray", "x ray", "лада иксрей"],
    "Tiggo 2": ["тигго 2", "тиго 2"],
    "Noah": ["ноа", "тойота ноа"],
    "Santa Fe": ["санта фе", "сантафе"],
    "Tiggo 5": ["тигго 5", "тиго 5"],
    "Ceed": ["сид", "ceed", "сиед"],
    "Axela": ["аксела", "мазда аксела"],
    "Voxy": ["вокси", "вокси"],
    "N-Box Slash": ["н-бокс слэш", "n-box slash", "н бокс слэш"],
    "RX": ["рх", "rx", "лексус рх", "эксид рх"],
    "Shuttle": ["шаттл", "шатл"],
    "Sportage": ["спортейдж", "спортаж"],
    "A3": ["а3", "а 3", "a3", "ауди а3"],
    "Pathfinder": ["патфайндер", "патфайндер"],
    "Tiggo 4": ["тигго 4", "тиго 4"],
    "F7": ["ф7", "f7", "хавал ф7"],
    "Land Cruiser Prado": ["ленд крузер прадо", "лэнд крузер прадо", "крузак прадо", "прадо"],
    "Grand Starex": ["гранд старекс", "старекс"],
    "CX-5": ["сх-5", "сх5", "cx5", "cx-5"],
    "Cerato": ["серато", "церато"],
    "Seltos": ["селтос"],
    "3 Series": ["3 серия", "третья серия", "трешка", "трёшка"],
    "5 Series": ["5 серия", "пятая серия", "пятерка"],
    "Jolion": ["джолион", "жолион"],
    "Escudo": ["эскудо", "сузуки эскудо"],
    "C-HR": ["с-хр", "с хр", "chr", "c-hr", "снр"],
    "Esquire": ["эсквайр", "эскуайр"],
    "Patrol": ["патрол", "ниссан патрол"],
    "Tiggo 8 Pro Max": ["тигго 8 про макс", "тиго 8 про макс"],
    "Harrier": ["харриер", "хариер"],
    "Sorento": ["соренто"],
    "Sorento Prime": ["соренто прайм"],
    "Levorg": ["леворг"],
    "NX": ["нх", "nx", "лексус нх"],
    "LX": ["лх", "lx", "лексус лх"],
    "GX": ["гх", "gx", "лексус гх"],
    "GLS-Class AMG": ["глс класс амг", "gls amg", "глс амг"],
    "Kimo A1": ["кимо", "кимо а1", "a1"],
    "Chance": ["шанс", "заз шанс"],
    "Accent": ["акцент", "хендай акцент"],
    "Solano": ["солано"],
    "Megane": ["меган"],
    "Spark": ["спарк"],
    "Otti": ["отти"],
    "Vectra": ["вектра"],
    "Raum": ["раум"],
    "Ist": ["ист"],
    "Pajero Mini": ["паджеро мини"],
    "Emgrand EC7": ["эмгранд ec7", "эмгранд ес7"],
    "Accord": ["аккорд", "акорд"],
    "Estima": ["эстима"],
    "Dayz Roox": ["дэйз рукс", "дейз рукс"],
    "Zafira": ["зафира"],
    "Kizashi": ["кизаши"],
    "Mark II": ["марк 2", "марк ii", "марк два"],
    "Corolla Axio": ["королла аксио", "корола аксио", "аксио"],
    "Tribeca": ["трайбека"],
    "Ractis": ["рактис"],
    "Move": ["мув", "дайхатсу мув"],
    "Sandero Stepway": ["сандеро степвей", "сандеро степвэй"],
    "Isis": ["исис"],
    "Q3": ["кью3", "q3", "ауди q3"],
    "Stepwgn Spada": ["степвгн спада", "степвагон спада"],
    "Morning": ["монинг", "морнинг"],
    "Rio X-Line": ["рио икс лайн", "rio x-line"],
    "Impreza": ["импреза"],
    "NV200": ["нв200", "nv200"],
    "Equus": ["экус"],
    "Rise": ["райз"],
    "VV6": ["вв6", "vv6", "вей vv6"],
    "Soul": ["соул", "kia soul"],
    "CX-3": ["сх-3", "сх3", "cx3", "cx-3"],
    "Atlas Pro": ["атлас про"],
    "Tiggo 7 Pro Max": ["тигго 7 про макс"],
    "Coolray": ["кулрей"],
    "AX7": ["ах7", "ax7"],
    "Highlander": ["хайлендер"],
    "Tiggo 8 Pro": ["тигго 8 про"],
    "QX70": ["qx70", "ку икс 70", "кью икс 70"],
    "Elgrand": ["эльгранд", "элгранд"],
    "CX-9": ["сх-9", "сх9", "cx9", "cx-9"],
    "Escalade": ["эскалейд"],
    "Touareg": ["туарег", "таурег"],
    "900": ["900"],
    "Capa": ["капа"],
    "Primera": ["примера"],
    "Cruze HR": ["круз хр", "cruze hr"],
    "Allex": ["аллекс", "алекс"],
    "Actyon": ["актион", "актион"],
    "March": ["марч", "ниссан марч"],
    "Roomster": ["румстер"],
    "Premio": ["премио"],
    "Civic": ["цивик", "сивик"],
    "Murman": ["мурман"],
    "GS": ["гс", "gs", "лексус гс"],
    "Fabia": ["фабия"],
    "Passat CC": ["пассат сс", "passat cc"],
    "Kyron": ["кайрон"],
    "Solio": ["солио"],
    "C-Crosser": ["с-кроссер", "c-crosser"],
    "Trezia": ["трезия"],
    "Roomy": ["руми"],
    "Probox": ["пробокс"],
    "Stream": ["стрим"],
    "Touran": ["туран"],
    "Verso": ["версо"],
    "CX-7": ["сх-7", "сх7", "cx7", "cx-7"],
    "Demio": ["демио"],
    "4007": ["4007"],
    "E-Class": ["е-класс", "е класс", "ешка"],
    "Bongo": ["бонго"],
    "Genesis": ["дженезис", "генезис"],
    "CT": ["ст", "ct", "лексус ст"],
    "Tiggo 4 Pro": ["тигго 4 про"],
    "C-Class": ["с-класс", "с класс", "ц класс", "цешка"],
    "Jade": ["джейд"],
    "ES": ["ес", "es", "лексус ес"],
    "H6": ["н6", "h6", "хавал н6"],
    "Land Cruiser": ["ленд крузер", "лэнд крузер", "крузак"],
    "Haval H9": ["хавал н9", "h9", "н9"],
    "300": ["300"],
    "Xingyue L": ["синюэ л", "xingyue l"],
    "Bluebird Sylphy": ["блюберд сильфи", "силфи"],
    "Civic Ferio": ["цивик ферио", "сивик ферио"],
    "Mobilio Spike": ["мобилио спайк"],
    "Porte": ["порте"],
    "Spade": ["спейд"],
    "Insignia": ["инсигния"],
    "Pajero Sport": ["паджеро спорт"],
    "M-Class": ["м-класс", "м класс"],
    "Sienta": ["сиента"],
    "Venza": ["венза"],
    "Delica D5": ["делика д5", "delica d5"],
    "Platz": ["платц"],
    "Boon": ["бун"],
    "Spacio": ["королла спасио", "корола спасио", "спасио"],
    "mi-DO": ["ми до", "ми-до"],
    "Altezza": ["алтезза"],
    "Legend": ["легенд", "легенда"],
    "AD": ["ад", "ad", "ниссан ад"],
    "N-Box": ["н-бокс", "n-box"],
    "N30 Cross": ["н30 кросс", "n30 cross"],
    "Avante": ["аванте"],
    "Urban Cruiser": ["урбан крузер"],
    "Justy": ["джасти"],
    "Orlando": ["орландо"],
    "Hustler": ["хастлер"],
    "Accord Tourer": ["аккорд турер"],
    "Antara": ["антара"],
    "2 Series Active Tourer": ["2 серия актив турер"],
    "Sharan": ["шаран"],
    "Bestune X40": ["бестун х40", "bestune x40"],
    "Malibu": ["малибу"],
    "M6": ["м6", "m6"],
    "A-Class": ["а-класс", "а класс"],
    "Bestune T55": ["бестун т55"],
    "QX60": ["qx60", "кью икс 60"],
    "Elantra": ["элантра"],
    "T5 EVO": ["т5 эво", "t5 evo"],
    "CS55 Plus": ["cs55 plus", "сs55 плюс", "цс55 плюс"],
    "4Runner": ["4раннер", "4 runner", "форраннер"],
    "Bestune B70": ["бестун б70"],
    "JX": ["jx", "джей икс"],
    "UNI-T": ["юни-т", "юни т", "uni-t"],
    "Range Rover Evoque": ["рендж ровер эвок", "эвок"],
    "T-Cross": ["т-кросс", "t-cross"],
    "UNI-S": ["юни-с", "юни с", "uni-s"],
    "Amarok": ["амарок"],
    "H-1": ["н-1", "h-1", "старекс"],
    "Corolla Cross": ["королла кросс", "корола кросс"],
    "Vellfire": ["веллфайр", "велфайр"],
    "J8": ["j8", "джейку j8", "джейку j8"],
    "Palisade": ["палисад"],
    "Range Rover": ["рендж ровер"],
    "Panamera": ["панамера"],
    "9X": ["9х", "9x"],
    "Clio": ["клио"],
    "Dingo": ["динго"],
    "Duet": ["дуэт"],
    "Echo": ["эхо"],
    "Life": ["лайф"],
    "Caldina": ["калдина"],
    "C30": ["с30", "c30"],
    "MPV": ["мпв", "mpv"],
    "Estima Emina": ["эстима эмина"],
    "Grandeur": ["грандер", "грандёр"],
    "Golf Plus": ["гольф плюс"],
    "Succeed": ["саксид", "саксит"],
    "Pajero Pinin": ["паджеро пинин"],
    "Hover H5": ["ховер н5", "hover h5"],
    "Zest": ["зест"],
    "7": ["7"],
    "Torneo": ["торнео"],
    "Maverick": ["маверик"],
    "Fusion": ["фьюжн", "фьюжен"],
    "Tanto": ["танто"],
    "FX45": ["fx45", "эф икс 45"],
    "Thor": ["тор"],
    "Terracan": ["терракан"],
    "CR-Z": ["ср-з", "cr-z", "црз"],
    "Boliger": ["болигер"],
    "Rexton": ["рекстон"],
    "Taft": ["тафт"],
    "Stonic": ["стоник"],
    "X4": ["х4", "икс4"],
    "L200": ["л200", "l200"],
    "Breez": ["бриз"],
    "Tayron": ["тайрон"],
    "Fortuner": ["фортунер"],
    "MK Cross": ["мк кросс", "mk cross"],
    "M11 A3": ["м11 а3", "m11 a3"],
    "Smily": ["смайли"],
    "Very": ["вери"],
    "Vue": ["вуе", "vue"],
    "Tingo": ["тинго"],
    "Pajero iO": ["паджеро io", "паджеро ио"],
    "CK Otaka": ["ск отака", "ck otaka", "отака"],
    "Meriva": ["мерива"],
    "Move Conte": ["мув конте"],
    "Ignis": ["игнис"],
    "Freelander": ["фрилендер"],
    "EcoSport": ["экоспорт"],
    "Emgrand 7": ["эмгранд 7"],
    "Pickup": ["пикап"],
    "GLA-Class": ["гла-класс", "гла класс"],
    "Caravelle": ["каравелла"],
    "Explorer": ["эксплорер"],
    "CS35 Plus": ["cs35 plus", "сs35 плюс", "цс35 плюс"],
    "Forte": ["форте"],
    "Scirocco": ["сирокко"],
    "Karoq": ["карок"],
    "Rogue Sport": ["рог спорт"],
    "Dashing": ["дашинг"],
    "Bestune T99": ["бестун т99"],
    "C07": ["с07", "c07"],
    "GLK-Class": ["глк-класс", "глк класс"],
    "Mohave": ["мохаве"],
    "Atos": ["атос"],
    "Symbol": ["симбол"],
    "Viva": ["вива"],
    "Airwave": ["эйрвейв"],
    "B-Class": ["б-класс", "б класс"],
    "Laguna": ["лагуна"],
    "Emgrand X7": ["эмгранд х7"],
    "R2": ["р2", "r2"],
    "Astra GTC": ["астра гтс", "astra gtc"],
    "Largus Cross": ["ларгус кросс"],
    "Coupe": ["купе"],
    "Dokker": ["доккер"],
    "Logan Stepway": ["логан степвей"],
    "XV": ["xv", "хv", "икс ви"],
    "Q5": ["кью5", "q5", "ауди q5"],
    "Samsung XM3": ["хм3", "xm3"],
    "Scenic": ["сценик"],
    "EX25": ["ex25", "еx25"],
    "Trax": ["тракс"],
    "A6": ["а6", "а 6", "a6"],
    "Kona": ["кона"],
    "Carnival": ["карнивал"],
    "Tugella": ["тугелла", "тугела", "тугелла джили", "тугела джили"],
    "Equinox": ["эквинокс"],
    "Bronco Sport": ["бронко спорт"],
    "Ridgeline": ["риджлайн"],
    "Wrangler": ["вранглер"],
    "Terrain": ["террейн"],
    "Sienna": ["сиенна"],
    "001": ["001"],
    "Q7": ["кью7", "q7"],
    "Voyager": ["вояджер"],
    "Almera Classic": ["альмера классик", "алмера классик"],
    "Micra": ["микра"],
    "Opirus": ["опирус"],
    "Airtrek": ["эйртрек"],
    "Rogue": ["рог", "rogue"],
    "T6": ["т6", "t6"],
    "E5": ["е5", "e5"],
    "Grand Cherokee": ["гранд чероки"],
    "QM6": ["qm6", "ку эм 6"],
    "Tundra": ["тундра"],
    "Bonus A13": ["бонус а13", "bonus a13"],
    "Carina": ["карина"],
    "XL7": ["хл7", "xl7"],
    "Navara": ["навара"],
    "Prius Alpha": ["приус альфа"],
    "NP300": ["нп300", "np300"],
    "JS6": ["джас6", "js6", "jac js6"],
    "C-Elysee": ["с-элизе", "c-elysee"],
    "IndiS C18D": ["индис с18д", "indis c18d"],
    "Liana": ["лиана"],
    "C-Max": ["с-макс", "c-max"],
    "C5": ["с5", "c5"],
    "Pleo Plus": ["плео плюс"],
    "CS75": ["cs75", "сs75", "цс75"],
    "Bora": ["бора"],
    "Grandland X": ["грандленд х", "grandland x"],
    "Expert": ["эксперт"],
    "Arrizo 8": ["арризо 8"],
    "QX50": ["qx50", "кью икс 50"],
    "GS8": ["гс8", "gs8"],
    "Discovery": ["дискавери"],
    "GLE-Class": ["гле-класс", "гле класс"],
    "Lanos": ["ланос"],
    "Albea": ["альбеа"],
    "Mira": ["мира", "мираж"],
    "Matrix": ["матрикс"],
    "Hover H3": ["ховер н3", "hover h3"],
    "Hover H6": ["ховер н6", "hover h6"],
    "TrailBlazer": ["трейлблейзер"],
    "X3 Pro": ["х3 про", "x3 pro"],
    "TT": ["тт", "tt"],
    "CS95": ["cs95", "сs95", "цс95"]
  };

  Object.entries(extraManualModelAliases).forEach(([model, aliases]) => {
    manualModelAliases[model] = uniq([...(manualModelAliases[model] || []), ...aliases]);
  });
  const manualModelAliasLookup = new Map(Object.entries(manualModelAliases).map(([model, aliases]) => [slugify(model), aliases]));

  const brandDisplayName = (brand) => brand === "Lada (ВАЗ)" ? "ВАЗ (LADA)" : brand;
  const brandSlug = (brand) => brand === "Lada (ВАЗ)" ? "lada" : slugify(brand);

  const brands = Object.keys(catalog).map(brand => ({
    name: brandDisplayName(brand),
    slug: brandSlug(brand),
    aliases: makeAliases(brand, brandAliases[brand] || [])
  }));

  const modelMap = new Map();
  for (const [brand, models] of Object.entries(catalog)) {
    for (const model of models) {
      const slug = slugify(model);
      const displayName = model;
      const aliases = makeAliases(model, uniq([...(manualModelAliases[model] || []), ...(manualModelAliasLookup.get(slug) || [])]));
      if (!modelMap.has(slug)) {
        modelMap.set(slug, { name: displayName, slug, aliases, brands: [brandSlug(brand)] });
      } else {
        const item = modelMap.get(slug);
        item.aliases = uniq([...item.aliases, ...aliases]);
        item.brands = uniq([...item.brands, brandSlug(brand)]);
      }
    }
  }

  Object.entries(extraManualModelAliases).forEach(([model, aliases]) => {
    const item = modelMap.get(slugify(model));
    if (item) item.aliases = uniq([...item.aliases, ...makeAliases(model, aliases)]);
  });

  const finalModelAliases = {
    "corolla": ["корола"],
    "corolla-cross": ["корола кросс"],
    "corolla-runx": ["корола ранкс"],
    "corolla-fielder": ["корола филдер"],
    "corolla-axio": ["корола аксио"],
    "corolla-verso": ["корола версо"],
    "spacio": ["корола спасио"],
    "rav4": ["равчик", "рав 4", "равчик 4"],
    "land-cruiser-prado": ["прадик"],
    "land-cruiser": ["лк", "lc"]
  };

  Object.entries(finalModelAliases).forEach(([slug, aliases]) => {
    const item = modelMap.get(slug);
    if (item) item.aliases = uniq([...item.aliases, ...aliases, ...aliases.map((alias) => alias.replace(/\s+/g, ""))]);
  });

  // Extra common ambiguous numeric model shortcuts. They help with queries like "мазда 3", "ауди а6", "танк 300".
  for (const item of modelMap.values()) {
    item.aliases = uniq(item.aliases.flatMap(a => [a, a.replace(/ё/g, "е"), ...typoVariants(a)]));
  }

  window.AUTO_ASSISTANT_DICTIONARY = {
    brands,
    models: [...modelMap.values()],
    cities: [
      { name: "Екатеринбург", host: "crystal-motors.ru", aliases: ["екатеринбург", "екатеринбурге", "екат", "екб", "ekb", "svx", "свердловск"] },
      { name: "Челябинск", host: "chel.crystal-motors.ru", aliases: ["челябинск", "челябинске", "челяба", "чел", "chl", "cek"] },
      { name: "Тюмень", host: "tumen.crystal-motors.ru", aliases: ["тюмень", "тюмени", "тюм", "tym", "tjm"] },
      { name: "Томск", host: "tomsk.crystal-motors.ru", aliases: ["томск", "томске", "том", "tom", "tof"] },
      { name: "Омск", host: "omsk.crystal-motors.ru", aliases: ["омск", "омске", "омич", "oms"] },
      { name: "Красноярск", host: "krasnoyarsk.crystal-motors.ru", aliases: ["красноярск", "красноярске", "крас", "красик", "kry", "kja"] },
      { name: "Сургут", host: "surgut.crystal-motors.ru", aliases: ["сургут", "сургуте", "сург", "sgc"] },
      { name: "Новосибирск", host: "novosib.crystal-motors.ru", aliases: ["новосибирск", "новосибирске", "новосиб", "нск", "nsk", "ovb"] },
      { name: "Новокузнецк", host: "nkz.crystal-motors.ru", aliases: ["новокузнецк", "новокузнецке", "кузня", "нкз", "nkz", "noz"] },
      { name: "Кемерово", host: "kemerovo.crystal-motors.ru", aliases: ["кемерово", "кем", "kem", "kej"] },
      { name: "Барнаул", host: "barnaul.crystal-motors.ru", aliases: ["барнаул", "барнауле", "брн", "brn"] },
      { name: "Пермь", host: "perm.crystal-motors.ru", aliases: ["пермь", "перми", "перм", "prm", "pee"] },
      { name: "Оренбург", host: "orenburg.crystal-motors.ru", aliases: ["оренбург", "оренбурге", "орен", "orb", "ren"] }
    ],
    transmissions: {
      automatic: ["автомат", "автомате", "автоматическая", "авто", "ат", "a/t", "automatic", "auto", "akpp", "акпп", "робот", "роботе", "роботизированная", "ркпп", "вариатор", "вариаторе", "cvt", "дсг", "dsg", "powershift", "пауэршифт", "tiptronic", "типтроник"],
      manual: ["механика", "механике", "механическая", "ручка", "на ручке", "мт", "m/t", "manual", "mkpp", "мкпп"]
    },
    stopWords: [
      "в", "во", "на", "из", "с", "со", "к", "ко", "до", "от", "по", "под", "для", "над", "при", "про", "без", "через", "не",
      "есть", "имеется", "наличие", "наличии", "у", "вас", "вы", "ваши", "наш", "вашем", "городе",
      "машина", "машины", "машину", "тачка", "тачку", "авто", "автомобиль", "автомобили", "автомобиля", "автомобилей",
      "посмотреть", "найди", "найти", "ищу", "поиск", "подбери", "подобрать", "нужен", "нужна", "нужно", "хочу", "можно", "покажи", "показать", "скинь", "дайте", "давай",
      "примерно", "около", "районе", "район", "ориентир", "ориентировочно", "плюс", "минус", "хотя", "бы", "минимум", "максимум",
      "свежий", "свежая", "свежее", "свежие", "старше", "моложе", "новее", "начиная",
      "вариант", "варианты", "предложение", "предложения", "подбор", "под", "по", "цене", "стоимость", "цена", "прайс", "бюджет", "руб", "рублей", "млн", "тыс",
      "год", "года", "году", "пробег", "пробегом", "км", "литр", "литра", "л", "двигатель", "движок", "мотор", "комплектация", "комплектации",
      "купить", "продажа", "продаже", "салон", "кредит", "рассрочка", "трейд", "trade", "in", "trade-in", "обмен"
    ]
  };
})();
