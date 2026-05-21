const SPREADSHEET_ID = '1Ad27O54xpAS4vcHPA9Ds4e4pyAMN7SLgz6w0kgo44iU';
const SHEET_NAME = 'BD';
const LOG_SHEET_NAME = 'sync_log';
const HEADERS = ['brand', 'model', 'title', 'year', 'price', 'city', 'mileage', 'transmission', 'url', 'updated_at'];
const MAX_PAGES_PER_CITY = 3;
const REQUEST_PAUSE_MS = 1200;

const CITY_CATALOGS = [
  'https://crystal-motors.ru/avtomobili_s_probegom',
  'https://chel.crystal-motors.ru/avtomobili_s_probegom',
  'https://tumen.crystal-motors.ru/avtomobili_s_probegom',
  'https://tomsk.crystal-motors.ru/avtomobili_s_probegom',
  'https://omsk.crystal-motors.ru/avtomobili_s_probegom',
  'https://krasnoyarsk.crystal-motors.ru/avtomobili_s_probegom',
  'https://surgut.crystal-motors.ru/avtomobili_s_probegom',
  'https://novosib.crystal-motors.ru/avtomobili_s_probegom',
  'https://nkz.crystal-motors.ru/avtomobili_s_probegom',
  'https://kemerovo.crystal-motors.ru/avtomobili_s_probegom',
  'https://barnaul.crystal-motors.ru/avtomobili_s_probegom',
  'https://perm.crystal-motors.ru/avtomobili_s_probegom',
  'https://orenburg.crystal-motors.ru/avtomobili_s_probegom'
];

function setupCrystalMotorsSync() {
  writeHeaders_();
  deleteExistingTriggers_('refreshCrystalMotorsCatalog');
  createCrystalMotorsTrigger();
  logSync_('setup', 'OK', 'Headers created, trigger installed');
}

function refreshCrystalMotorsCatalog() {
  try {
    const sheet = getCarsSheet_();
    const found = new Map();

    CITY_CATALOGS.forEach((catalogUrl) => {
      for (let page = 1; page <= MAX_PAGES_PER_CITY; page += 1) {
        const url = page === 1 ? catalogUrl : `${catalogUrl}/?PAGEN_1=${page}`;
        const cars = parseCatalogPage_(fetchText_(url), catalogUrl);
        if (!cars.length) break;
        cars.forEach((car) => found.set(car.url, car));
        Utilities.sleep(REQUEST_PAUSE_MS);
      }
    });

    const rows = Array.from(found.values())
      .sort((a, b) => String(a.city).localeCompare(String(b.city), 'ru') || Number(a.price) - Number(b.price))
      .map((car) => HEADERS.map((header) => car[header] || ''));

    sheet.clearContents();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.autoResizeColumns(1, HEADERS.length);
    logSync_('refresh', 'OK', `${rows.length} cars written`);
  } catch (error) {
    logSync_('refresh', 'ERROR', error.stack || error.message);
    throw error;
  }
}

function createCrystalMotorsTrigger() {
  ScriptApp.newTrigger('refreshCrystalMotorsCatalog')
    .timeBased()
    .everyMinutes(30)
    .create();
}

function testCrystalMotorsParser() {
  const url = CITY_CATALOGS[0];
  const cars = parseCatalogPage_(fetchText_(url), url);
  logSync_('test', cars.length ? 'OK' : 'EMPTY', `${cars.length} cars parsed from ${url}`);
  return cars.slice(0, 5);
}

function writeHeaders_() {
  const sheet = getCarsSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
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

function logSync_(action, status, message) {
  getLogSheet_().appendRow([new Date().toISOString(), action, status, String(message || '').slice(0, 1000)]);
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

function parseCatalogPage_(html, baseUrl) {
  const cars = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1];
    if (!/\/avtomobili_s_probegom\//i.test(href) || /^javascript:/i.test(href) || href.indexOf('#') === 0) continue;

    const text = cleanText_(stripTags_(match[2]));
    if (!/В наличии в/i.test(text) || !/Добавить в список избранного/i.test(text) || !/Купить в кредит/i.test(text)) continue;

    const car = parseCardText_(text, absoluteUrl_(href, baseUrl));
    if (car.url && car.title && car.price) cars.push(car);
  }

  return dedupeCars_(cars);
}

function parseCardText_(text, url) {
  const cityMatch = text.match(/В наличии в\s+([А-Яа-яЁё\-\s]+?)\s+\$?\(?document/i);
  const titleMatch = text.match(/\}\);\s*([^]+?)\s+Добавить в список избранного/i);
  const specsMatch = text.match(/(\d{4})\s*\/\s*([А-Яа-яЁёA-Za-z\s]+)/i);
  const priceMatch = text.match(/(\d[\d\s]{2,})\s*₽/);
  const title = cleanText_(titleMatch ? titleMatch[1] : '');
  const brandModel = splitBrandModel_(title);

  return {
    brand: brandModel.brand,
    model: brandModel.model,
    title,
    year: specsMatch ? specsMatch[1] : '',
    price: priceMatch ? onlyDigits_(priceMatch[1]) : '',
    city: cleanText_(cityMatch ? cityMatch[1] : ''),
    mileage: '',
    transmission: specsMatch ? cleanText_(specsMatch[2]) : '',
    url,
    updated_at: new Date().toISOString()
  };
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

function dedupeCars_(cars) {
  const map = new Map();
  cars.forEach((car) => map.set(car.url, car));
  return Array.from(map.values());
}

function stripTags_(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
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
