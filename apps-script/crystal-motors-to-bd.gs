const SPREADSHEET_ID = '1Ad27O54xpAS4vcHPA9Ds4e4pyAMN7SLgz6w0kgo44iU';
const SHEET_NAME = 'BD';
const LOG_SHEET_NAME = 'sync_log';
const BUFFER_SHEET_NAME = 'sync_buffer';
const HEADERS = ['brand', 'model', 'title', 'year', 'price', 'city', 'mileage', 'body', 'engine', 'drive', 'power', 'transmission', 'wheel', 'image_url', 'url', 'updated_at'];
const CATALOG_URL = 'https://crystal-motors.ru/avtomobili_s_probegom';
const MAX_CATALOG_PAGES = 160;
const CATALOG_PAGE_SIZE = 24;
const PAGES_PER_RUN = 18;
const DAY_INCREMENTAL_PAGES = 12;
const DETAILS_PER_RUN = 40;
const REQUEST_PAUSE_MS = 450;
const NEXT_BATCH_DELAY_MS = 60 * 1000;
const DAYTIME_START_HOUR = 8;
const DAYTIME_END_HOUR = 21;
const NIGHTLY_FULL_REFRESH_HOUR = 21;
const NIGHTLY_COUNT_CHECK_HOUR = 23;
const NIGHTLY_COUNT_CHECK_MINUTE = 50;
const SITE_COUNT_TOLERANCE = 40;
const ASSISTANT_URL = 'https://frankiej13.github.io/CM66-BDCARS/';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CM66 авто')
    .addItem('Продолжить полное обновление', 'menuContinueCatalogRefresh')
    .addItem('Начать полное обновление с нуля', 'menuStartFullCatalogRefresh')
    .addItem('Дневной апдейт без очистки', 'menuIncrementalRefreshCatalog')
    .addItem('Записать буфер в BD', 'menuFlushCatalogBuffer')
    .addItem('Дозаполнить фото и характеристики', 'menuEnrichCarDetails')
    .addItem('Заново пройти фото и характеристики', 'menuRestartCarDetails')
    .addItem('Настроить автообновление', 'menuSetupSync')
    .addSeparator()
    .addItem('Сбросить прогресс обновления', 'menuResetSync')
    .addSeparator()
    .addItem('Проверить парсер', 'menuTestParser')
    .addItem('Открыть ассистента', 'menuOpenAssistant')
    .addToUi();
}

function menuContinueCatalogRefresh() {
  continueCatalogRefresh();
  SpreadsheetApp.getUi().alert('Готово: обработан очередной пакет полного обновления. Подробности смотрите во вкладке sync_log.');
}

function menuStartFullCatalogRefresh() {
  startFullCatalogRefresh();
  SpreadsheetApp.getUi().alert('Готово: полное обновление начато с первой страницы. Подробности смотрите во вкладке sync_log.');
}

function menuRefreshCatalog() {
  continueCatalogRefresh();
}

function menuIncrementalRefreshCatalog() {
  incrementalRefreshCrystalMotorsCatalog();
  SpreadsheetApp.getUi().alert('Готово: дневной апдейт выполнен без очистки текущей BD. Подробности смотрите во вкладке sync_log.');
}

function menuFlushCatalogBuffer() {
  flushCatalogBufferToBD();
  SpreadsheetApp.getUi().alert('Готово: машины из буфера записаны в BD. Подробности смотрите во вкладке sync_log.');
}

function menuEnrichCarDetails() {
  enrichCarDetailsBatch();
  SpreadsheetApp.getUi().alert('Готово: обработан очередной пакет карточек авто. Подробности смотрите во вкладке sync_log.');
}

function menuRestartCarDetails() {
  restartCarDetailsEnrichment();
  SpreadsheetApp.getUi().alert('Готово: проход по фото и характеристикам начат с первой строки. Подробности смотрите во вкладке sync_log.');
}

function menuSetupSync() {
  setupCrystalMotorsSync();
  SpreadsheetApp.getUi().alert('Готово: автообновление включено. Полный проход сам продолжает пакеты примерно раз в минуту, днем точечный апдейт каждые 3 часа, полный ночной проход в 21:00, проверка количества около 23:50.');
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
  deleteExistingTriggers_([
    'scheduledRefreshCrystalMotorsCatalog',
    'scheduledCarDetailsEnrichment',
    'scheduledDaytimeIncrementalCatalogSync',
    'scheduledNightlyFullCatalogRefresh',
    'scheduledNightlyCatalogCountCheck'
  ]);
  createCrystalMotorsTrigger();
  logSync_('setup', 'OK', 'Headers created. Daytime 3h incremental, 21:00 full refresh, 23:50 count check installed.');
}

