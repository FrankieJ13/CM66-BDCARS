const SPREADSHEET_ID = '1Ad27O54xpAS4vcHPA9Ds4e4pyAMN7SLgz6w0kgo44iU';
const SHEET_NAME = 'BD';
const LOG_SHEET_NAME = 'sync_log';
const BUFFER_SHEET_NAME = 'sync_buffer';
const HEADERS = ['brand', 'model', 'title', 'year', 'price', 'city', 'mileage', 'transmission', 'url', 'updated_at'];
const CATALOG_URL = 'https://crystal-motors.ru/avtomobili_s_probegom';
const MAX_CATALOG_PAGES = 160;
const CATALOG_PAGE_SIZE = 24;
const PAGES_PER_RUN = 18;
const REQUEST_PAUSE_MS = 450;
const AUTO_REFRESH_INTERVAL_MINUTES = 90;
const ASSISTANT_URL = 'https://frankiej13.github.io/CM66-BDCARS/';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CM66 авто')
    .addItem('Обновить базу сейчас', 'menuRefreshCatalog')
    .addItem('Настроить автообновление', 'menuSetupSync')
    .addSeparator()
    .addItem('Сбросить прогресс обновления', 'menuResetSync')
    .addSeparator()
    .addItem('Проверить парсер', 'menuTestParser')
    .addItem('Открыть ассистента', 'menuOpenAssistant')
    .addToUi();
}

function menuRefreshCatalog() {
  refreshCrystalMotorsCatalog();
  SpreadsheetApp.getUi().alert('Готово: обработан очередной пакет страниц. Подробности смотрите во вкладке sync_log.');
}

function menuSetupSync() {
  setupCrystalMotorsSync();
  SpreadsheetApp.getUi().alert('Готово: автообновление включено. База будет обновляться примерно раз в 1,5 часа.');
}

function menuTestParser() {
  const cars = testCrystalMotorsParser();
  SpreadsheetApp.getUi().alert(`Проверка завершена: найдено ${cars.length} авто на первой странице. Подробности смотрите во вкладке sync_log.`);
}

function menuResetSync() {
  resetCatalogSyncProgress();
  SpreadsheetApp.getUi().alert('Готово: прогресс обновления сброшен. Следующий запуск начнет каталог с первой страницы.');
}

function menuOpenAssistant() {
  const html = HtmlService
    .createHtmlOutput(`<script>window.open('${ASSISTANT_URL}', '_blank');google.script.host.close();</script>`)
    .setWidth(120)
    .setHeight(40);
  SpreadsheetApp.getUi().showModalDialog(html, 'Открываем ассистента');
}

function setupCrystalMotorsSync() {
  writeHeaders_();
  deleteExistingTriggers_('scheduledRefreshCrystalMotorsCatalog');
  createCrystalMotorsTrigger();
  logSync_('setup', 'OK', 'Headers created, 90-minute guarded trigger installed. Run refreshCrystalMotorsCatalog to fill BD now.');
}

function setupAndRefreshCrystalMotorsSync() {
  setupCrystalMotorsSync();
  refreshCrystalMotorsCatalog();
}

function refreshCrystalMotorsCatalog() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const startPage = Number(properties.getProperty('next_page') || 1);
    const existingCars = readBufferedCars_();
    const found = new Map(existingCars.map((car) => [car.url, car]));
    let nextPage = startPage;
    let finished = false;
    let pagesProcessed = 0;

    for (let page = startPage; page < startPage + PAGES_PER_RUN && page <= MAX_CATALOG_PAGES; page += 1) {
      const cars = fetchCatalogPage_(page);
      if (!cars.length) {
        finished = true;
        break;
      }
      cars.forEach((car) => found.set(car.url, car));
      nextPage = page + 1;
      pagesProcessed += 1;
      Utilities.sleep(REQUEST_PAUSE_MS);
    }

    if (pagesProcessed > 0 && found.size < CATALOG_PAGE_SIZE * (nextPage - 1) * 0.5) {
      logSync_('refresh_batch', 'WARN', `Only ${found.size} unique cars after ${nextPage - 1} pages. Check source pagination if this repeats.`);
    }
    if (nextPage > MAX_CATALOG_PAGES) finished = true;

    writeBufferedCars_(Array.from(found.values()));
    properties.setProperty('next_page', String(nextPage));

    if (!finished) {
      logSync_('refresh_batch', 'CONTINUE', `Pages ${startPage}-${nextPage - 1} processed, ${found.size} cars buffered, next page ${nextPage}`);
      return;
    }

    writeCarsToSheet_(Array.from(found.values()));
    properties.setProperty('last_refresh_at', String(Date.now()));
    properties.deleteProperty('next_page');
    clearBufferedCars_();
    logSync_('refresh', 'OK', `${found.size} cars written from full catalog in batches`);
  } catch (error) {
    logSync_('refresh', 'ERROR', error.stack || error.message);
    throw error;
  }
}

