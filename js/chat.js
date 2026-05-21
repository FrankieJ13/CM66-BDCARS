(function () {
  const config = window.AUTO_ASSISTANT_CONFIG || {};
  const dictionary = window.AUTO_ASSISTANT_DICTIONARY || {};
  const state = { cars: [] };

  const els = {
    form: document.getElementById("chatForm"),
    input: document.getElementById("chatInput"),
    window: document.getElementById("chatWindow"),
    status: document.getElementById("catalogStatus")
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

    const headers = (rows.shift() || []).map(normalizeText);
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

  function parseMoney(value) {
    const text = String(value || "").replace(/[^\d]/g, "");
    return text ? Number(text) : 0;
  }

  function formatMoney(value) {
    return value ? `${Number(value).toLocaleString("ru-RU")} ₽` : "цена по запросу";
  }

  function parseQuery(rawQuery) {
    const budget = extractBudget(rawQuery);
    const query = compactKnownPhrases(normalizeText(removeBudgetPhrases(rawQuery)));
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
      return !automaticWords.includes(term) && !manualWords.includes(term) && !stopWords.includes(term);
    });

    return {
      budget,
      transmission,
      terms: searchable,
      canonicalTerms: searchable.map(canonicalToken),
      expandedTerms: searchable.map(expandToken)
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

  function carSearchText(car) {
    const base = normalizeText([car.brand, car.model, car.title, car.city, car.transmission].join(" "));
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
    if (parsed.transmission && !transmissionMatches(car.transmission, parsed.transmission)) return -1;

    for (const variants of parsed.expandedTerms) {
      if (!variants.some((term) => text.includes(term))) return -1;
      score += 4;
    }

    if (parsed.budget && car.price) score += Math.max(0, 3 - Math.floor((parsed.budget - car.price) / 200000));
    return score;
  }

  function transmissionMatches(value, requested) {
    const text = normalizeText(value);
    if (!requested) return true;
    if (requested === "механика") return /механ|manual|mkpp|мкпп|руч/.test(text);
    return /автомат|automatic|auto|akpp|акпп|вариатор|cvt|робот|dsg|дсг/.test(text);
  }

  function searchCars(query) {
    const parsed = parseQuery(query);
    const cars = state.cars
      .map((car) => ({ car, score: scoreCar(car, parsed) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.car.price - b.car.price)
      .slice(0, config.maxResults || 5)
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

  function addMessage(type, html) {
    const message = document.createElement("article");
    message.className = `message ${type}`;
    message.innerHTML = html;
    els.window.appendChild(message);
    els.window.scrollTop = els.window.scrollHeight;
  }

  function renderAssistantReply(query) {
    const { parsed, cars } = searchCars(query);
    const chips = parsed.canonicalTerms.map((term) => `<span class="chip">${escapeHtml(term)}</span>`);
    if (parsed.budget) chips.push(`<span class="chip">до ${formatMoney(parsed.budget)}</span>`);
    if (parsed.transmission) chips.push(`<span class="chip">${escapeHtml(parsed.transmission)}</span>`);

    if (!cars.length) {
      addMessage("assistant", `<p>Пока не нашел подходящих авто. Можно убрать город, коробку или повысить бюджет.</p>${renderChips(chips)}`);
      return;
    }

    const cards = cars.map((car) => {
      const title = car.title || `${car.brand || ""} ${car.model || ""}`.trim() || "Автомобиль";
      const details = [car.year, car.city, car.transmission].filter(Boolean).join(" · ");
      return `
        <article class="result-card">
          <h2>${escapeHtml(title)}</h2>
          <div class="price">${escapeHtml(formatMoney(car.price))}</div>
          <div class="meta">${escapeHtml(details || "детали не указаны")}</div>
          <a href="${escapeHtml(getCarUrl(car))}" target="_blank" rel="noopener">Ссылка</a>
        </article>
      `;
    }).join("");

    addMessage("assistant", `<p>Нашел ${cars.length} ${plural(cars.length, ["вариант", "варианта", "вариантов"])}.</p>${renderChips(chips)}<div class="result-list">${cards}</div>`);
  }

  function renderChips(chips) {
    return chips.length ? `<div class="chips">${chips.join("")}</div>` : "";
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
    const csvUrl = csvFromUrl || config.sheetCsvUrl;
    els.status.textContent = "Загрузка каталога...";
    try {
      state.cars = await loadCsvCars(csvUrl);
      if (!state.cars.length) throw new Error("Каталог пуст");
      els.status.textContent = `${state.cars.length} авто в базе`;
      runInitialQuery(initialQuery);
    } catch (error) {
      if (!config.fallbackCsvUrl || csvFromUrl) {
        els.status.textContent = "CSV не загружен";
        addMessage("assistant", `<p>Не удалось загрузить каталог: ${escapeHtml(error.message)}</p>`);
        return;
      }

      try {
        state.cars = await loadCsvCars(config.fallbackCsvUrl);
        els.status.textContent = `${state.cars.length} авто в демо-базе`;
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
    return parseCsv(await response.text()).filter((car) => car.title || car.url);
  }

  function runInitialQuery(query) {
    if (!query) return;
    els.window.innerHTML = "";
    els.input.value = query;
    addMessage("user", `<p>${escapeHtml(query)}</p>`);
    renderAssistantReply(query);
    els.input.value = "";
  }

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = els.input.value.trim();
    if (!query) return;
    addMessage("user", `<p>${escapeHtml(query)}</p>`);
    renderAssistantReply(query);
    els.input.value = "";
    els.input.focus();
  });

  loadCars();
})();