function setupAndRefreshCrystalMotorsSync() {
  setupCrystalMotorsSync();
  startFullCatalogRefresh();
}

function startFullCatalogRefresh() {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('next_page', '1');
  properties.setProperty('sync_mode', 'full');
  properties.deleteProperty('details_next_row');
  deleteExistingTriggers_(['scheduledRefreshCrystalMotorsCatalog', 'scheduledCarDetailsEnrichment']);
  clearBufferedCars_();
  logSync_('refresh_start', 'OK', 'Full refresh started from page 1, buffer cleared');
  refreshCrystalMotorsCatalog();
}

function continueCatalogRefresh() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('next_page')) {
    properties.setProperty('next_page', '1');
    properties.setProperty('sync_mode', 'full');
    logSync_('refresh_continue', 'START', 'No active full refresh found, started from page 1');
  }
  refreshCrystalMotorsCatalog();
}

function refreshCrystalMotorsCatalog() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const startPage = Number(properties.getProperty('next_page') || 1);
    const syncMode = properties.getProperty('sync_mode') || 'full';
    const existingCars = readBufferedCars_();
    const found = new Map(existingCars.map((car) => [car.url, car]));
    let nextPage = startPage;
    let finished = false;
    let pagesProcessed = 0;

    for (let page = startPage; page < startPage + PAGES_PER_RUN && page <= MAX_CATALOG_PAGES; page += 1) {
      const cars = fetchCatalogPage_(page);
      if (!cars.length) {
        finished = true;
        nextPage = page;
        break;
      }
      cars.forEach((car) => found.set(car.url, mergeCar_(found.get(car.url), car)));
      nextPage = page + 1;
      pagesProcessed += 1;
      Utilities.sleep(REQUEST_PAUSE_MS);
    }

    if (pagesProcessed > 0 && found.size < CATALOG_PAGE_SIZE * (nextPage - 1) * 0.5) {
      logSync_('refresh_batch', 'WARN', `Only ${found.size} unique cars after ${nextPage - 1} pages. Check source pagination if this repeats.`);
    }
    if (nextPage > MAX_CATALOG_PAGES) finished = true;

    writeBufferedCars_(Array.from(found.values()));
    if (found.size) writeCarsToSheet_(Array.from(found.values()));
    properties.setProperty('next_page', String(nextPage));

    if (!finished) {
      scheduleNextCatalogBatch_();
      logSync_('refresh_batch', 'CONTINUE', `Pages ${startPage}-${nextPage - 1} processed, ${found.size} cars buffered, next page ${nextPage}`);
      return;
    }

    writeCarsToSheet_(Array.from(found.values()));
    properties.setProperty('last_refresh_at', String(Date.now()));
    properties.setProperty('details_next_row', '2');
    properties.deleteProperty('next_page');
    properties.deleteProperty('sync_mode');
    clearBufferedCars_();
    deleteExistingTriggers_('scheduledRefreshCrystalMotorsCatalog');
    scheduleNextDetailsBatch_();
    logSync_('refresh', 'OK', `${found.size} cars written from full catalog in batches`);
  } catch (error) {
    logSync_('refresh', 'ERROR', error.stack || error.message);
    throw error;
  }
}

function flushCatalogBufferToBD() {
  const cars = readBufferedCars_();
  if (!cars.length) {
    logSync_('flush_buffer', 'EMPTY', 'sync_buffer is empty, nothing written to BD');
    return;
  }

  writeCarsToSheet_(cars);
  logSync_('flush_buffer', 'OK', `${cars.length} buffered cars written to BD`);
}

function createCrystalMotorsTrigger() {
  ScriptApp.newTrigger('scheduledDaytimeIncrementalCatalogSync')
    .timeBased()
    .everyHours(3)
    .create();
  ScriptApp.newTrigger('scheduledNightlyFullCatalogRefresh')
    .timeBased()
    .atHour(NIGHTLY_FULL_REFRESH_HOUR)
    .nearMinute(0)
    .everyDays(1)
    .create();
  ScriptApp.newTrigger('scheduledNightlyCatalogCountCheck')
    .timeBased()
    .atHour(NIGHTLY_COUNT_CHECK_HOUR)
    .nearMinute(NIGHTLY_COUNT_CHECK_MINUTE)
    .everyDays(1)
    .create();
}