function createCrystalMotorsTrigger() {
  ScriptApp.newTrigger('scheduledRefreshCrystalMotorsCatalog')
    .timeBased()
    .everyMinutes(30)
    .create();
}

function scheduledRefreshCrystalMotorsCatalog() {
  const properties = PropertiesService.getScriptProperties();
  const hasActiveBatch = Boolean(properties.getProperty('next_page'));
  if (hasActiveBatch) {
    refreshCrystalMotorsCatalog();
    return;
  }

  const lastRefresh = Number(properties.getProperty('last_refresh_at') || 0);
  const ageMinutes = (Date.now() - lastRefresh) / 60000;
  if (lastRefresh && ageMinutes < AUTO_REFRESH_INTERVAL_MINUTES) {
    logSync_('scheduled_refresh', 'SKIP', `Last refresh was ${Math.round(ageMinutes)} minutes ago`);
    return;
  }
  refreshCrystalMotorsCatalog();
}

function resetCatalogSyncProgress() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('next_page');
  clearBufferedCars_();
  logSync_('reset', 'OK', 'Catalog sync progress cleared');
}

function testCrystalMotorsParser() {
  const cars = fetchCatalogPage_(1);
  const page2Cars = fetchCatalogPage_(2);
  logSync_('test', cars.length && page2Cars.length ? 'OK' : 'EMPTY', `${cars.length} cars parsed from page 1, ${page2Cars.length} cars parsed from AJAX page 2`);
  return cars.slice(0, 5);
}

