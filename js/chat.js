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

  function parseQuery(rawQuery) {
    const expensiveIntent = extractExpensiveIntent(rawQuery);
    const queryWithoutExpensiveIntent = removeExpensiveIntentPhrases(rawQuery);
    const cheapIntent = extractCheapIntent(queryWithoutExpensiveIntent);
    const mileage = extractMileage(queryWithoutExpensiveIntent);
    const explicitBudget = extractBudget(removeMileagePhrases(queryWithoutExpensiveIntent));
    const budget = explicitBudget || (cheapIntent ? 200000 : null);
    const drive = extractDrive(queryWithoutExpensiveIntent);
    const query = compactKnownPhrases(normalizeText(removeCheapIntentPhrases(removeDrivePhrases(removeBudgetPhrases(removeMileagePhrases(queryWithoutExpensiveIntent))))));
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
      cheapIntent,
      expensiveIntent,
      mileage,
      drive,
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
      .replace(getBudgetPattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeMileagePhrases(query) {
    return String(query || "")
      .replace(getMileagePattern(), " ")
      .replace(/\s+/g, " ");
  }

  function removeDrivePhrases(query) {
    return String(query || "")
      .replace(getDrivePattern(), " ")
      .replace(/\s+/g, " ");
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
    return /(?:до|<=|<|меньше|дешевле|не\s+дороже|бюджет(?:ом)?|цена\s+до|стоимость\s+до)?\s*\d+(?:[\s.,]\d+)*\s*(?:млн|мил(?:лион(?:а|ов)?)?|m|м|тыс(?:яч)?|тр|к|k)(?=$|\s|[.,!?])|(?:до|<=|<|меньше|дешевле|не\s+дороже|бюджет(?:ом)?|цена\s+до|стоимость\s+до)\s*\d+(?:[\s.,]\d+)*|\b[1-9]\d{5,7}\b/gi;
  }

  function extractBudget(rawQuery) {
    const text = String(rawQuery || "").toLowerCase().replace(/ё/g, "е");
    const matches = Array.from(text.matchAll(getBudgetPattern()));
    const budgets = matches
      .map((match) => parseBudgetValue(match[0]))
      .filter((value) => value >= 50000 && value <= 50000000);
    return budgets.length ? Math.max(...budgets) : null;
  }

  function getMileagePattern() {
    const mileageNumber = String.raw`\d+(?:[.,]\d+)?(?:\s?\d{3})*`;
    return new RegExp(String.raw`(?:пробег(?:ом)?|километраж(?:ем)?|км|km)\s*(?:до|<=|<|меньше|не\s+более|не\s+выше)?\s*${mileageNumber}\s*(?:тыс(?:яч)?|т|к|k|км|km)?|(?:до|<=|<|меньше|не\s+более|не\s+выше)\s*${mileageNumber}\s*(?:тыс(?:яч)?|т|к|k)?\s*(?:км|km|пробег(?:а|ом)?|километраж(?:а|ем)?)`, "gi");
  }

  function extractMileage(rawQuery) {
    const text = String(rawQuery || "").toLowerCase().replace(/ё/g, "е");
    const matches = Array.from(text.matchAll(getMileagePattern()));
    const mileages = matches
      .map((match) => parseMileageValue(match[0]))
      .filter((value) => value >= 1000 && value <= 1000000);
    return mileages.length ? Math.max(...mileages) : null;
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

  function extractDrive(rawQuery) {
    const text = normalizeText(rawQuery);
    if (/(передний|переднем|передн\s+привод|fwd)/.test(text)) return "передний";
    if (/(задний|заднем|задн\s+привод|rwd)/.test(text)) return "задний";
    if (/(полный|полном|полн\s+привод|полнопривод|4wd|awd|4вд|4 x 4|4x4)/.test(text)) return "полный";
    return "";
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
    if (parsed.budget && car.price > parsed.budget) return -1;
    if (parsed.mileage && parseMileageField(car.mileage) > parsed.mileage) return -1;
    if (parsed.transmission && !transmissionMatches(car.transmission, parsed.transmission)) return -1;
    if (parsed.drive && !driveMatches(car.drive, parsed.drive)) return -1;

    for (const match of parsed.termMatches) {
      if (!termMatchesCar(car, text, match)) return -1;
      score += 4;
    }

    if (parsed.budget && car.price) score += Math.max(0, 3 - Math.floor((parsed.budget - car.price) / 200000));
    if (parsed.mileage && car.mileage) score += Math.max(0, 3 - Math.floor((parsed.mileage - parseMileageField(car.mileage)) / 30000));
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
      cheap_intent: Boolean(parsed.cheapIntent),
      expensive_intent: Boolean(parsed.expensiveIntent),
      mileage: parsed.mileage || null,
      drive: parsed.drive || "",
      transmission: parsed.transmission || "",
      results_count: cars.length,
      shown_count: visibleCars.length,
      results: visibleCars.map(formatCarLogItem)
    });
    const chips = parsed.canonicalTerms.map((term) => `<span class="chip">${escapeHtml(term)}</span>`);
    if (parsed.cheapIntent) chips.push('<span class="chip">самые дешевые</span>');
    if (parsed.expensiveIntent) chips.push('<span class="chip">топ дорогих</span>');
    if (parsed.budget) chips.push(`<span class="chip">до ${formatMoney(parsed.budget)}</span>`);
    if (parsed.mileage) chips.push(`<span class="chip">пробег до ${formatMileage(parsed.mileage)}</span>`);
    if (parsed.drive) chips.push(`<span class="chip">${escapeHtml(parsed.drive)} привод</span>`);
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