function scheduledRefreshCrystalMotorsCatalog() {
  const properties = PropertiesService.getScriptProperties();
  const hasActiveBatch = Boolean(properties.getProperty('next_page'));
  if (hasActiveBatch) {
    refreshCrystalMotorsCatalog();
    return;
  }

  const hasActiveDetailsBatch = Boolean(properties.getProperty('details_next_row'));
  if (hasActiveDetailsBatch) {
    enrichCarDetailsBatch();
    return;
  }

  deleteExistingTriggers_('scheduledRefreshCrystalMotorsCatalog');
  logSync_('refresh_batch', 'SKIP', 'No active catalog or details batch');
}

function scheduledCarDetailsEnrichment() {
  const hasActiveDetailsBatch = Boolean(PropertiesService.getScriptProperties().getProperty('details_next_row'));
  if (hasActiveDetailsBatch) {
    enrichCarDetailsBatch();
    return;
  }

  deleteExistingTriggers_('scheduledCarDetailsEnrichment');
  logSync_('details_batch', 'SKIP', 'No active details batch');
}

function scheduledDaytimeIncrementalCatalogSync() {
  const hour = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'H'));
  if (hour < DAYTIME_START_HOUR || hour >= DAYTIME_END_HOUR) {
    logSync_('incremental', 'SKIP', `Outside daytime window: ${hour}:00`);
    return;
  }
  if (PropertiesService.getScriptProperties().getProperty('next_page')) {
    logSync_('incremental', 'SKIP', 'Full refresh is active');
    return;
  }
  incrementalRefreshCrystalMotorsCatalog();
}

function scheduledNightlyFullCatalogRefresh() {
  startFullCatalogRefresh();
}

function scheduledNightlyCatalogCountCheck() {
  verifyCatalogCount();
}

function restartCarDetailsEnrichment() {
  deleteExistingTriggers_('scheduledCarDetailsEnrichment');
  PropertiesService.getScriptProperties().setProperty('details_next_row', '2');
  enrichCarDetailsBatch();
}

function resetCatalogSyncProgress() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('next_page');
  properties.deleteProperty('sync_mode');
  properties.deleteProperty('details_next_row');
  deleteExistingTriggers_(['scheduledRefreshCrystalMotorsCatalog', 'scheduledCarDetailsEnrichment']);
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
  const values = sheet.getDataRange().getValues();
  const currentHeaders = values.length ? values[0].map((value) => String(value).trim()).filter(Boolean) : [];
  if (values.length > 1 && currentHeaders.length) {
    ensureSheetHeaders_(sheet, currentHeaders);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
    return;
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function writeCarsToSheet_(cars) {
  const sheet = getCarsSheet_();
  const existingByUrl = readCarsFromSheet_();
  const rows = cars
    .sort((a, b) => String(a.city).localeCompare(String(b.city), 'ru') || Number(a.price) - Number(b.price))
    .map((car) => {
      const merged = mergeCar_(existingByUrl.get(car.url), car);
      return HEADERS.map((header) => merged[header] || '');
    });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function incrementalRefreshCrystalMotorsCatalog() {
  try {
    if (PropertiesService.getScriptProperties().getProperty('next_page')) {
      logSync_('incremental', 'SKIP', `Full refresh is active, next page ${PropertiesService.getScriptProperties().getProperty('next_page')}. Continue or reset full refresh first.`);
      return;
    }

    const existingByUrl = readCarsFromSheet_();
    const found = new Map(existingByUrl);
    let fetched = 0;
    let touched = 0;

    for (let page = 1; page <= DAY_INCREMENTAL_PAGES; page += 1) {
      const cars = fetchCatalogPage_(page);
      if (!cars.length) break;
      fetched += cars.length;
      cars.forEach((car) => {
        const previous = found.get(car.url);
        const merged = mergeCar_(previous, car);
        found.set(car.url, merged);
        if (!previous || JSON.stringify(previous) !== JSON.stringify(merged)) touched += 1;
      });
      Utilities.sleep(REQUEST_PAUSE_MS);
    }

    writeCarsToSheet_(Array.from(found.values()));
    logSync_('incremental', 'OK', `${fetched} cars checked on first ${DAY_INCREMENTAL_PAGES} pages, ${touched} rows added or updated, ${found.size} rows kept in BD`);
  } catch (error) {
    logSync_('incremental', 'ERROR', error.stack || error.message);
    throw error;
  }
}

function verifyCatalogCount() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const siteCount = parseSiteCatalogCount_(fetchText_(CATALOG_URL));
    const sheetCount = Math.max(0, getCarsSheet_().getLastRow() - 1);
    const difference = siteCount ? siteCount - sheetCount : 0;
    const fullRefreshActive = Boolean(properties.getProperty('next_page'));
    const status = fullRefreshActive || (siteCount && Math.abs(difference) > SITE_COUNT_TOLERANCE) ? 'WARN' : 'OK';
    const activeMessage = fullRefreshActive ? ` Full refresh still active, next page ${properties.getProperty('next_page')}.` : '';
    logSync_('count_check', status, `Site count: ${siteCount || 'unknown'}, BD rows: ${sheetCount}, difference: ${difference}.${activeMessage}`);
  } catch (error) {
    logSync_('count_check', 'ERROR', error.stack || error.message);
    throw error;
  }
}