function writeHeaders_() {
  const sheet = getCarsSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function writeCarsToSheet_(cars) {
  const sheet = getCarsSheet_();
  const rows = cars
    .sort((a, b) => String(a.city).localeCompare(String(b.city), 'ru') || Number(a.price) - Number(b.price))
    .map((car) => HEADERS.map((header) => car[header] || ''));

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function readBufferedCars_() {
  const values = getBufferSheet_().getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map((value) => String(value).trim());
  return values.slice(1).map((row) => {
    const car = {};
    headers.forEach((header, index) => {
      car[header] = row[index];
    });
    return car;
  }).filter((car) => car.url);
}

function writeBufferedCars_(cars) {
  const sheet = getBufferSheet_();
  const rows = cars.map((car) => HEADERS.map((header) => car[header] || ''));
  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  sheet.hideSheet();
}

function clearBufferedCars_() {
  const sheet = getBufferSheet_();
  sheet.clearContents();
  sheet.hideSheet();
}

function deleteExistingTriggers_(handlerName) {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function getCarsSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  return sheet;
}

function getLogSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([['timestamp', 'action', 'status', 'message']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getBufferSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(BUFFER_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(BUFFER_SHEET_NAME);
  }
  return sheet;
}

function logSync_(action, status, message) {
  getLogSheet_().appendRow([new Date().toISOString(), action, status, String(message || '').slice(0, 1000)]);
}

function fetchCatalogPage_(page) {
  if (page <= 1) return parseCatalogPage_(fetchText_(CATALOG_URL), CATALOG_URL);
  return parseCatalogPage_(fetchAjaxPageText_(page), CATALOG_URL);
}

function fetchText_(url) {
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 CM66-BDCARS inventory sync' }
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`HTTP ${code}: ${url}`);
  return response.getContentText('UTF-8');
}

function fetchAjaxPageText_(page) {
  const response = UrlFetchApp.fetch(CATALOG_URL, {
    method: 'post',
    payload: `ajax=true&page=${page}`,
    contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 CM66-BDCARS inventory sync',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': CATALOG_URL
    }
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`HTTP ${code}: ${CATALOG_URL} ajax page ${page}`);
  return response.getContentText('UTF-8');
}

function parseCatalogPage_(html, baseUrl) {
  const cars = [];
  const anchorPattern = /<a\b[^>]*class=["'][^"']*product_card[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1];
    if (/^javascript:/i.test(href) || href.indexOf('#') === 0) continue;

    const text = cleanText_(stripTags_(match[2]));
    if (!/В наличии в/i.test(text) || !/Добавить в список избранного/i.test(text) || !/Купить в кредит/i.test(text)) continue;

    const car = parseCardText_(text, href ? absoluteUrl_(href, baseUrl) : '');
    if (car.url && car.title && car.price) cars.push(car);
  }

  if (cars.length) return dedupeCars_(cars);

  return dedupeCars_(parseCardTextBlocks_(html));
}

function parseCardText_(text, url) {
  const cityTitleMatch = text.match(new RegExp(`В наличии в\\s+(${getCityPattern_()})\\s+([\\s\\S]+?)\\s+Добавить в список избранного`, 'i'));
  const specsMatch = text.match(/(\d{4})\s*\/\s*([А-Яа-яЁёA-Za-z\s]+)/i);
  const priceMatch = text.match(/(\d[\d\s]{2,})\s*₽/);
  const city = cleanText_(cityTitleMatch ? cityTitleMatch[1] : '');
  const title = cleanTitle_(cityTitleMatch ? cityTitleMatch[2] : '');
  const brandModel = splitBrandModel_(title);

  return {
    brand: brandModel.brand,
    model: brandModel.model,
    title,
    year: specsMatch ? specsMatch[1] : '',
    price: priceMatch ? onlyDigits_(priceMatch[1]) : '',
    city,
    mileage: '',
    transmission: specsMatch ? cleanText_(specsMatch[2]) : '',
    url: isUsefulCarUrl_(url) ? url : buildCatalogUrl_(brandModel.brand, brandModel.model, city),
    updated_at: new Date().toISOString()
  };
}

function parseCardTextBlocks_(html) {
  const text = cleanText_(stripTags_(html));
  const cars = [];
  const pattern = new RegExp(`В наличии в\\s+(${getCityPattern_()})\\s+([\\s\\S]+?)\\s+Добавить в список избранного[\\s\\S]*?(\\d{4})\\s*\\/\\s*([А-Яа-яЁёA-Za-z\\s]+?)\\s+(\\d[\\d\\s]{2,})\\s*₽[\\s\\S]*?Купить в кредит`, 'g');
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const city = cleanText_(match[1]);
    const title = cleanTitle_(match[2]);
    const brandModel = splitBrandModel_(title);
    cars.push({
      brand: brandModel.brand,
      model: brandModel.model,
      title,
      year: match[3],
      price: onlyDigits_(match[5]),
      city,
      mileage: '',
      transmission: cleanText_(match[4]),
      url: buildCatalogUrl_(brandModel.brand, brandModel.model, city),
      updated_at: new Date().toISOString()
    });
  }

  return cars;
}

function splitBrandModel_(title) {
  const knownBrands = ['ВАЗ (LADA)', 'Land Rover', 'Great Wall', 'GAC Trumpchi', 'Renault Samsung', 'Lynk & Co', 'Mercedes-Benz'];
  const known = knownBrands.find((brand) => title.indexOf(brand) === 0);
  if (known) return { brand: known, model: cleanText_(title.slice(known.length)) };

  const parts = title.split(/\s+/);
  return { brand: parts.shift() || '', model: parts.join(' ') };
}

function absoluteUrl_(href, baseUrl) {
  if (/^https?:\/\//i.test(href)) return href;
  const origin = baseUrl.match(/^https?:\/\/[^/]+/i)[0];
  return `${origin}${href.charAt(0) === '/' ? '' : '/'}${href}`;
}

function isUsefulCarUrl_(url) {
  return /^https?:\/\//i.test(url) && /\/avtomobili_s_probegom\/.+/i.test(url);
}

function buildCatalogUrl_(brand, model, city) {
  const host = getCityHost_(city);
  const brandSlug = slugify_(brand);
  const modelSlug = slugify_(model);
  const parts = ['avtomobili_s_probegom'];
  if (brandSlug) parts.push(brandSlug);
  if (modelSlug) parts.push(modelSlug);
  return `https://${host}/${parts.join('/')}`;
}

function getCityHost_(city) {
  const normalized = cleanText_(city).toLowerCase();
  const hosts = {
    'екатеринбурге': 'crystal-motors.ru',
    'екатеринбург': 'crystal-motors.ru',
    'челябинске': 'chel.crystal-motors.ru',
    'челябинск': 'chel.crystal-motors.ru',
    'тюмени': 'tumen.crystal-motors.ru',
    'тюмень': 'tumen.crystal-motors.ru',
    'томске': 'tomsk.crystal-motors.ru',
    'томск': 'tomsk.crystal-motors.ru',
    'омске': 'omsk.crystal-motors.ru',
    'омск': 'omsk.crystal-motors.ru',
    'красноярске': 'krasnoyarsk.crystal-motors.ru',
    'красноярск': 'krasnoyarsk.crystal-motors.ru',
    'сургуте': 'surgut.crystal-motors.ru',
    'сургут': 'surgut.crystal-motors.ru',
    'новосибирске': 'novosib.crystal-motors.ru',
    'новосибирск': 'novosib.crystal-motors.ru',
    'новокузнецке': 'nkz.crystal-motors.ru',
    'новокузнецк': 'nkz.crystal-motors.ru',
    'кемерово': 'kemerovo.crystal-motors.ru',
    'барнауле': 'barnaul.crystal-motors.ru',
    'барнаул': 'barnaul.crystal-motors.ru',
    'перми': 'perm.crystal-motors.ru',
    'пермь': 'perm.crystal-motors.ru',
    'оренбурге': 'orenburg.crystal-motors.ru',
    'оренбург': 'orenburg.crystal-motors.ru'
  };
  return hosts[normalized] || 'crystal-motors.ru';
}

function slugify_(value) {
  const dictionary = {
    'ваз (lada)': 'lada',
    'mercedes-benz': 'mercedes-benz',
    'cx-5': 'cx-5',
    'golf plus': 'golf-plus',
    'vesta cross': 'vesta-cross'
  };
  const normalized = cleanText_(value).toLowerCase();
  if (dictionary[normalized]) return dictionary[normalized];
  return normalized
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я\s-]/g, '')
    .replace(/[а-я]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function dedupeCars_(cars) {
  const map = new Map();
  cars.forEach((car) => map.set(car.url, car));
  return Array.from(map.values());
}

function stripTags_(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

function getCityPattern_() {
  return [
    'Екатеринбурге',
    'Екатеринбург',
    'Челябинске',
    'Челябинск',
    'Тюмени',
    'Тюмень',
    'Томске',
    'Томск',
    'Омске',
    'Омск',
    'Красноярске',
    'Красноярск',
    'Сургуте',
    'Сургут',
    'Новосибирске',
    'Новосибирск',
    'Новокузнецке',
    'Новокузнецк',
    'Кемерово',
    'Барнауле',
    'Барнаул',
    'Перми',
    'Пермь',
    'Оренбурге',
    'Оренбург'
  ].join('|');
}

function cleanTitle_(value) {
  return cleanText_(value)
    .replace(/^Витринный образец\s+/i, '')
    .replace(/^Со скидкой\s+/i, '')
    .trim();
}

function cleanText_(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyDigits_(value) {
  return String(value || '').replace(/[^\d]/g, '');
}
