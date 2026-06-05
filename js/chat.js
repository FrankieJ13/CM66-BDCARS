(function () {
  const config = window.AUTO_ASSISTANT_CONFIG || {};
  const dictionary = window.AUTO_ASSISTANT_DICTIONARY || {};
  const storageKeys = {
    history: "cm66-assistant-chat-history",
    fontSize: "cm66-assistant-font-size",
    searchLog: "cm66-assistant-search-log"
  };
  const commands = [
    {
      id: "clear",
      command: "/очистить чат",
      label: "Очистить чат",
      description: "Удалить сообщения и локальную историю"
    },
    {
      id: "font",
      command: "/размер шрифта",
      label: "Изменить размер шрифта",
      description: "Ввести число от 10 до 18"
    },
    {
      id: "freshness",
      command: "/актуальность бд",
      label: "Актуальность БД",
      description: "Показать дату обновления базы"
    },
    {
      id: "exportLogs",
      command: "/экспорт логов",
      label: "Экспорт логов",
      description: "Скачать JSON за последний час"
    }
  ];
  const resultPageSize = Math.max(12, Number(config.maxResults) || 12);
  const bodyTypeEntries = [
    ["хетчбэк", ["хетчбэк", "хетчбек", "хетч", "хеч", "хэч", "хэтч", "хэтчбек", "hatchback", "hatch"]],
    ["седан", ["седан", "сидан", "sedan"]],
    ["кроссовер", ["кроссовер", "кросовер", "паркетник", "suv", "crossover"]],
    ["внедорожник", ["внедорожник", "джип", "вездеход", "suv", "offroad"]],
    ["минивэн", ["минивэн", "минивен", "мини van", "minivan"]],
    ["универсал", ["универсал", "вагон", "wagon", "estate"]],
    ["лифтбек", ["лифтбек", "лифтбэк", "liftback"]],
    ["пикап", ["пикап", "pickup", "pick up"]],
    ["купе", ["купе", "coupe"]],
    ["фургон", ["фургон", "van"]],
    ["кабриолет", ["кабриолет", "cabriolet", "convertible"]],
    ["родстер", ["родстер", "roadster"]],
    ["фастбек", ["фастбек", "fastback"]],
    ["ландо", ["ландо", "landau"]],
    ["лимузин", ["лимузин", "limousine", "limo"]],
    ["хардтоп", ["хардтоп", "hardtop"]],
    ["микроавтобус", ["микроавтобус", "микрик", "микро автобус", "minibus"]],
    ["тарга", ["тарга", "targa"]]
  ].map(([name, aliases]) => ({ name, variants: Array.from(new Set([name, ...aliases].map(normalizeText).filter(Boolean))) }));
  const state = { cars: [], awaitingFontSize: false, replyTimers: [], replySequence: 0 };

  const els = {
    form: document.getElementById("chatForm"),
    input: document.getElementById("chatInput"),
    window: document.getElementById("chatWindow"),
    status: document.getElementById("catalogStatus"),
    commandMenu: document.getElementById("commandMenu")
  };

  const aliasIndex = buildAliasIndex(dictionary);

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/&/g, " ")
      .replace(/[-_/.,:;!?()[\]{}]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildAliasIndex(source) {
    const index = new Map();
    const add = (type, item) => {
      const variants = [item.name, item.slug, item.host, ...(item.aliases || [])]
        .map(normalizeText)
        .filter(Boolean);
      const unique = Array.from(new Set(variants));
      unique.forEach((variant) => index.set(variant, { type, ...item, variants: unique }));
    };

    (source.brands || []).forEach((item) => add("brand", item));
    (source.models || []).forEach((item) => add("model", item));
    (source.cities || []).forEach((item) => add("city", item));
    return index;
  }

  function parseCsv(csv) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < csv.length; index += 1) {
      const char = csv[index];
      const next = csv[index + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cell);
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);
    if (row.some(Boolean)) rows.push(row);

    const headers = (rows.shift() || []).map(normalizeHeader);
    return rows.map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] || "";
      });
      record.price = parseMoney(record.price);
      record.year = Number(record.year) || "";
      return record;
    });
  }

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function parseMoney(value) {
    const text = String(value || "").replace(/[^\d]/g, "");
    return text ? Number(text) : 0;
  }

  function formatMoney(value) {
    return value ? `${Number(value).toLocaleString("ru-RU")} ₽` : "цена по запросу";
  }

  function formatMileage(value) {
    return value ? `${Number(value).toLocaleString("ru-RU")} км` : "";
  }

  function formatPowerChip(power) {
    if (!power) return "";
    if (power.mode === "max") return `до ${power.value} л.с.`;
    if (power.mode === "min") return `от ${power.value} л.с.`;
    return `около ${power.value} л.с.`;
  }

  function formatBudgetChip(min, max) {
    if (min && max) return `${formatMoney(min)}-${formatMoney(max)}`;
    if (min) return `от ${formatMoney(min)}`;
    if (max) return `до ${formatMoney(max)}`;
    return "";
  }

  function formatYearChip(yearRange) {
    if (!yearRange) return "";
    return yearRange.min === yearRange.max ? String(yearRange.min) : `${yearRange.min}-${yearRange.max}`;
  }

  function parseQuery(rawQuery) {
    const expensiveIntent = extractExpensiveIntent(rawQuery);
    const queryWithoutExpensiveIntent = removeExpensiveIntentPhrases(rawQuery);
    const cheapIntent = extractCheapIntent(queryWithoutExpensiveIntent);
    const yearRange = extractYearRange(queryWithoutExpensiveIntent);
    const queryWithoutYears = removeYearPhrases(queryWithoutExpensiveIntent);
    const mileage = extractMileage(queryWithoutYears);
    const power = extractPower(queryWithoutYears);
    const budgetQuery = removePowerPhrases(removeMileagePhrases(queryWithoutYears));
    const priceRange = extractPriceRange(budgetQuery);
    const explicitBudget = priceRange.max || (!priceRange.min ? extractBudget(budgetQuery) : null);
    const budgetMin = priceRange.min || null;
    const budget = explicitBudget || (cheapIntent ? 200000 : null);
    const drive = extractDrive(queryWithoutYears);
    const wheel = extractWheel(queryWithoutYears);
    const fuel = extractFuel(queryWithoutYears);
    const bodyTypes = extractBodyTypes(queryWithoutYears);
    const query = compactKnownPhrases(removeBodyTypePhrases(normalizeText(removeFuelPhrases(removeWheelPhrases(removeCheapIntentPhrases(removeDrivePhrases(removeBudgetPhrases(removePowerPhrases(removeMileagePhrases(queryWithoutYears))))))))));
    const automaticWords = dictionary.transmissions?.automatic || [];
    const manualWords = dictionary.transmissions?.manual || [];
    const stopWords = dictionary.stopWords || [];
    const terms = query
      .split(/\s+/)
      .filter((term) => term.length > 1);

    const transmission = terms.some((term) => automaticWords.includes(term))
      ? "автомат"
      : terms.some((term) => manualWords.includes(term))
        ? "механика"
        : "";

    const searchable = terms.filter((term) => {
      return !automaticWords.includes(term) && !manualWords.includes(term) && !stopWords.includes(term) && !isDriveTerm(term);
    });

    return {
      budget,
      budgetMin,
      cheapIntent,
      expensiveIntent,
      yearRange,
      mileage,
      power,
      drive,
      wheel,
      fuel,
      bodyTypes,
      transmission,
      terms: searchable,
      canonicalTerms: searchable.map(canonicalToken),
      expandedTerms: searchable.map(expandToken),
      termMatches: searchable.map(buildTermMatch)
    };
  }

  function compactKnownPhrases(query) {
    let output = ` ${query} `;
    Array.from(aliasIndex.keys())
      .filter((alias) => alias.includes(" "))
      .sort((a, b) => b.length - a.length)
      .forEach((alias) => {
        const compact = alias.replace(/\s+/g, "");
        const entry = aliasIndex.get(alias);
        output = output.replace(new RegExp(` ${escapeRegExp(alias)} `, "g"), ` ${compact} `);
        if (entry && !aliasIndex.has(compact)) aliasIndex.set(compact, entry);
      });
    return output.trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function removeBudgetPhrases(query) {
    return String(query || "")
      .replace(getPriceRangePattern(), " ")
      .replace(getBudgetPattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeYearPhrases(query) {
    return String(query || "")
      .replace(getYearRangePattern(), " ")
      .replace(getYearPhrasePattern(), " ")
      .replace(getYearTokenPattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeMileagePhrases(query) {
    return String(query || "")
      .replace(getMileagePattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removePowerPhrases(query) {
    return String(query || "")
      .replace(getPowerPattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeDrivePhrases(query) {
    return String(query || "")
      .replace(getDrivePattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeWheelPhrases(query) {
    return String(query || "")
      .replace(getWheelPattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeFuelPhrases(query) {
    return String(query || "")
      .replace(getFuelPattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeBodyTypePhrases(query) {
    let output = ` ${normalizeText(query)} `;
    const variants = bodyTypeEntries
      .flatMap((entry) => entry.variants)
      .sort((a, b) => b.length - a.length);
    variants.forEach((variant) => {
      output = output.replace(new RegExp(`(^| )${escapeRegExp(variant)}(?= |$)`, "g"), " ");
    });
    output = output.replace(/(^| )(кузов|кузове|кузова|кузовом|кузон|кузане|кузане|тип кузова)(?= |$)/g, " ");
    return output.replace(/\s+/g, " ").trim();
  }

  function removeCheapIntentPhrases(query) {
    return String(query || "")
      .replace(getCheapIntentPattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeExpensiveIntentPhrases(query) {
    return String(query || "")
      .replace(getExpensiveIntentPattern(), " ")
      .replace(/(?:по\s+)?(?:всей\s+)?(?:сети|базе|бд)/gi, " ")
      .replace(/\s+/g, " ");
  }

  function getCheapIntentPattern() {
    return /(?:ржав(?:ое|ую|ый|ые|ого|еньк(?:ое|ую|ий|ие))?|ржавая|ржавчина|корыто|корытце|тазик|таз|ведро|дрова|дровишки|груда\s+металла|кусок\s+металла|металлолом|чермет|утиль|хлам|автохлам|развалюха|старье|старьё|помойка|помоечка|убит(?:ое|ую|ый|ые)|уставш(?:ее|ую|ий|ие)|живой\s+труп|на\s+ходу\s+и\s+ладно|сам(?:ое|ую|ый)?\s+дешев(?:ое|ую|ый)|дешман|дешманск(?:ое|ую|ий)|бомж\s*вариант|нищеброд\s*вариант)/gi;
  }

  function extractCheapIntent(rawQuery) {
    return getCheapIntentPattern().test(String(rawQuery || "").toLowerCase().replace(/ё/g, "е"));
  }

  function getExpensiveIntentPattern() {
    return /(?:дорого\s*[- ]?\s*богато|богато\s*[- ]?\s*дорого|топ\s+за\s+свои\s+деньги|топ\s+за\s+свои|лучшее\s+за\s+свои\s+деньги|лучшее\s+за\s+свои|максимум\s+за\s+свои\s+деньги|максимум\s+за\s+свои|надо\s+брать|надо\s+забирать|бери\s+не\s+думай|можно\s+брать|топчик|топ\s*8|топ\s+дорог(?:их|ие)|сам(?:ое|ую|ый|ые)?\s+дорог(?:ое|ую|ой|ие|их)|сам(?:ое|ую|ый|ые)?\s+жирн(?:ое|ую|ый|ые|ых)|сам(?:ое|ую|ый|ые)?\s+богат(?:ое|ую|ый|ые|ых)|что\s+есть\s+сам(?:ое|ые)?\s+дорог(?:ое|ие)|покажи\s+сам(?:ое|ые)?\s+дорог(?:ое|ие)|дорогие\s+тачки|дорогие\s+машины|дорогой\s+вариант|богатый\s+вариант|жирный\s+вариант|царский\s+вариант|лакомый\s+вариант|для\s+босса|для\s+директора|по\s+красоте|на\s+максималках|максималка|полный\s+фарш|жир(?:ный|ная|ное|ные)?|лакшери|люкс|премиум|премиальный|богато|все\s+деньги|все\s+лучшее|лучшее\s+что\s+есть|самый\s+сок|сладкий\s+вариант|красиво\s+жить|гулять\s+так\s+гулять)/gi;
  }

  function extractExpensiveIntent(rawQuery) {
    return getExpensiveIntentPattern().test(String(rawQuery || "").toLowerCase().replace(/ё/g, "е"));
  }

  function getBudgetPattern() {
    return /(?:от|с|>=|>|дороже|не\s+дешевле|до|<=|<|меньше|дешевле|не\s+дороже|бюджет(?:ом)?|цена\s+до|стоимость\s+до)?\s*\d+(?:[\s.,]\d+)*\s*(?:млн|мил(?:лион(?:а|ов)?)?|m|м|тыс(?:яч)?|тр|к|k)(?=$|\s|[.,!?])|(?:от|с|>=|>|дороже|не\s+дешевле|до|<=|<|меньше|дешевле|не\s+дороже|бюджет(?:ом)?|цена\s+до|стоимость\s+до)\s*\d+(?:[\s.,]\d+)*|\b[1-9]\d{5,7}\b/gi;
  }

  function getYearTokenPattern() {
    return /\b(?:19|20)[\dа-яёa-z]{2,3}\b/gi;
  }

  function getYearPhrasePattern() {
    return /(?:от|с|начиная\s+с|после|моложе|свежее|свеж(?:ий|ая|ее|ие)|не\s+старше)\s+(?:19|20)[\dа-яёa-z]{2,3}(?:\s*г(?:од|ода|оду)?\.?)?|(?:до|по|раньше|старше|не\s+новее)\s+(?:19|20)[\dа-яёa-z]{2,3}(?:\s*г(?:од|ода|оду)?\.?)?|(?:19|20)[\dа-яёa-z]{2,3}\s*г(?:од|ода|оду)?\.?/gi;
  }

  function getYearRangePattern() {
    return /\b(?:19|20)[\dа-яёa-z]{2,3}\s*(?:-|—|–|до|по)\s*(?:(?:19|20)?[\dа-яёa-z]{2,3})\b/gi;
  }

  function extractYearRange(rawQuery) {
    const text = String(rawQuery || "").toLowerCase().replace(/ё/g, "е");
    const rangeMatch = text.match(getYearRangePattern());
    if (rangeMatch) {
      const years = rangeMatch[0]
        .split(/-|—|–|до|по/i)
        .map((item) => coerceYearValue(item))
        .filter(Boolean);
      if (years.length >= 2) return normalizeYearRange(years[0], years[1]);
    }

    const phraseMatch = text.match(getYearPhrasePattern());
    if (phraseMatch) {
      const phrase = phraseMatch[phraseMatch.length - 1];
      const year = coerceYearValue(phrase);
      if (year) {
        if (/(?:от|с|начиная\s+с|после|моложе|свежее|свеж|не\s+старше)/.test(phrase)) return { min: year, max: 2030 };
        if (/(?:до|по|раньше|старше|не\s+новее)/.test(phrase)) return { min: 1990, max: year };
        return normalizeYearRange(year, year);
      }
    }

    const yearMatches = Array.from(text.matchAll(getYearTokenPattern()))
      .map((match) => coerceYearValue(match[0]))
      .filter(Boolean);
    return yearMatches.length ? normalizeYearRange(yearMatches[yearMatches.length - 1], yearMatches[yearMatches.length - 1]) : null;
  }

  function coerceYearValue(fragment) {
    const digits = String(fragment || "").replace(/[^\d]/g, "");
    if (digits.length === 2) {
      const value = Number(digits);
      const year = value <= 30 ? 2000 + value : 1900 + value;
      return year >= 1990 && year <= 2030 ? year : null;
    }
    if (digits.length !== 4) return null;
    const year = Number(digits);
    return year >= 1990 && year <= 2030 ? year : null;
  }

  function normalizeYearRange(first, second) {
    const min = Math.min(first, second);
    const max = Math.max(first, second);
    return { min, max };
  }

  function getPriceRangePattern() {
    const number = String.raw`\d+(?:[\s.,]\d+)*`;
    const decimalNumber = String.raw`\d+[.,]\d+`;
    const unit = String.raw`(?:млн|мил(?:лион(?:а|ов)?)?|m|м|тыс(?:яч)?|тр|к|k)?`;
    const context = String.raw`(?:в\s+пределах|диапазон|бюджет|цена|стоимость|между)`;
    const approx = String.raw`(?:около|примерно|плюс\s*минус|в\s+районе|район|ориентир|ориентировочно)`;
    return new RegExp(String.raw`${approx}\s*${number}\s*${unit}|${decimalNumber}\s*(?:-|—|–|до)\s*${decimalNumber}\s*(?:млн|мил(?:лион(?:а|ов)?)?|m|м)?|(?:(?:${context})\s*(?:от|с)?|(?:от|с))\s*${number}\s*${unit}\s*(?:-|—|–|до|и)\s*${number}\s*${unit}|(?:от|с|>=|>|дороже|не\s+дешевле|хотя\s+бы|минимум)\s*${number}\s*${unit}`, "gi");
  }

  function extractBudget(rawQuery) {
    const text = String(rawQuery || "").toLowerCase().replace(/ё/g, "е");
    const matches = Array.from(text.matchAll(getBudgetPattern()));
    const budgets = matches
      .map((match) => parseBudgetValue(match[0]))
      .filter((value) => value >= 50000 && value <= 50000000);
    return budgets.length ? Math.max(...budgets) : null;
  }

  function extractPriceRange(rawQuery) {
    const text = String(rawQuery || "").toLowerCase().replace(/ё/g, "е");
    const range = findBudgetRange(text);
    if (range) return range;
    const approx = findBudgetApprox(text);
    if (approx) return approx;
    const min = findBudgetMin(text);
    return min ? { min, max: null } : { min: null, max: null };
  }

  function findBudgetApprox(text) {
    const match = text.match(/(?:около|примерно|плюс\s*минус|в\s+районе|район|ориентир|ориентировочно)\s*(\d+(?:[\s.,]\d+)*)\s*(млн|мил(?:лион(?:а|ов)?)?|m|м|тыс(?:яч)?|тр|к|k)?/i);
    if (!match) return null;
    const value = parseBudgetValue(`${match[1]} ${match[2] || ""}`);
    if (value < 50000 || value > 50000000) return null;
    const spread = Math.max(50000, Math.round(value * 0.1));
    return { min: Math.max(50000, value - spread), max: Math.min(50000000, value + spread) };
  }

  function findBudgetRange(text) {
    const decimalRange = text.match(/(?:^|\s)(\d+[.,]\d+)\s*(?:-|—|–|до)\s*(\d+[.,]\d+)(?:\s*(млн|мил(?:лион(?:а|ов)?)?|m|м))?(?=\s|$)/i);
    if (decimalRange) {
      const first = parseBudgetValue(`${decimalRange[1]} ${decimalRange[3] || ""}`);
      const second = parseBudgetValue(`${decimalRange[2]} ${decimalRange[3] || ""}`);
      const min = Math.min(first, second);
      const max = Math.max(first, second);
      if (min >= 50000 && max <= 50000000 && min <= max) return { min, max };
    }

    const context = String.raw`(?:в\s+пределах|диапазон|бюджет|цена|стоимость|между)`;
    const number = String.raw`(\d+(?:[\s.,]\d+)*)\s*(млн|мил(?:лион(?:а|ов)?)?|m|м|тыс(?:яч)?|тр|к|k)?`;
    const patterns = [
      new RegExp(String.raw`(?:от|с)\s*${number}\s*(?:-|—|–|до|и)\s*${number}`, "i"),
      new RegExp(String.raw`${context}\s*(?:от|с)?\s*${number}\s*(?:-|—|–|до|и)\s*${number}`, "i")
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const first = parseBudgetValue(`${match[1]} ${match[2] || match[4] || ""}`);
      const second = parseBudgetValue(`${match[3]} ${match[4] || match[2] || ""}`);
      const min = Math.min(first, second);
      const max = Math.max(first, second);
      if (min >= 50000 && max <= 50000000 && min <= max) return { min, max };
    }
    return null;
  }

  function findBudgetMin(text) {
    const match = text.match(/(?:от|с|>=|>|дороже|не\s+дешевле|хотя\s+бы|минимум)\s*(\d+(?:[\s.,]\d+)*)\s*(млн|мил(?:лион(?:а|ов)?)?|m|м|тыс(?:яч)?|тр|к|k)?/i);
    if (!match) return null;
    const value = parseBudgetValue(`${match[1]} ${match[2] || ""}`);
    return value >= 50000 && value <= 50000000 ? value : null;
  }

  function getMileagePattern() {
    const mileageNumber = String.raw`\d+(?:[.,]\d+)?(?:\s?\d{3})*`;
    return new RegExp(String.raw`(?:пробег(?:ом)?|километраж(?:ем)?|км|km)\s*(?:до|<=|<|меньше|не\s+более|не\s+выше)?\s*${mileageNumber}\s*(?:тыс(?:яч)?|т|к|k|км|km)?|(?:до|<=|<|меньше|не\s+более|не\s+выше)\s*${mileageNumber}\s*(?:тыс(?:яч)?|т|к|k)?\s*(?:км|km|пробег(?:а|ом)?|километраж(?:а|ем)?)`, "gi");
  }

  function getPowerPattern() {
    const powerNumber = String.raw`\d{2,4}`;
    const direction = String.raw`от|>=|>|больше|мощнее|свыше|не\s+меньше|до|<=|<|меньше|слабее|не\s+более|не\s+выше`;
    return new RegExp(String.raw`(?:мощн(?:ость|остью)?|лош(?:ад(?:ей|и|ок)?)?|л\.?\s*с\.?|hp|horsepower)\s*(?:${direction})?\s*${powerNumber}|(?:${direction})?\s*${powerNumber}\s*(?:лош(?:ад(?:ей|и|ок)?)?|л\.?\s*с\.?|hp|horsepower)`, "gi");
  }

  function extractMileage(rawQuery) {
    const text = String(rawQuery || "").toLowerCase().replace(/ё/g, "е");
    const matches = Array.from(text.matchAll(getMileagePattern()));
    const mileages = matches
      .map((match) => parseMileageValue(match[0]))
      .filter((value) => value >= 1000 && value <= 1000000);
    return mileages.length ? Math.max(...mileages) : null;
  }

  function extractPower(rawQuery) {
    const text = String(rawQuery || "").toLowerCase().replace(/ё/g, "е");
    const matches = Array.from(text.matchAll(getPowerPattern()));
    const powers = matches
      .map((match) => {
        const value = parsePowerValue(match[0]);
        if (!value) return null;
        return { value, mode: parsePowerMode(match[0]) };
      })
      .filter((item) => item && item.value >= 1 && item.value <= 2000);
    return powers.length ? powers[powers.length - 1] : null;
  }

  function parsePowerValue(fragment) {
    const match = String(fragment || "").match(/\d{2,4}/);
    return match ? Number(match[0]) : 0;
  }

  function parsePowerMode(fragment) {
    const text = String(fragment || "").toLowerCase().replace(/ё/g, "е");
    if (/(?:до|<=|<|меньше|слабее|не\s+более|не\s+выше)/.test(text)) return "max";
    if (/(?:от|>=|>|больше|мощнее|свыше|не\s+меньше)/.test(text)) return "min";
    return "near";
  }

  function parseMileageValue(fragment) {
    const text = String(fragment || "").toLowerCase().replace(/ё/g, "е");
    const numberMatch = text.match(/\d+(?:[\s.,]\d+)*/);
    if (!numberMatch) return 0;

    const normalizedNumber = numberMatch[0].replace(/\s+/g, "");
    const hasDecimal = /[.,]/.test(normalizedNumber);
    const value = Number(normalizedNumber.replace(",", "."));
    if (!Number.isFinite(value)) return 0;

    if (/(тыс|км|km|т|\bк\b|\bk\b)/i.test(text) && value < 10000) return Math.round(value * 1000);
    if (hasDecimal && value < 1000) return Math.round(value * 1000);
    if (value < 1000) return Math.round(value * 1000);
    return Math.round(value);
  }

  function getDrivePattern() {
    return /(?:передний|переднем|передн(?:ий|ем)?\s+привод|fwd|задний|заднем|задн(?:ий|ем)?\s+привод|rwd|полный|полном|полн(?:ый|ом)?\s+привод|полнопривод(?:ный|ная|ное)?|4\s?wd|awd|4\s?вд|4\s?x\s?4)/gi;
  }

  function getWheelPattern() {
    return /(?:лев(?:ый|ом|ого|ая|ую)?\s+рул(?:ь|е|я|ем)?|рул(?:ь|е|я|ем)?\s+лев(?:ый|ом|ого|ая|ую)?|леворульн(?:ый|ая|ое|ые)?|прав(?:ый|ом|ого|ая|ую)?\s+рул(?:ь|е|я|ем)?|рул(?:ь|е|я|ем)?\s+прав(?:ый|ом|ого|ая|ую)?|праворульн(?:ый|ая|ое|ые)?|\bлев(?:ый|ом|ого|ая|ую)\b|\bправ(?:ый|ом|ого|ая|ую)\b)/gi;
  }

  function getFuelPattern() {
    return /(?:бензин(?:овый|овая|овое|овые|е)?|бенз|дизель(?:ный|ная|ное|ные)?|диз|электро|электрич(?:ка|еский|еская|еское|еские)?|ev|гибрид(?:ный|ная|ное|ные)?|hybrid|газ(?:овый|овая|овое|овые)?|метан|пропан)/gi;
  }

  function extractDrive(rawQuery) {
    const text = normalizeText(rawQuery);
    if (/(передний|переднем|передн\s+привод|fwd)/.test(text)) return "передний";
    if (/(задний|заднем|задн\s+привод|rwd)/.test(text)) return "задний";
    if (/(полный|полном|полн\s+привод|полнопривод|4wd|awd|4вд|4 x 4|4x4)/.test(text)) return "полный";
    return "";
  }

  function extractWheel(rawQuery) {
    const text = normalizeText(rawQuery);
    if (/(левый|левом|левого|левая|левую|лев\s+рул|рул\s+лев|леворульн)/.test(text)) return "левый";
    if (/(правый|правом|правого|правая|правую|прав\s+рул|рул\s+прав|праворульн)/.test(text)) return "правый";
    return "";
  }

  function extractFuel(rawQuery) {
    const text = normalizeText(rawQuery);
    if (/(бензин|бенз)/.test(text)) return "бензин";
    if (/(дизель|диз)/.test(text)) return "дизель";
    if (/(электро|электрич|ev)/.test(text)) return "электро";
    if (/(гибрид|hybrid)/.test(text)) return "гибрид";
    if (/(газ|метан|пропан)/.test(text)) return "газ";
    return "";
  }

  function extractBodyTypes(rawQuery) {
    const text = ` ${normalizeText(rawQuery)} `;
    return bodyTypeEntries
      .filter((entry) => entry.variants.some((variant) => new RegExp(`(^| )${escapeRegExp(variant)}(?= |$)`).test(text)))
      .map((entry) => entry.name);
  }

  function isDriveTerm(term) {
    return /^(передний|переднем|передн|задний|заднем|задн|полный|полном|полн|полнопривод|привод|4wd|awd|4вд|4x4|fwd|rwd)$/.test(normalizeText(term));
  }

  function parseBudgetValue(fragment) {
    const text = String(fragment || "").toLowerCase().replace(/ё/g, "е");
    const numberMatch = text.match(/\d+(?:[\s.,]\d+)*/);
    if (!numberMatch) return 0;

    const normalizedNumber = numberMatch[0].replace(/\s+/g, "");
    const hasDecimal = /[.,]/.test(normalizedNumber);
    let value = Number(normalizedNumber.replace(",", "."));
    if (!Number.isFinite(value)) return 0;

    if (/(млн|мил|million|\bm\b|м\b)/i.test(text)) return Math.round(value * 1000000);
    if (/(тыс|тр|\bк\b|\bk\b)/i.test(text)) return Math.round(value * 1000);
    if (hasDecimal && value < 100) return Math.round(value * 1000000);
    if (value < 10000 && !hasDecimal) return Math.round(value * 1000);
    return Math.round(value);
  }

  function canonicalToken(token) {
    const entry = aliasIndex.get(normalizeText(token));
    return entry ? entry.name : token;
  }

  function expandToken(token) {
    const entry = aliasIndex.get(normalizeText(token));
    return entry ? entry.variants : [normalizeText(token)];
  }

  function buildTermMatch(token) {
    const normalized = normalizeText(token);
    const entry = aliasIndex.get(normalized);
    return {
      token: normalized,
      type: entry?.type || "text",
      variants: entry ? entry.variants : [normalized]
    };
  }

  function carSearchText(car) {
    const base = normalizeText([car.brand, car.model, car.title, car.year, car.city, car.mileage, car.body, car.engine, car.drive, car.power, car.transmission, car.wheel].join(" "));
    const extra = [];
    for (const [alias, entry] of aliasIndex.entries()) {
      if (base.includes(alias)) extra.push(entry.name, entry.slug, entry.host, ...entry.variants);
    }
    return normalizeText(`${base} ${extra.join(" ")}`);
  }

  function scoreCar(car, parsed) {
    const text = carSearchText(car);
    let score = 0;
    if (parsed.yearRange && !yearMatches(car.year, parsed.yearRange)) return -1;
    if (parsed.budgetMin && car.price < parsed.budgetMin) return -1;
    if (parsed.budget && car.price > parsed.budget) return -1;
    if (parsed.mileage && parseMileageField(car.mileage) > parsed.mileage) return -1;
    if (parsed.power && !powerMatches(car.power, parsed.power)) return -1;
    if (parsed.transmission && !transmissionMatches(car.transmission, parsed.transmission)) return -1;
    if (parsed.drive && !driveMatches(car.drive, parsed.drive)) return -1;
    if (parsed.wheel && !wheelMatches(car.wheel, parsed.wheel)) return -1;
    if (parsed.fuel && !fuelMatches(car.engine, parsed.fuel)) return -1;
    if (parsed.bodyTypes?.length && !bodyTypeMatches(car.body, parsed.bodyTypes)) return -1;

    for (const match of parsed.termMatches) {
      if (!termMatchesCar(car, text, match)) return -1;
      score += 4;
    }

    if (parsed.budget && car.price) score += Math.max(0, 3 - Math.floor((parsed.budget - car.price) / 200000));
    if (parsed.budgetMin && car.price) score += Math.max(0, 3 - Math.floor((car.price - parsed.budgetMin) / 200000));
    if (parsed.yearRange) score += 3;
    if (parsed.mileage && car.mileage) score += Math.max(0, 3 - Math.floor((parsed.mileage - parseMileageField(car.mileage)) / 30000));
    if (parsed.power) score += 2;
    if (parsed.wheel) score += 2;
    if (parsed.fuel) score += 2;
    if (parsed.bodyTypes?.length) score += 2;
    return score;
  }

  function termMatchesCar(car, fullText, match) {
    if (match.type === "brand") {
      return variantsMatchText(match.variants, [car.brand, car.title].join(" "));
    }
    if (match.type === "model") {
      return variantsMatchText(match.variants, [car.model, car.title].join(" "));
    }
    if (match.type === "city") {
      return variantsMatchText(match.variants, car.city);
    }
    return match.variants.some((term) => fullText.includes(term));
  }

  function variantsMatchText(variants, value) {
    const text = ` ${normalizeText(value)} `;
    return variants.some((variant) => {
      const normalized = normalizeText(variant);
      if (!normalized) return false;
      return text.includes(` ${normalized} `) || text.includes(` ${normalized.replace(/\s+/g, "")} `);
    });
  }

  function parseMileageField(value) {
    const text = String(value || "").replace(/[^\d]/g, "");
    return text ? Number(text) : 0;
  }

  function parsePowerField(value) {
    const text = String(value || "").replace(/[^\d]/g, "");
    return text ? Number(text) : 0;
  }

  function parseCarYear(value) {
    const match = String(value || "").match(/\d{4}/);
    return match ? Number(match[0]) : 0;
  }

  function yearMatches(value, yearRange) {
    const year = parseCarYear(value);
    if (!year) return false;
    return year >= yearRange.min && year <= yearRange.max;
  }

  function powerMatches(value, requested) {
    const power = parsePowerField(value);
    if (!power) return false;
    if (requested.mode === "max") return power <= requested.value;
    if (requested.mode === "min") return power >= requested.value;
    const tolerance = Math.max(15, Math.round(requested.value * 0.1));
    return power >= requested.value - tolerance && power <= requested.value + tolerance;
  }

  function transmissionMatches(value, requested) {
    const text = normalizeText(value);
    if (!requested) return true;
    if (requested === "механика") return /механ|manual|mkpp|мкпп|руч/.test(text);
    return /автомат|automatic|auto|akpp|акпп|вариатор|cvt|робот|dsg|дсг/.test(text);
  }

  function driveMatches(value, requested) {
    const text = normalizeText(value);
    if (!requested) return true;
    if (requested === "передний") return /перед|front|fwd/.test(text);
    if (requested === "задний") return /зад|rear|rwd/.test(text);
    return /полн|4wd|awd|4вд|4 x 4|4x4/.test(text);
  }

  function wheelMatches(value, requested) {
    const text = normalizeText(value);
    if (!requested) return true;
    if (requested === "левый") return /лев|left/.test(text);
    return /прав|right/.test(text);
  }

  function fuelMatches(value, requested) {
    const text = normalizeText(value);
    if (!requested) return true;
    if (requested === "бензин") return /бенз|gasoline|petrol/.test(text);
    if (requested === "дизель") return /диз|diesel/.test(text);
    if (requested === "электро") return /электро|electric|ev/.test(text);
    if (requested === "гибрид") return /гибрид|hybrid/.test(text);
    return /газ|метан|пропан|lpg|cng/.test(text);
  }

  function bodyTypeMatches(value, requested) {
    const text = ` ${normalizeText(value)} `;
    return requested.some((name) => {
      const entry = bodyTypeEntries.find((item) => item.name === name);
      return entry?.variants.some((variant) => text.includes(` ${variant} `) || text.includes(` ${variant.replace(/\s+/g, "")} `));
    });
  }

  function searchCars(query) {
    const parsed = parseQuery(query);
    const cars = state.cars
      .map((car) => ({ car, score: scoreCar(car, parsed) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => {
        if (parsed.expensiveIntent) return (b.car.price || 0) - (a.car.price || 0) || b.score - a.score;
        return b.score - a.score || a.car.price - b.car.price;
      })
      .map((item) => item.car);

    return { parsed, cars };
  }

  function getCarUrl(car) {
    const url = String(car.url || "").trim();
    if (/^https?:\/\//i.test(url) && !/\/example(?:$|[/?#])/i.test(url)) return url;

    const city = findEntry("city", [car.city]);
    const brand = findEntry("brand", [car.brand, car.title]);
    const model = findEntry("model", [car.model, car.title]);
    const host = city?.host || config.defaultCatalogHost || "crystal-motors.ru";
    const parts = ["avtomobili_s_probegom"];
    if (brand?.slug) parts.push(brand.slug);
    if (model?.slug) parts.push(model.slug);
    return `https://${host}/${parts.join("/")}`;
  }

  function findEntry(type, values) {
    const text = normalizeText(values.filter(Boolean).join(" "));
    for (const entry of aliasIndex.values()) {
      if (entry.type === type && entry.variants.some((variant) => text.includes(variant))) return entry;
    }
    return null;
  }

  function addMessage(type, html, options = {}) {
    const message = document.createElement("article");
    message.className = `message ${type}`;
    if (options.transient) message.dataset.transient = "true";
    message.innerHTML = html;
    els.window.appendChild(message);
    if (options.scroll !== false) els.window.scrollTop = els.window.scrollHeight;
    if (options.save !== false) saveHistory();
    return message;
  }

  function renderAssistantReply(query, anchorMessage = null) {
    cancelPendingReplyAnimation();
    const { parsed, cars } = searchCars(query);
    const visibleCars = cars.slice(0, resultPageSize);
    recordSearchLog({
      type: "search",
      query,
      parsed_terms: parsed.canonicalTerms,
      raw_terms: parsed.terms,
      budget: parsed.budget || null,
      budget_min: parsed.budgetMin || null,
      cheap_intent: Boolean(parsed.cheapIntent),
      expensive_intent: Boolean(parsed.expensiveIntent),
      year_range: parsed.yearRange || null,
      mileage: parsed.mileage || null,
      power: parsed.power || null,
      drive: parsed.drive || "",
      wheel: parsed.wheel || "",
      fuel: parsed.fuel || "",
      body_types: parsed.bodyTypes || [],
      transmission: parsed.transmission || "",
      results_count: cars.length,
      shown_count: visibleCars.length,
      results: visibleCars.map(formatCarLogItem)
    });
    const chips = parsed.canonicalTerms.map((term) => `<span class="chip">${escapeHtml(term)}</span>`);
    if (parsed.cheapIntent) chips.push('<span class="chip">самые дешевые</span>');
    if (parsed.expensiveIntent) chips.push('<span class="chip">топ дорогих</span>');
    if (parsed.yearRange) chips.push(`<span class="chip">${escapeHtml(formatYearChip(parsed.yearRange))}</span>`);
    if (parsed.budget || parsed.budgetMin) chips.push(`<span class="chip">${escapeHtml(formatBudgetChip(parsed.budgetMin, parsed.budget))}</span>`);
    if (parsed.mileage) chips.push(`<span class="chip">пробег до ${formatMileage(parsed.mileage)}</span>`);
    if (parsed.power) chips.push(`<span class="chip">${formatPowerChip(parsed.power)}</span>`);
    if (parsed.drive) chips.push(`<span class="chip">${escapeHtml(parsed.drive)} привод</span>`);
    if (parsed.wheel) chips.push(`<span class="chip">${escapeHtml(parsed.wheel)} руль</span>`);
    if (parsed.fuel) chips.push(`<span class="chip">${escapeHtml(parsed.fuel)}</span>`);
    (parsed.bodyTypes || []).forEach((type) => chips.push(`<span class="chip">${escapeHtml(type)}</span>`));
    if (parsed.transmission) chips.push(`<span class="chip">${escapeHtml(parsed.transmission)}</span>`);

    if (!cars.length) {
      addMessage("assistant", `<p>Пока не нашел подходящих авто. Можно убрать город, коробку или повысить бюджет.</p>${renderChips(chips)}`, { scroll: false });
      scrollConversationStart(anchorMessage);
      return;
    }

    const summary = cars.length > visibleCars.length
      ? `Нашел ${cars.length} ${plural(cars.length, ["вариант", "варианта", "вариантов"])}. Показал первые ${visibleCars.length} лучших совпадений.`
      : `Нашел ${cars.length} ${plural(cars.length, ["вариант", "варианта", "вариантов"])}.`;
    const message = addMessage("assistant", `<p>${summary}</p>${renderChips(chips)}<div class="result-list is-streaming"></div>${renderMoreButton(query, visibleCars.length, cars.length)}`, { scroll: false });
    streamResultCards(message, visibleCars);
    scrollConversationStart(anchorMessage);
  }

  function renderMoreResults(query, offset) {
    cancelPendingReplyAnimation();
    const { cars } = searchCars(query);
    const start = Math.max(0, Number(offset) || 0);
    const nextCars = cars.slice(start, start + resultPageSize);
    if (!nextCars.length) {
      addMessage("assistant", "<p>Больше подходящих авто в списке нет.</p>");
      return;
    }

    const nextOffset = start + nextCars.length;
    recordSearchLog({
      type: "show_more",
      query,
      offset: start,
      results_count: cars.length,
      shown_count: nextCars.length,
      results: nextCars.map(formatCarLogItem)
    });
    const message = addMessage("assistant", `<p>Продолжаю список: ${start + 1}-${nextOffset} из ${cars.length}.</p><div class="result-list is-streaming"></div>${renderMoreButton(query, nextOffset, cars.length)}`, { scroll: false });
    streamResultCards(message, nextCars);
    scrollConversationStart(message);
  }

  function cancelPendingReplyAnimation() {
    state.replySequence += 1;
    state.replyTimers.forEach((timer) => clearTimeout(timer));
    state.replyTimers = [];
  }

  function streamResultCards(message, cars) {
    const list = message.querySelector(".result-list");
    if (!list) return;

    const sequence = state.replySequence;
    const interval = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260;
    cars.forEach((car, index) => {
      const timer = setTimeout(() => {
        if (sequence !== state.replySequence) return;
        list.insertAdjacentHTML("beforeend", renderResultCard(car));
        if (index === cars.length - 1) {
          list.classList.remove("is-streaming");
          state.replyTimers = [];
          saveHistory();
        }
      }, interval * index);
      state.replyTimers.push(timer);
    });
  }

  function renderMoreButton(query, offset, total) {
    if (offset >= total) return "";
    const remaining = total - offset;
    const nextCount = Math.min(resultPageSize, remaining);
    return `
      <div class="reply-actions">
        <button type="button" class="show-more-cars" data-more-query="${escapeHtml(query)}" data-more-offset="${offset}">
          Показать еще ${nextCount}
        </button>
      </div>
    `;
  }

  function renderResultCard(car) {
    const title = car.title || `${car.brand || ""} ${car.model || ""}`.trim() || "Автомобиль";
    const displayTitle = formatCarTitle(car);
    const city = normalizeCityName(car.city);
    const summary = [city, car.mileage && `${car.mileage} км`, car.transmission].filter(Boolean).join(" · ");
    const specs = [
      ["Кузов", car.body],
      ["Мощн.", car.power],
      ["Двиг.", car.engine],
      ["Привод", car.drive],
      ["Руль", car.wheel]
    ].filter((item) => item[1]);
    const image = getCarImage(car);
    const url = getCarUrl(car);
    return `
      <article class="result-card ${image ? "has-image" : ""}">
        <div class="result-card-content">
          <h2>${escapeHtml(displayTitle)}</h2>
          <div class="price">${escapeHtml(formatMoney(car.price))}</div>
          <div class="meta">${escapeHtml(summary || "детали не указаны")}</div>
          ${renderSpecs(specs)}
        </div>
        ${image ? `<a class="result-card-image-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="Открыть ${escapeHtml(displayTitle)}" data-car-title="${escapeHtml(displayTitle)}" data-car-url="${escapeHtml(url)}"><img class="result-card-image" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy"></a>` : ""}
      </article>
    `;
  }

  function scrollConversationStart(anchorMessage) {
    if (!anchorMessage) {
      els.window.scrollTop = els.window.scrollHeight;
      return;
    }
    requestAnimationFrame(() => {
      const top = anchorMessage.offsetTop - els.window.offsetTop - 8;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      els.window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "auto" : "smooth" });
    });
  }

  function formatCarTitle(car) {
    const title = car.title || `${car.brand || ""} ${car.model || ""}`.trim() || "Автомобиль";
    return car.year ? `${title} ${car.year}` : title;
  }

  function formatCarLogItem(car) {
    return {
      title: formatCarTitle(car),
      brand: car.brand || "",
      model: car.model || "",
      year: car.year || "",
      price: car.price || null,
      city: normalizeCityName(car.city),
      mileage: parseMileageField(car.mileage) || null,
      transmission: car.transmission || "",
      body: car.body || "",
      engine: car.engine || "",
      drive: car.drive || "",
      power: car.power || "",
      wheel: car.wheel || "",
      url: getCarUrl(car)
    };
  }

  function renderChips(chips) {
    return chips.length ? `<div class="chips">${chips.join("")}</div>` : "";
  }

  function renderSpecs(specs) {
    if (!specs.length) return "";
    return `<dl class="specs">${specs.map(([label, value]) => `<div class="spec spec-${escapeHtml(label.toLowerCase().replace(/[^а-яa-z0-9]+/g, ""))}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
  }

  function getCarImage(car) {
    const url = String(car.image_url || car.image || car.photo || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  function normalizeCityName(value) {
    const text = String(value || "").trim();
    const cities = {
      "барнауле": "Барнаул",
      "екатеринбурге": "Екатеринбург",
      "кемерово": "Кемерово",
      "красноярске": "Красноярск",
      "новокузнецке": "Новокузнецк",
      "новосибирске": "Новосибирск",
      "омске": "Омск",
      "оренбурге": "Оренбург",
      "перми": "Пермь",
      "сургуте": "Сургут",
      "томске": "Томск",
      "тюмени": "Тюмень",
      "челябинске": "Челябинск"
    };
    return cities[normalizeText(text)] || text;
  }

  function renderCommandList() {
    return `
      <div class="command-list">
        ${commands.map((item) => `
          <button type="button" class="command-item" data-command="${escapeHtml(item.command)}">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.description)}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function showCommandMenu() {
    els.commandMenu.innerHTML = renderCommandList();
    els.commandMenu.hidden = false;
  }

  function hideCommandMenu() {
    els.commandMenu.hidden = true;
    els.commandMenu.innerHTML = "";
  }

  function getCommand(query) {
    const normalized = normalizeText(query).replace(/^\/\s*/, "");
    return commands.find((item) => normalizeText(item.command).replace(/^\/\s*/, "") === normalized)
      || commands.find((item) => normalizeText(item.label) === normalized);
  }

  function handleCommand(query) {
    const command = getCommand(query);
    hideCommandMenu();

    if (!command) {
      addMessage("user", `<p>${escapeHtml(query)}</p>`);
      addMessage("assistant", `<p>Выберите команду из списка.</p>${renderCommandList()}`);
      return true;
    }

    if (command.id === "clear") {
      localStorage.removeItem(storageKeys.history);
      els.window.innerHTML = "";
      addMessage("assistant", "<p>Чат очищен.</p>", { save: false, transient: true });
      return true;
    }

    addMessage("user", `<p>${escapeHtml(command.command)}</p>`);

    if (command.id === "font") {
      state.awaitingFontSize = true;
      addMessage("assistant", "<p>Введите размер шрифта числом от 10 до 18.</p>");
      return true;
    }

    if (command.id === "freshness") {
      addMessage("assistant", `<p>${escapeHtml(getDatabaseFreshness())}</p>`);
      return true;
    }

    if (command.id === "exportLogs") {
      const count = exportSearchLogs();
      addMessage("assistant", `<p>${count ? `Готово. Экспортировано событий: ${count}.` : "За последний час логов нет."}</p>`);
      return true;
    }

    return true;
  }

  function readSearchLog() {
    try {
      const items = JSON.parse(localStorage.getItem(storageKeys.searchLog) || "[]");
      return Array.isArray(items) ? items.filter((item) => item && item.timestamp) : [];
    } catch (error) {
      localStorage.removeItem(storageKeys.searchLog);
      return [];
    }
  }

  function recordSearchLog(payload) {
    const now = new Date();
    const twoDaysAgo = now.getTime() - 48 * 60 * 60 * 1000;
    const items = readSearchLog()
      .filter((item) => Date.parse(item.timestamp) >= twoDaysAgo)
      .slice(-499);
    items.push({
      timestamp: now.toISOString(),
      source: "assistant-chat",
      catalog_size: state.cars.length,
      ...payload
    });
    localStorage.setItem(storageKeys.searchLog, JSON.stringify(items));
  }

  function getSearchLogsForLastHour() {
    const since = Date.now() - 60 * 60 * 1000;
    return readSearchLog().filter((item) => Date.parse(item.timestamp) >= since);
  }

  function exportSearchLogs() {
    const items = getSearchLogsForLastHour();
    if (!items.length) return 0;

    const exportedAt = new Date();
    const payload = {
      exported_at: exportedAt.toISOString(),
      period: "last_hour",
      app: "CM66-BDCARS",
      catalog: getDatabaseFreshness({ compact: true }),
      items
    };
    const filename = `cm66-search-log-${formatFileDate(exportedAt)}.json`;
    downloadJson(filename, payload);
    return items.length;
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatFileDate(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  }

  function getDatabaseFreshness(options = {}) {
    if (!state.cars.length) return "База пока не загружена.";
    const dates = state.cars
      .map((car) => Date.parse(car.updated_at || car.updatedAt || car.updatedat || ""))
      .filter(Number.isFinite);

    if (!dates.length) {
      return options.compact
        ? `${state.cars.length} авто`
        : `${state.cars.length} авто в базе, дата обновления в таблице не указана.`;
    }

    const latest = new Date(Math.max(...dates));
    if (options.compact) return `${formatCompactDate(latest)} · ${state.cars.length} авто`;

    const formatted = new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(latest);
    return `База обновлялась: ${formatted}. Сейчас в базе ${state.cars.length} авто.`;
  }

  function formatCompactDate(date) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date).replace(",", "");
  }

  function handleFontSizeInput(query) {
    const size = Number(String(query).replace(/[^\d]/g, ""));
    addMessage("user", `<p>${escapeHtml(query)}</p>`);
    if (!Number.isInteger(size) || size < 10 || size > 18) {
      addMessage("assistant", "<p>Нужно число от 10 до 18. Например: 14.</p>");
      return true;
    }

    state.awaitingFontSize = false;
    applyFontSize(size);
    localStorage.setItem(storageKeys.fontSize, String(size));
    addMessage("assistant", `<p>Готово. Размер шрифта: ${size}px.</p>`);
    return true;
  }

  function applyFontSize(size) {
    document.documentElement.style.setProperty("--chat-font-size", `${size}px`);
  }

  function loadSettings() {
    const savedSize = Number(localStorage.getItem(storageKeys.fontSize));
    if (Number.isInteger(savedSize) && savedSize >= 10 && savedSize <= 18) {
      applyFontSize(savedSize);
    }
  }

  function saveHistory() {
    const items = Array.from(els.window.querySelectorAll(".message:not([data-transient])"))
      .slice(-80)
      .map((message) => ({
        type: message.classList.contains("user") ? "user" : "assistant",
        html: message.innerHTML
      }));
    localStorage.setItem(storageKeys.history, JSON.stringify(items));
  }

  function restoreHistory() {
    try {
      const items = JSON.parse(localStorage.getItem(storageKeys.history) || "[]");
      if (!Array.isArray(items) || !items.length) return;
      els.window.innerHTML = "";
      items.forEach((item) => addMessage(item.type === "user" ? "user" : "assistant", item.html || "", { save: false }));
    } catch (error) {
      localStorage.removeItem(storageKeys.history);
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function plural(count, forms) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  async function loadCars() {
    const params = new URLSearchParams(window.location.search);
    const csvFromUrl = params.get("csv");
    const initialQuery = params.get("q");
    const useDemoFallback = params.get("demo") === "1";
    const csvUrl = csvFromUrl || config.sheetCsvUrl;
    els.status.textContent = "Загрузка каталога...";
    try {
      state.cars = await loadCsvCars(csvUrl);
      if (!state.cars.length) throw new Error("Каталог пуст");
      els.status.textContent = getDatabaseFreshness({ compact: true });
      runInitialQuery(initialQuery);
    } catch (error) {
      if (!config.fallbackCsvUrl || csvFromUrl || !useDemoFallback) {
        els.status.textContent = "CSV не загружен";
        addMessage("assistant", `<p>Основная BD не загрузилась: ${escapeHtml(error.message)}.</p><p>Проверьте, что таблица опубликована как CSV и в листе BD есть строки с авто.</p>`);
        return;
      }

      try {
        state.cars = await loadCsvCars(config.fallbackCsvUrl);
        els.status.textContent = `${state.cars.length} авто · демо`;
        if (!initialQuery) {
          addMessage("assistant", "<p>Основная таблица пока недоступна. Временно показываю демо-базу.</p>");
        }
        runInitialQuery(initialQuery);
      } catch (fallbackError) {
        els.status.textContent = "CSV не загружен";
        addMessage("assistant", `<p>Не удалось загрузить каталог: ${escapeHtml(fallbackError.message)}</p>`);
      }
    }
  }

  async function loadCsvCars(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (/^\s*</.test(text)) throw new Error("CSV-ссылка вернула HTML вместо таблицы");
    return parseCsv(text).filter((car) => car.title || car.url);
  }

  function runInitialQuery(query) {
    if (!query) return;
    els.window.innerHTML = "";
    els.input.value = query;
    const userMessage = addMessage("user", `<p>${escapeHtml(query)}</p>`, { scroll: false });
    renderAssistantReply(query, userMessage);
    els.input.value = "";
  }

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = els.input.value.trim();
    if (!query) return;

    if (state.awaitingFontSize) {
      handleFontSizeInput(query);
      els.input.value = "";
      els.input.focus();
      return;
    }

    if (query.startsWith("/")) {
      handleCommand(query);
      els.input.value = "";
      els.input.focus();
      return;
    }

    const userMessage = addMessage("user", `<p>${escapeHtml(query)}</p>`, { scroll: false });
    renderAssistantReply(query, userMessage);
    els.input.value = "";
    els.input.focus();
  });

  els.input.addEventListener("input", () => {
    const value = els.input.value.trim();
    if (value.startsWith("/")) showCommandMenu();
    else hideCommandMenu();
  });

  els.commandMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-command]");
    if (!button) return;
    els.input.value = button.dataset.command;
    els.form.requestSubmit();
  });

  els.window.addEventListener("click", (event) => {
    const moreButton = event.target.closest("[data-more-query]");
    if (moreButton) {
      moreButton.disabled = true;
      moreButton.closest(".reply-actions")?.remove();
      renderMoreResults(moreButton.dataset.moreQuery || "", Number(moreButton.dataset.moreOffset) || 0);
      return;
    }

    const button = event.target.closest("[data-command]");
    if (button) {
      els.input.value = button.dataset.command;
      els.form.requestSubmit();
      return;
    }

    const carLink = event.target.closest(".result-card-image-link[data-car-url]");
    if (!carLink) return;
    recordSearchLog({
      type: "click",
      clicked_title: carLink.dataset.carTitle || "",
      clicked_url: carLink.dataset.carUrl || carLink.href
    });
  });

  loadSettings();
  restoreHistory();
  loadCars();
})();