function readCarsFromSheet_() {
  const sheet = getCarsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return new Map();

  const headers = values[0].map((value) => String(value).trim());
  const urlIndex = headers.indexOf('url');
  if (urlIndex < 0) return new Map();

  const cars = new Map();
  values.slice(1).forEach((row) => {
    const car = {};
    headers.forEach((header, index) => {
      car[header] = row[index];
    });
    if (car.url) cars.set(car.url, car);
  });
  return cars;
}

function enrichCarDetailsBatch() {
  try {
    const sheet = getCarsSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) {
      logSync_('details_batch', 'EMPTY', 'BD is empty');
      return;
    }

    const headers = values[0].map((value) => String(value).trim());
    ensureSheetHeaders_(sheet, headers);
    const updatedValues = sheet.getDataRange().getValues();
    const updatedHeaders = updatedValues[0].map((value) => String(value).trim());
    const index = headerIndex_(updatedHeaders);
    const properties = PropertiesService.getScriptProperties();
    let rowNumber = Number(properties.getProperty('details_next_row') || 2);
    const requests = [];
    const rowNumbers = [];

    while (rowNumber <= updatedValues.length && requests.length < DETAILS_PER_RUN) {
      const row = updatedValues[rowNumber - 1];
      const url = row[index.url];
      const needsDetails = url && (!row[index.body] || !row[index.engine] || !row[index.drive] || !row[index.power] || !row[index.wheel] || !row[index.image_url]);
      if (needsDetails) {
        requests.push({
          url,
          muteHttpExceptions: true,
          followRedirects: true,
          headers: { 'User-Agent': 'Mozilla/5.0 CM66-BDCARS details sync' }
        });
        rowNumbers.push(rowNumber);
      }
      rowNumber += 1;
    }

    if (!requests.length) {
      properties.deleteProperty('details_next_row');
      deleteExistingTriggers_('scheduledCarDetailsEnrichment');
      logSync_('details', 'OK', 'All visible rows already have details');
      return;
    }

    const responses = UrlFetchApp.fetchAll(requests);
    const updates = [];
    responses.forEach((response, responseIndex) => {
      const code = response.getResponseCode();
      if (code < 200 || code >= 300) return;
      const details = parseCarDetailPage_(response.getContentText('UTF-8'));
      const row = updatedValues[rowNumbers[responseIndex] - 1].slice();
      Object.keys(details).forEach((key) => {
        if (index[key] >= 0 && details[key]) row[index[key]] = details[key];
      });
      if (index.updated_at >= 0) row[index.updated_at] = new Date().toISOString();
      updates.push({ rowNumber: rowNumbers[responseIndex], row });
    });

    updates.forEach((update) => {
      sheet.getRange(update.rowNumber, 1, 1, updatedHeaders.length).setValues([update.row]);
    });

    if (rowNumber > updatedValues.length) {
      properties.deleteProperty('details_next_row');
      deleteExistingTriggers_('scheduledCarDetailsEnrichment');
      logSync_('details', 'OK', `${updates.length} cars enriched, details pass finished`);
      return;
    }

    properties.setProperty('details_next_row', String(rowNumber));
    scheduleNextDetailsBatch_();
    logSync_('details_batch', 'CONTINUE', `${updates.length} cars enriched, next row ${rowNumber}`);
  } catch (error) {
    logSync_('details', 'ERROR', error.stack || error.message);
    throw error;
  }
}

function ensureSheetHeaders_(sheet, headers) {
  const missing = HEADERS.filter((header) => !headers.includes(header));
  if (!missing.length) return;

  const values = sheet.getDataRange().getValues();
  const normalizedRows = values.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index];
    });
    return HEADERS.map((header) => record[header] || '');
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (normalizedRows.length) sheet.getRange(2, 1, normalizedRows.length, HEADERS.length).setValues(normalizedRows);
}

function headerIndex_(headers) {
  const index = {};
  HEADERS.forEach((header) => {
    index[header] = headers.indexOf(header);
  });
  return index;
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

function scheduleNextCatalogBatch_() {
  deleteExistingTriggers_('scheduledRefreshCrystalMotorsCatalog');
  ScriptApp.newTrigger('scheduledRefreshCrystalMotorsCatalog')
    .timeBased()
    .after(NEXT_BATCH_DELAY_MS)
    .create();
}

function scheduleNextDetailsBatch_() {
  deleteExistingTriggers_('scheduledCarDetailsEnrichment');
  ScriptApp.newTrigger('scheduledCarDetailsEnrichment')
    .timeBased()
    .after(NEXT_BATCH_DELAY_MS)
    .create();
}

function deleteExistingTriggers_(handlerNames) {
  const names = Array.isArray(handlerNames) ? handlerNames : [handlerNames];
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (names.includes(trigger.getHandlerFunction())) {
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
  if (code === 404) return '';
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

    const car = parseCardText_(text, href ? absoluteUrl_(href, baseUrl) : '', match[2], baseUrl);
    if (car.url && car.title && car.price) cars.push(car);
  }

  if (cars.length) return dedupeCars_(cars);

  return dedupeCars_(parseCardTextBlocks_(html));
}

function parseCardText_(text, url, cardHtml, baseUrl) {
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
    body: '',
    engine: '',
    drive: '',
    power: '',
    transmission: specsMatch ? cleanText_(specsMatch[2]) : '',
    wheel: '',
    image_url: extractFirstImageUrl_(cardHtml, baseUrl),
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
      body: '',
      engine: '',
      drive: '',
      power: '',
      transmission: cleanText_(match[4]),
      wheel: '',
      image_url: '',
      url: buildCatalogUrl_(brandModel.brand, brandModel.model, city),
      updated_at: new Date().toISOString()
    });
  }

  return cars;
}

function parseCarDetailPage_(html) {
  const productId = extractProductIdFromHtml_(html);
  const details = {
    mileage: '',
    body: '',
    engine: '',
    drive: '',
    power: '',
    transmission: '',
    wheel: '',
    image_url: extractProductImageUrl_(html, productId) || extractMetaContent_(html, 'property', 'og:image') || extractFirstImageUrl_(html, CATALOG_URL)
  };
  const titleMap = {
    kilometrage: 'mileage',
    bodytype: 'body',
    enginesize: 'engine',
    drivetype: 'drive',
    power: 'power',
    transmission: 'transmission',
    wheeltype: 'wheel'
  };
  const featurePattern = /<div\b(?=[^>]*class=["'][^"']*car-info-feature[^"']*["'])(?=[^>]*title=["']([^"']+)["'])[^>]*>[\s\S]*?<span\b[^>]*class=["'][^"']*car-info-feature-itself[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/div>/gi;
  let match;

  while ((match = featurePattern.exec(html)) !== null) {
    const key = titleMap[cleanText_(match[1]).toLowerCase()];
    const value = cleanText_(stripTags_(match[2]));
    if (key && value) details[key] = value;
  }

  const textDetails = parseCarDetailText_(html);
  Object.keys(textDetails).forEach((key) => {
    if (!details[key] && textDetails[key]) details[key] = textDetails[key];
  });

  return details;
}

function parseCarDetailText_(html) {
  const text = cleanText_(stripTags_(html));
  const labels = ['Год выпуска', 'Пробег', 'Кузов', 'Двигатель', 'Привод', 'Мощность', 'КПП', 'Руль', 'Один владелец', 'Скидка', 'Описание', 'Комплектация', 'Где находится авто'];
  const labelPattern = labels.map(escapeRegExp_).join('|');
  const read = (label) => {
    const pattern = new RegExp(`${escapeRegExp_(label)}\\s+([\\s\\S]*?)(?=\\s+(?:${labelPattern})\\s+|$)`, 'i');
    const match = text.match(pattern);
    return match ? cleanText_(match[1]) : '';
  };

  return {
    mileage: read('Пробег'),
    body: read('Кузов'),
    engine: read('Двигатель'),
    drive: read('Привод'),
    power: read('Мощность'),
    transmission: read('КПП'),
    wheel: read('Руль')
  };
}

function extractProductIdFromHtml_(html) {
  const match = String(html || '').match(/(?:window\.product_id\s*=\s*|product-product-)(\d+)/i);
  return match ? match[1] : '';
}

function extractProductImageUrl_(html, productId) {
  const idPattern = productId ? escapeRegExp_(productId) : '\\d+';
  const contentAutoPattern = `https?:\\/\\/content-auto\\.ru\\/images\\/${idPattern}\\/[^"'\\\\]+\\.webp`;
  const dataPhotoMatch = String(html || '').match(new RegExp(`data-photo=["'](${contentAutoPattern})["']`, 'i'));
  if (dataPhotoMatch) return dataPhotoMatch[1];

  const mainCarouselMatch = String(html || '').match(new RegExp(`<div\\b[^>]*id=["']mainCarousel["'][\\s\\S]*?(?:data-src|src)=["'](${contentAutoPattern})["']`, 'i'));
  if (mainCarouselMatch) return mainCarouselMatch[1];

  const galleryMiddleMatch = String(html || '').match(new RegExp(`"middle"\\s*:\\s*"(https?:\\\\/\\\\/content-auto\\.ru\\\\/images\\\\/${idPattern}\\\\/[^"]+\\.webp)"`, 'i'));
  if (galleryMiddleMatch) return galleryMiddleMatch[1].replace(/\\\//g, '/');

  const anyContentAutoMatch = String(html || '').match(new RegExp(`(${contentAutoPattern})`, 'i'));
  return anyContentAutoMatch ? anyContentAutoMatch[1] : '';
}

function parseSiteCatalogCount_(html) {
  const jsonCountMatch = String(html || '').match(/"count"\s*:\s*(\d+)/);
  if (jsonCountMatch) return Number(jsonCountMatch[1]) || 0;

  const text = cleanText_(stripTags_(html));
  const visibleCountMatch = text.match(/Найдено\s+автомобил(?:ей|я|ь)\s*:?\s*(\d[\d\s]*)/i);
  return visibleCountMatch ? Number(onlyDigits_(visibleCountMatch[1])) || 0 : 0;
}

function extractMetaContent_(html, attrName, attrValue) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*${attrName}=["']${escapeRegExp_(attrValue)}["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>`, 'i');
  const match = String(html || '').match(pattern);
  return match ? cleanText_(match[1]) : '';
}

function extractFirstImageUrl_(html, baseUrl) {
  const block = String(html || '');
  const productId = extractProductIdFromUrl_(block) || extractProductIdFromHtml_(block);
  const productImage = extractProductImageUrl_(block, productId);
  if (productImage) return productImage;

  const displayBlockMatch = block.match(/<div\b[^>]*class=["'][^"']*car-in-image[^"']*["'][^>]*style=["'][^"']*display:\s*block[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*(?:data-src|src)=["']([^"']+)["']/i);
  const imageMatch = displayBlockMatch || block.match(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i);
  if (!imageMatch) return '';
  return absoluteUrl_(imageMatch[1], baseUrl || CATALOG_URL);
}

function extractProductIdFromUrl_(value) {
  const match = String(value || '').match(/\/avtomobili_s_probegom\/[^"'\s?#]+\/[^"'\s?#]+\/(\d+)(?:[?#][^"'\s]*)?/i);
  return match ? match[1] : '';
}

function mergeCar_(existing, incoming) {
  const merged = Object.assign({}, existing || {}, incoming || {});
  Object.keys(existing || {}).forEach((key) => {
    if (existing[key] && !incoming[key]) merged[key] = existing[key];
  });
  return merged;
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

function escapeRegExp_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
