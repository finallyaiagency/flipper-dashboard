(function () {
    const FALLBACK_PAYLOAD = window.FLIP_TRACKER_DATA || { headers: [], rows: [] };
    const SHEET_ID = "12TELzT2bzIxdry3pyLvSv3hdWJpkdvGC25aSlvsBq94";
    const INVENTORY_SHEET = "Inventory Register";
    const SALES_SHEET = "Sales Ledger";
    const KPI_SHEET = "KPI Export - Web Dashboard";
    const CACHE_KEY = "flip-tracker:last-good-payload:v2";
    const ACTIVE_ASKING_EXCLUDED_ASSET_IDS = new Set(["GB-0173"]);

    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const moneyTwoDecimals = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
    const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
    const COLS = {
        assetId: "Asset ID",
        item: "Description",
        type: "Type",
        buyDate: "Date bought",
        soldDate: "Date sold",
        buyPrice: "Paid",
        asking: "Asking",
        soldPrice: "Sale price",
        profit: "Profit",
        markup: "Markup",
        daysToSell: "Days to sell",
        daysHeld: "Days on market",
        listingUrl: "Listing URL",
        source: "Source",
        notes: "Notes",
        status: "Status",
        sold: "Sold",
        inventory: "In Inventory",
    };
    const TARGET_HEADERS = [
        "Asset ID",
        "Type",
        "Description",
        "Notes",
        "Date bought",
        "Asking",
        "Paid",
        "Discount",
        "Date sold",
        "Year",
        "Sale price",
        "Markup",
        "Profit",
        "Days to sell",
        "Days on market",
        "Listing URL",
        "Source",
        "Value of inventory:",
        "Sold",
        "In Inventory",
        "Potential Gross Profit",
        "Potential ROI",
        "Status",
    ];
    const TRACE_DEFS = [
        ["inventoryValue", "Inventory Cost Basis", null, true, "money", "Daily cash tied up in active inventory at cost basis. Shows how much buying capital is sitting on the shelf."],
        ["cashOnHand", "Cash on Hand", null, true, "money", "Running cash balance from closed flips after purchases and sales. Useful for seeing liquidity over time."],
        ["total", "Total Cost Basis + Cash", null, true, "money", "Cash on hand plus active inventory cost basis. A simple realized-equity view of the flipping operation."],
        ["inventoryMA", "Inventory Cost Basis 30D MA", null, false, "money", "30-day moving average of inventory cost basis. Smooths daily purchase and sale spikes."],
        ["cashMA", "Cash on Hand 30D MA", null, false, "money", "30-day moving average of cash on hand. Smooths one-off sale and buy swings."],
        ["totalMA", "Total 30D MA", null, false, "money", "30-day moving average of total cost basis plus cash. Use it to see the longer-term trend."],
        ["avgInventoryValue", "Avg Cost Basis per Item", "y2", false, "money", "Average cost basis per active item. Helps spot whether inventory is shifting toward higher-ticket or lower-ticket flips."],
        ["avgMA", "Avg Cost Basis 30D MA", "y2", false, "money", "30-day moving average of average active item cost. Smooths changes in inventory mix."],
        ["monthlyProfitPerInventory", "30D Profit / Avg Inventory", "y3", false, "percent", "Gross profit from the last 30 days divided by average inventory cost basis. Shows monthly yield on deployed inventory."],
        ["activity", "Buy / Sell Activity", null, false, "activity", "Diamond markers for buy and sell events. Hover a marker to see what changed on that date."],
    ];

    const yearFilterWrap = document.getElementById("year-filter-wrap");
    const yearFilterButton = document.getElementById("year-filter-button");
    const yearFilterPanel = document.getElementById("year-filter-panel");
    const yearFilterLabel = document.getElementById("year-filter-label");
    const categoryFilterWrap = document.getElementById("category-filter-wrap");
    const categoryFilterButton = document.getElementById("category-filter-button");
    const categoryFilterPanel = document.getElementById("category-filter-panel");
    const categoryFilterLabel = document.getElementById("category-filter-label");
    const paidMinFilter = document.getElementById("paid-min-filter");
    const paidMaxFilter = document.getElementById("paid-max-filter");
    const soldMinFilter = document.getElementById("sold-min-filter");
    const soldMaxFilter = document.getElementById("sold-max-filter");
    const traceControls = document.getElementById("trace-controls");
    const sourceStatus = document.getElementById("source-status");
    const traceState = new Map(TRACE_DEFS.map(([key, , , enabled]) => [key, enabled]));
    const yearState = new Map();
    const categoryState = new Map();
    const priceRangeState = {
        paidMin: "",
        paidMax: "",
        soldMin: "",
        soldMax: "",
    };

    let headers = [];
    let rows = [];
    let items = [];
    let kpiMetrics = new Map();

    const cachedPayload = loadCachedPayload();
    const initialPayload = cachedPayload || FALLBACK_PAYLOAD;
    rebuildModel(initialPayload);
    setSourceStatus(buildSourceStatus(initialPayload, cachedPayload ? "cached" : "embedded"));
    initControls();
    bindControls();
    render();
    void refreshFromLiveSheets();

    async function refreshFromLiveSheets() {
        try {
            const [inventory, sales, kpis] = await Promise.all([
                fetchGviz(INVENTORY_SHEET, "A1:V1000"),
                fetchGviz(SALES_SHEET, "A1:K1000"),
                fetchGviz(KPI_SHEET, "A1:D100"),
            ]);
            const transformed = transformGroundbnbRows(inventory.records, sales.records);
            kpiMetrics = buildKpiMap(kpis.records);
            rebuildModel(transformed);
            saveCachedPayload(transformed);
            setSourceStatus(buildSourceStatus(transformed, "live"));
            initControls(true);
            render();
        } catch (error) {
            if (cachedPayload) {
                rebuildModel(cachedPayload);
                setSourceStatus(buildSourceStatus(cachedPayload, `cached fallback: ${error.message}`));
                render();
                return;
            }
            setSourceStatus(`Using embedded Groundbnb export (${error.message})`);
        }
    }

    function loadCachedPayload() {
        try {
            const raw = window.localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.headers?.length || !parsed?.rows?.length) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    function saveCachedPayload(payload) {
        try {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify({
                ...payload,
                cachedAt: new Date().toISOString(),
            }));
        } catch {
            // Ignore storage failures.
        }
    }

    function buildSourceStatus(payload, mode) {
        const exported = formatExportedAt(payload.exportedAt);
        const cached = payload.cachedAt ? formatExportedAt(payload.cachedAt) : null;
        if (mode === "live") return `Live from Groundbnb Store Google Sheet - exported ${exported}`;
        if (mode === "cached") return `Cached Groundbnb data loaded - exported ${exported}${cached ? `, cached ${cached}` : ""}`;
        if (String(mode).startsWith("cached fallback:")) {
            const reason = String(mode).replace("cached fallback: ", "");
            return `Google Sheet unavailable; showing cached data - exported ${exported}${cached ? `, cached ${cached}` : ""} (${reason})`;
        }
        return `Embedded Groundbnb export loaded - exported ${exported}`;
    }

    async function fetchGviz(sheetName, range) {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}&headers=1&tqx=out:json`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`${sheetName} HTTP ${response.status}`);
        const text = await response.text();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error(`${sheetName} returned unexpected data`);
        const parsed = JSON.parse(text.slice(start, end + 1));
        const table = parsed?.table;
        if (!table?.cols?.length) throw new Error(`${sheetName} has no columns`);
        const sheetHeaders = table.cols.map((col, index) => (col.label || col.id || `Column ${index + 1}`).trim());
        const records = (table.rows || []).map((row) => {
            return sheetHeaders.reduce((record, header, index) => {
                if (header) record[header] = cellValue(row.c?.[index], table.cols[index]);
                return record;
            }, {});
        }).filter((record) => Object.values(record).some((value) => String(value ?? "").trim()));
        return { headers: sheetHeaders, records };
    }

    function cellValue(cell, col) {
        if (!cell || cell.v == null) return "";
        if (col?.type === "date" && cell.f) return cell.f;
        return cell.v;
    }

    function transformGroundbnbRows(inventoryRecords, salesRecords) {
        const salesByAsset = new Map();
        salesRecords.forEach((sale) => {
            const assetId = String(sale["Asset ID"] || "").trim();
            if (assetId) salesByAsset.set(assetId, sale);
        });

        const outputRows = inventoryRecords.map((record) => {
            const assetId = String(record["Asset ID"] || "").trim();
            if (!assetId.startsWith("GB-")) return null;
            const sale = salesByAsset.get(assetId) || {};
            const status = String(record.Status || "").trim();
            const sold = status.toLowerCase() === "sold" || toNumber(sale["Sale Price"]) > 0;
            const active = ["active", "inventory", "listed"].includes(status.toLowerCase());
            const acquiredDate = record["Acquired Date"] || sale["Acquired Date"] || "";
            const soldDate = sold ? sale["Sold Date"] || "" : "";
            const year = soldDate ? getYear(soldDate) : getYear(acquiredDate);
            const daysToSellFromSheet = cleanNumberish(sale["Days to Sell"]);
            return [
                assetId,
                record.Category || sale.Category || "Other",
                record["Item Name"] || sale["Item Name"] || "Untitled item",
                record.Notes || "",
                acquiredDate,
                cleanNumberish(record["Current Ask"] || record["Initial Ask"] || ""),
                cleanNumberish(record["Cost Basis"] || sale["Cost Basis"] || ""),
                "",
                soldDate,
                year || "",
                sold ? cleanNumberish(sale["Sale Price"]) : "",
                sold ? cleanNumberish(sale.Markup) : "",
                sold ? cleanNumberish(sale["Gross Profit"]) : "",
                sold ? daysToSellFromSheet : "",
                cleanNumberish(record["Days Held"]),
                record["Listing URL"] || "",
                record["Source"] || "",
                cleanNumberish(record["Current Ask"]),
                sold ? 1 : 0,
                active && !sold ? 1 : 0,
                cleanNumberish(record["Potential Gross Profit"]),
                cleanNumberish(record["Potential ROI"]),
                status,
            ];
        }).filter(Boolean);

        return {
            exportedAt: new Date().toISOString(),
            sourceSheetId: SHEET_ID,
            sourceRange: `${INVENTORY_SHEET} + ${SALES_SHEET} + ${KPI_SHEET}`,
            headers: TARGET_HEADERS,
            rows: outputRows,
        };
    }

    function buildKpiMap(records) {
        const map = new Map();
        records.forEach((record) => {
            const metric = String(record.Metric || "").trim();
            if (metric) map.set(metric, record);
        });
        return map;
    }

    function rebuildModel(payload) {
        headers = payload.headers || [];
        rows = (payload.rows || []).map((row) => headers.reduce((record, header, index) => {
            record[header] = row[index];
            return record;
        }, {}));
        items = rows.filter((row) => excelDate(row[COLS.buyDate]));
    }

    function initControls(keepSelection = false) {
        const selectedYears = getSelectedYears();
        const selectedCategories = getSelectedCategories();
        const years = Array.from(new Set(items.flatMap((row) => [excelDate(row[COLS.buyDate]), excelDate(row[COLS.soldDate])])
            .filter(Boolean)
            .map((date) => date.getUTCFullYear()))).sort((a, b) => b - a);
        const categories = Array.from(new Set(items.map((row) => row[COLS.type] || "Other"))).sort((a, b) => a.localeCompare(b));

        years.forEach((year) => {
            if (!yearState.has(String(year))) yearState.set(String(year), true);
        });
        Array.from(yearState.keys()).forEach((year) => {
            if (!years.map(String).includes(year)) yearState.delete(year);
        });
        categories.forEach((type) => {
            if (!categoryState.has(type)) categoryState.set(type, true);
        });
        Array.from(categoryState.keys()).forEach((type) => {
            if (!categories.includes(type)) categoryState.delete(type);
        });
        renderCategoryFilter(categories);
        traceControls.innerHTML = TRACE_DEFS.map(([key, label, , , , description]) => `
            <label class="trace-toggle" title="${escapeAttr(description)}" data-tooltip="${escapeAttr(description)}" aria-label="${escapeAttr(`${label}: ${description}`)}">
                <input type="checkbox" value="${key}" ${traceState.get(key) ? "checked" : ""}>
                <span>${escapeHtml(label)}</span>
                <span class="trace-tooltip" aria-hidden="true">?</span>
            </label>
        `).join("");
        renderYearFilter(years);
        if (keepSelection) {
            categories.forEach((type) => {
                if (!categoryState.has(type)) categoryState.set(type, true);
            });
        } else {
            years.forEach((year) => yearState.set(String(year), true));
            categories.forEach((type) => categoryState.set(type, true));
        }
        if (selectedYears.length && keepSelection) {
            selectedYears.forEach((year) => {
                if (yearState.has(year)) yearState.set(year, true);
            });
        }
        syncYearFilterLabel();
        syncCategoryFilterLabel();
        syncPriceFilterInputs();
    }

    function bindControls() {
        if (yearFilterButton) {
            yearFilterButton.addEventListener("click", () => toggleYearFilterPanel());
        }
        if (categoryFilterButton) {
            categoryFilterButton.addEventListener("click", () => toggleCategoryFilterPanel());
        }
        [paidMinFilter, paidMaxFilter, soldMinFilter, soldMaxFilter].forEach((input, index) => {
            if (!input) return;
            input.addEventListener("input", () => {
                if (index === 0) priceRangeState.paidMin = input.value;
                if (index === 1) priceRangeState.paidMax = input.value;
                if (index === 2) priceRangeState.soldMin = input.value;
                if (index === 3) priceRangeState.soldMax = input.value;
                render();
            });
        });
        document.addEventListener("click", (event) => {
            if (!yearFilterWrap?.contains(event.target)) closeYearFilterPanel();
            if (!categoryFilterWrap?.contains(event.target)) closeCategoryFilterPanel();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeYearFilterPanel();
                closeCategoryFilterPanel();
            }
        });
        traceControls.addEventListener("change", (event) => {
            if (event.target.matches("input[type='checkbox']")) {
                traceState.set(event.target.value, event.target.checked);
                render();
            }
        });
    }

    function filteredItems() {
        const selectedYears = getSelectedYears();
        const selectedCategories = getSelectedCategories();
        const paidMin = toNullableNumber(priceRangeState.paidMin);
        const paidMax = toNullableNumber(priceRangeState.paidMax);
        const soldMin = toNullableNumber(priceRangeState.soldMin);
        const soldMax = toNullableNumber(priceRangeState.soldMax);
        return items.filter((row) => {
            const buyDate = excelDate(row[COLS.buyDate]);
            const soldDate = excelDate(row[COLS.soldDate]);
            const matchesYear = !selectedYears.length || [buyDate, soldDate].some((date) => date && selectedYears.includes(String(date.getUTCFullYear())));
            const matchesCategory = !selectedCategories.length || selectedCategories.includes(row[COLS.type] || "Other");
            const paid = toNumber(row[COLS.buyPrice]);
            const sold = toNumber(row[COLS.soldPrice]);
            const matchesPaid = (paidMin == null || paid >= paidMin) && (paidMax == null || paid <= paidMax);
            const matchesSold = (soldMin == null || sold >= soldMin) && (soldMax == null || sold <= soldMax);
            return matchesYear && matchesCategory && matchesPaid && matchesSold;
        });
    }

    function filteredSoldRows(sourceItems) {
        const selectedYears = getSelectedYears();
        return sourceItems.filter((row) => {
            const soldDate = excelDate(row[COLS.soldDate]);
            const sold = toNumber(row[COLS.sold]) === 1 || toNumber(row[COLS.soldPrice]) > 0;
            return sold && (!selectedYears.length || (soldDate && selectedYears.includes(String(soldDate.getUTCFullYear()))));
        });
    }

    function render() {
        const scopedItems = filteredItems();
        const scopedEvents = buildEvents(scopedItems).sort((a, b) => a.date - b.date);
        const daily = buildDaily(scopedEvents);
        const soldRows = filteredSoldRows(scopedItems);
        const inventoryRows = scopedItems.filter((row) => toNumber(row[COLS.inventory]) === 1);

        renderKpis(soldRows, inventoryRows, daily);
        renderPlotly(daily);
        renderTypeBars(soldRows);
        renderInventory(inventoryRows);
        renderUnlinkedInventory(inventoryRows);
        renderRecentSales(soldRows);
        renderRecentPurchases(scopedItems);
    }

    function buildEvents(sourceRows) {
        const allEvents = [];
        sourceRows.forEach((row) => {
            const buyDate = excelDate(row[COLS.buyDate]);
            const soldDate = excelDate(row[COLS.soldDate]);
            const paid = toNumber(row[COLS.buyPrice]);
            const salePrice = toNumber(row[COLS.soldPrice]);
            const item = row[COLS.item] || "Untitled item";

            if (buyDate) {
                allEvents.push({ date: buyDate, item, type: "Buy", amount: paid, inventoryDelta: paid, cashDelta: -paid, countDelta: 1, profit: 0 });
            }
            if (soldDate) {
                const realizedProfit = toNumber(row[COLS.profit]) || (salePrice - paid);
                allEvents.push({ date: soldDate, item, type: "Sell", amount: salePrice, inventoryDelta: -paid, cashDelta: salePrice, countDelta: -1, profit: realizedProfit });
            }
        });
        return allEvents;
    }

    function buildDaily(sourceEvents) {
        if (!sourceEvents.length) return [];
        const start = new Date(dateKey(sourceEvents[0].date));
        const today = new Date();
        const lastEvent = sourceEvents[sourceEvents.length - 1].date;
        const end = lastEvent > today ? lastEvent : today;
        const byDate = new Map();

        sourceEvents.forEach((event) => {
            const key = dateKey(event.date);
            const bucket = byDate.get(key) || { inventoryDelta: 0, cashDelta: 0, countDelta: 0, profit: 0, activity: [] };
            bucket.inventoryDelta += event.inventoryDelta;
            bucket.cashDelta += event.cashDelta;
            bucket.countDelta += event.countDelta;
            bucket.profit += event.profit;
            bucket.activity.push(`${event.type}: ${event.item} (${money.format(event.amount)})`);
            byDate.set(key, bucket);
        });

        const output = [];
        let inventoryValue = 0;
        let cashOnHand = 0;
        let inventoryCount = 0;
        for (let date = start; date <= end; date = addDays(date, 1)) {
            const bucket = byDate.get(dateKey(date)) || { inventoryDelta: 0, cashDelta: 0, countDelta: 0, profit: 0, activity: [] };
            inventoryValue += bucket.inventoryDelta;
            cashOnHand += bucket.cashDelta;
            inventoryCount += bucket.countDelta;
            output.push({
                date: new Date(date),
                inventoryValue,
                cashOnHand,
                inventoryCount,
                total: inventoryValue + cashOnHand,
                avgInventoryValue: inventoryCount > 0 ? inventoryValue / inventoryCount : null,
                realizedProfit: bucket.profit,
                activity: bucket.activity.join("<br>"),
            });
        }

        const inventoryMA = rollingMean(output.map((row) => row.inventoryValue), 30);
        const cashMA = rollingMean(output.map((row) => row.cashOnHand), 30);
        const totalMA = rollingMean(output.map((row) => row.total), 30);
        const avgMA = rollingMean(output.map((row) => row.avgInventoryValue), 30);
        const profit30 = rollingSum(output.map((row) => row.realizedProfit), 30);
        const avgInventory30 = rollingMean(output.map((row) => row.inventoryValue), 30);
        return output.map((row, index) => {
            const monthlyProfitPerInventory = avgInventory30[index] > 0 ? profit30[index] / avgInventory30[index] : null;
            return { ...row, inventoryMA: inventoryMA[index], cashMA: cashMA[index], totalMA: totalMA[index], avgMA: avgMA[index], profit30: profit30[index], avgInventory30: avgInventory30[index], monthlyProfitPerInventory };
        });
    }

    function renderKpis(soldRows, inventoryRows, daily) {
        const useSheetKpis = allYearsSelected() && allCategoriesSelected() && kpiMetrics.size > 0;
        const hasAdGapMetric = useSheetKpis && kpiMetrics.has("Ad vs Sheet Gap");
        const computedRevenue = sum(soldRows, COLS.soldPrice);
        const computedProfit = sum(soldRows, COLS.profit);
        const computedSoldUnits = soldRows.length;
        const computedActiveUnits = inventoryRows.length;
        const salesRevenue = metricValue("Realized Revenue", computedRevenue, useSheetKpis);
        const totalProfit = metricValue("Realized Gross Profit", computedProfit, useSheetKpis);
        const soldUnits = metricValue("Sold Units", computedSoldUnits, useSheetKpis);
        const inventoryCount = metricValue("Tracked Active Inventory Units", computedActiveUnits, useSheetKpis);
        const inventoryCost = metricValue("Active Cost Basis", sum(inventoryRows, COLS.buyPrice), useSheetKpis);
        const activeAskingRows = inventoryRows.filter((row) => !ACTIVE_ASKING_EXCLUDED_ASSET_IDS.has(String(row[COLS.assetId]).trim()));
        const activeAsking = sum(activeAskingRows, COLS.asking);
        const unrealizedProfit = activeAsking - sum(activeAskingRows, COLS.buyPrice);
        const avgDays = metricValue("Average Days to Sell", average(soldRows, COLS.daysToSell), useSheetKpis);
        const medianDays = metricValue("Median Days to Sell", median(soldRows.map((row) => toNumber(row[COLS.daysToSell])).filter((value) => value > 0)), useSheetKpis);
        const agingRisk = metricValue("Aging Risk Units", inventoryRows.filter((row) => toNumber(row[COLS.daysHeld]) > 45).length, useSheetKpis);
        const marketplaceAds = metricValue("Marketplace Active Ads", 0, useSheetKpis);
        const adGap = metricValue("Ad vs Sheet Gap", Math.max(0, marketplaceAds - inventoryCount), useSheetKpis);
        const paidBasis = sum(soldRows, COLS.buyPrice) || Math.max(0, salesRevenue - totalProfit);
        const grossMargin = salesRevenue ? totalProfit / salesRevenue : 0;
        const realizedRoi = paidBasis ? totalProfit / paidBasis : 0;
        const medianProfit = median(soldRows.map((row) => toNumber(row[COLS.profit])));
        const sellThrough = soldUnits + inventoryCount ? soldUnits / (soldUnits + inventoryCount) : 0;
        const avgMarkup = averageMarkup(soldRows);
        const freeSoldRows = soldRows.filter((row) => toNumber(row[COLS.buyPrice]) <= 0);
        const paidSoldRows = soldRows.filter((row) => toNumber(row[COLS.buyPrice]) > 0);
        const freeSoldUnits = freeSoldRows.length;
        const annualizedReturn = annualizedReturnOnCapital(paidSoldRows);
        const paidSoldProfit = sum(paidSoldRows, COLS.profit);
        const profitPerDay = paidSoldRows.length
            ? paidSoldProfit / Math.max(1, sum(paidSoldRows, COLS.daysToSell))
            : 0;
        const daysInInventory = average(inventoryRows, COLS.daysHeld);
        const oneYearInventoryCount = inventoryRows.filter((row) => toNumber(row[COLS.daysHeld]) >= 365).length;
        const inventoryTurnover = inventoryCost ? salesRevenue / inventoryCost : 0;
        const zeroCostShare = soldUnits ? freeSoldUnits / soldUnits : 0;
        const avgPaidVsSellerAsking = averageRatio([...soldRows, ...inventoryRows], COLS.buyPrice, COLS.asking);
        const latestMonthlyProfitPerInventory = latestFinite(daily.map((row) => row.monthlyProfitPerInventory));

        setText("total-profit", money.format(totalProfit));
        setText("gross-margin", formatRatio(grossMargin));
        setText("monthly-profit-inventory", latestMonthlyProfitPerInventory == null ? "n/a" : formatRatio(latestMonthlyProfitPerInventory));
        setText("sales-revenue", money.format(salesRevenue));
        setText("sold-count", number.format(soldUnits));

        setText("avg-days", number.format(avgDays));
        setText("inventory-cost", money.format(inventoryCost));
        setText("inventory-count", number.format(inventoryCount));
        setText("realized-roi", formatRatio(realizedRoi));
        setText("avg-profit", money.format(soldUnits ? totalProfit / soldUnits : 0));
        setText("median-profit", money.format(medianProfit));
        setText("median-days", number.format(medianDays));
        setText("active-asking", money.format(activeAsking));
        setText("unrealized-profit", money.format(unrealizedProfit));
        setText("aging-risk", number.format(agingRisk));
        setText("annualized-return", formatRatio(annualizedReturn));
        setText("profit-per-day", moneyTwoDecimals.format(profitPerDay));
        setText("days-in-inventory", formatInventoryAge(daysInInventory));
        setText("inventory-one-year", number.format(oneYearInventoryCount));
        setText("inventory-turnover", `${number.format(inventoryTurnover)}x`);
        setText("free-items", number.format(freeSoldUnits));
        setText("free-items-share", formatRatio(zeroCostShare));
        setText("sell-through", formatRatio(sellThrough));
        setText("avg-markup", formatWholeRatio(avgMarkup));
        setText("marketplace-ads", marketplaceAds ? number.format(marketplaceAds) : "n/a");
        setText("ad-gap", hasAdGapMetric ? number.format(adGap) : "n/a");
        setText("avg-paid-percent-seller-asking", formatRatio(avgPaidVsSellerAsking));
    }

    function renderCategoryFilter(categories) {
        if (!categoryFilterPanel) return;
        categoryFilterPanel.innerHTML = `
            <div class="multi-filter-actions">
                <button type="button" data-action="all">All</button>
                <button type="button" data-action="none">None</button>
            </div>
            <div class="multi-filter-options">
                ${categories.map((type) => `
                    <label class="multi-filter-option">
                        <input type="checkbox" value="${escapeAttr(type)}" ${categoryState.get(type) !== false ? "checked" : ""}>
                        <span>${escapeHtml(type)}</span>
                    </label>
                `).join("")}
            </div>
        `;
        categoryFilterPanel.querySelectorAll("input[type='checkbox']").forEach((input) => {
            input.addEventListener("change", (event) => {
                categoryState.set(event.target.value, event.target.checked);
                syncCategoryFilterLabel();
                render();
            });
        });
        categoryFilterPanel.querySelectorAll("button[data-action]").forEach((button) => {
            button.addEventListener("click", () => {
                const action = button.dataset.action;
                const nextValue = action === "all";
                categoryFilterPanel.querySelectorAll("input[type='checkbox']").forEach((input) => {
                    input.checked = nextValue;
                    categoryState.set(input.value, nextValue);
                });
                syncCategoryFilterLabel();
                render();
            });
        });
    }

    function renderYearFilter(years) {
        if (!yearFilterPanel) return;
        yearFilterPanel.innerHTML = `
            <div class="multi-filter-actions">
                <button type="button" data-action="all">All</button>
                <button type="button" data-action="none">None</button>
            </div>
            <div class="multi-filter-options">
                ${years.map((year) => `
                    <label class="multi-filter-option">
                        <input type="checkbox" value="${year}" ${yearState.get(String(year)) !== false ? "checked" : ""}>
                        <span>${year}</span>
                    </label>
                `).join("")}
            </div>
        `;
        yearFilterPanel.querySelectorAll("input[type='checkbox']").forEach((input) => {
            input.addEventListener("change", (event) => {
                yearState.set(event.target.value, event.target.checked);
                syncYearFilterLabel();
                render();
            });
        });
        yearFilterPanel.querySelectorAll("button[data-action]").forEach((button) => {
            button.addEventListener("click", () => {
                const nextValue = button.dataset.action === "all";
                yearFilterPanel.querySelectorAll("input[type='checkbox']").forEach((input) => {
                    input.checked = nextValue;
                    yearState.set(input.value, nextValue);
                });
                syncYearFilterLabel();
                render();
            });
        });
    }

    function syncPriceFilterInputs() {
        if (paidMinFilter) paidMinFilter.value = priceRangeState.paidMin;
        if (paidMaxFilter) paidMaxFilter.value = priceRangeState.paidMax;
        if (soldMinFilter) soldMinFilter.value = priceRangeState.soldMin;
        if (soldMaxFilter) soldMaxFilter.value = priceRangeState.soldMax;
    }

    function getSelectedCategories() {
        return Array.from(categoryState.entries()).filter(([, enabled]) => enabled).map(([type]) => type);
    }

    function getSelectedYears() {
        return Array.from(yearState.entries()).filter(([, enabled]) => enabled).map(([year]) => year);
    }

    function toNullableNumber(value) {
        const text = String(value ?? "").trim();
        if (!text) return null;
        const numeric = Number(text);
        return Number.isFinite(numeric) ? numeric : null;
    }

    function allYearsSelected() {
        const years = Array.from(yearState.keys());
        return years.length > 0 && years.every((year) => yearState.get(year));
    }

    function allCategoriesSelected() {
        const categories = Array.from(categoryState.keys());
        return categories.length > 0 && categories.every((type) => categoryState.get(type));
    }

    function syncYearFilterLabel() {
        if (!yearFilterLabel) return;
        const selected = getSelectedYears();
        const total = yearState.size;
        if (!total || selected.length === total) {
            yearFilterLabel.textContent = "All years";
        } else if (!selected.length) {
            yearFilterLabel.textContent = "No years";
        } else if (selected.length <= 2) {
            yearFilterLabel.textContent = selected.join(", ");
        } else {
            yearFilterLabel.textContent = `${selected.length} years selected`;
        }
        if (yearFilterButton) yearFilterButton.setAttribute("aria-expanded", yearFilterPanel && !yearFilterPanel.hidden ? "true" : "false");
    }

    function syncCategoryFilterLabel() {
        if (!categoryFilterLabel) return;
        const selected = getSelectedCategories();
        const total = categoryState.size;
        if (!total || selected.length === total) {
            categoryFilterLabel.textContent = "All categories";
        } else if (!selected.length) {
            categoryFilterLabel.textContent = "No categories";
        } else if (selected.length <= 2) {
            categoryFilterLabel.textContent = selected.join(", ");
        } else {
            categoryFilterLabel.textContent = `${selected.length} categories selected`;
        }
        if (categoryFilterButton) categoryFilterButton.setAttribute("aria-expanded", categoryFilterPanel && !categoryFilterPanel.hidden ? "true" : "false");
    }

    function toggleCategoryFilterPanel() {
        if (!categoryFilterPanel) return;
        categoryFilterPanel.hidden = !categoryFilterPanel.hidden;
        syncCategoryFilterLabel();
    }

    function toggleYearFilterPanel() {
        if (!yearFilterPanel) return;
        yearFilterPanel.hidden = !yearFilterPanel.hidden;
        syncYearFilterLabel();
    }

    function closeYearFilterPanel() {
        if (!yearFilterPanel) return;
        yearFilterPanel.hidden = true;
        syncYearFilterLabel();
    }

    function closeCategoryFilterPanel() {
        if (!categoryFilterPanel) return;
        categoryFilterPanel.hidden = true;
        syncCategoryFilterLabel();
    }

    function metricValue(name, fallback, enabled) {
        if (!enabled) return fallback;
        const record = kpiMetrics.get(name);
        if (!record) return fallback;
        const value = toNumber(record.Value);
        return Number.isFinite(value) ? value : fallback;
    }

    function renderPlotly(source) {
        const chart = document.getElementById("income-chart");
        if (!window.Plotly) {
            chart.innerHTML = "<p>Chart library did not load.</p>";
            return;
        }
        if (!source.length) {
            chart.innerHTML = "<p>No inventory or sales events match the selected filters.</p>";
            return;
        }
        const data = TRACE_DEFS
            .filter(([key]) => traceState.get(key))
            .map(([key, label, axis, , format]) => key === "activity" ? activityTrace(source) : lineTrace(source, key, label, axis, format));

        Plotly.react("income-chart", data, {
            title: { text: "Groundbnb Inventory, Cash, Equity & Yield", x: 0, xanchor: "left", y: 0.98, yanchor: "top" },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { family: "Outfit, sans-serif", color: "#f4f0df" },
            colorway: ["#42f5a7", "#55d6ff", "#ffb84a", "#2acb84", "#3aa5ff", "#f5d06a", "#ff6f91", "#cbbcff", "#b8ff4a", "#ffffff"],
            xaxis: { title: "Date", gridcolor: "rgba(244,240,223,0.10)", zerolinecolor: "rgba(244,240,223,0.18)" },
            yaxis: {
                title: "Inventory Cost / Cash / Equity ($)",
                tickprefix: "$",
                separatethousands: true,
                gridcolor: "rgba(244,240,223,0.10)",
                zerolinecolor: "rgba(244,240,223,0.18)",
            },
            yaxis2: {
                title: "Avg Item Cost Basis ($)",
                tickprefix: "$",
                separatethousands: true,
                overlaying: "y",
                side: "right",
                gridcolor: "rgba(244,240,223,0)",
            },
            yaxis3: {
                title: "30D Profit / Avg Inventory (%/mo)",
                tickformat: ".0%",
                overlaying: "y",
                side: "right",
                anchor: "free",
                position: 1,
                gridcolor: "rgba(244,240,223,0)",
            },
            hovermode: "x",
            hoverlabel: { bgcolor: "#101411", bordercolor: "rgba(66,245,167,0.55)", font: { color: "#f4f0df" } },
            legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0 },
            margin: { l: 72, r: 82, t: 150, b: 58 },
        }, { responsive: true, displaylogo: false });
    }

    function lineTrace(source, key, label, axis, format) {
        const hoverValue = format === "percent" ? "%{y:.1%}" : "$%{y:,.2f}";
        return {
            x: source.map((row) => row.date),
            y: source.map((row) => row[key]),
            mode: "lines",
            name: label,
            yaxis: axis,
            line: { width: key.endsWith("MA") ? 2 : 3 },
            hovertemplate: `<b>%{x|%Y-%m-%d}</b><br>${label}: ${hoverValue}<extra></extra>`,
        };
    }

    function activityTrace(source) {
        const active = source.filter((row) => row.activity);
        return {
            x: active.map((row) => row.date),
            y: active.map((row) => row.total),
            mode: "markers",
            name: "Buy / Sell Activity",
            marker: { size: 8, symbol: "diamond", color: "#f4f0df", line: { width: 1, color: "#42f5a7" } },
            text: active.map((row) => row.activity),
            hovertemplate: "<b>%{x|%Y-%m-%d}</b><br>%{text}<extra></extra>",
        };
    }

    function renderTypeBars(records) {
        const chart = document.getElementById("type-bars");
        if (!window.Plotly) {
            chart.innerHTML = "<p>Chart library did not load.</p>";
            return;
        }
        const byType = new Map();
        records.forEach((row) => {
            const type = row[COLS.type] || "Other";
            const profit = toNumber(row[COLS.profit]);
            const days = Math.max(1, toNumber(row[COLS.daysToSell]));
            const bucket = byType.get(type) || { profit: 0, days: 0, count: 0 };
            bucket.profit += profit;
            bucket.days += days;
            bucket.count += 1;
            byType.set(type, bucket);
        });
        const sorted = Array.from(byType.entries())
            .map(([type, stats]) => ({
                type,
                profit: stats.profit,
                days: stats.days,
                count: stats.count,
                rate: stats.profit / Math.max(1, stats.days),
            }))
            .sort((a, b) => b.rate - a.rate);
        if (!sorted.length) {
            chart.innerHTML = "<p>No closed sales match the selected filters.</p>";
            return;
        }
        Plotly.react("type-bars", [
            {
                type: "bar",
                orientation: "h",
                y: sorted.map((row) => row.type),
                x: sorted.map((row) => row.rate),
                text: sorted.map((row) => `${money.format(row.profit)} profit · ${number.format(row.days)} days · ${row.count} items`),
                textposition: "auto",
                marker: {
                    color: sorted.map((row, index) => index === 0 ? "#42f5a7" : index === sorted.length - 1 ? "#ffb84a" : "#55d6ff"),
                },
                hovertemplate: "%{y}<br>Profit per day: $%{x:.2f}<br>%{text}<extra></extra>",
            },
        ], {
            title: { text: "Category profit per day" },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { family: "Outfit, sans-serif", color: "#f4f0df" },
            margin: { l: 120, r: 24, t: 56, b: 40 },
            xaxis: { title: "Profit per day ($)", gridcolor: "rgba(244,240,223,0.10)", zerolinecolor: "rgba(244,240,223,0.18)" },
            yaxis: { automargin: true, categoryorder: "array", categoryarray: sorted.map((row) => row.type), autorange: "reversed", gridcolor: "rgba(244,240,223,0.06)" },
            showlegend: false,
        }, { responsive: true, displaylogo: false });
    }

    function renderInventory(inventoryRows) {
        const sortedInventory = [...inventoryRows].sort((a, b) => toNumber(b[COLS.buyPrice]) - toNumber(a[COLS.buyPrice]));
        const topInventory = sortedInventory.slice(0, 10);
        const moreInventory = sortedInventory.slice(10);
        document.getElementById("inventory-preview").innerHTML = topInventory.map((row) => `
            <div class="inventory-item">
                <div>
                    <strong>${escapeHtml(titleWithAge(row[COLS.item], row[COLS.buyDate], "purchased"))}</strong>
                    <span>${escapeHtml(row[COLS.type] || "Other")} bought ${formatDate(row[COLS.buyDate])}</span>
                </div>
                <div class="inventory-prices">
                    <div><span>Paid</span><b>${money.format(toNumber(row[COLS.buyPrice]))}</b></div>
                    <div><span>Asking</span><b>${money.format(toNumber(row[COLS.asking]))}</b></div>
                </div>
            </div>
        `).join("") || "<p>No active inventory matches the selected filters.</p>";
        document.getElementById("inventory-list").innerHTML = moreInventory.map((row) => `
            <div class="inventory-item">
                <div>
                    <strong>${escapeHtml(titleWithAge(row[COLS.item], row[COLS.buyDate], "purchased"))}</strong>
                    <span>${escapeHtml(row[COLS.type] || "Other")} bought ${formatDate(row[COLS.buyDate])}</span>
                </div>
                <div class="inventory-prices">
                    <div><span>Paid</span><b>${money.format(toNumber(row[COLS.buyPrice]))}</b></div>
                    <div><span>Asking</span><b>${money.format(toNumber(row[COLS.asking]))}</b></div>
                </div>
            </div>
        `).join("");
        const expander = document.getElementById("inventory-expander");
        const label = document.getElementById("inventory-more-label");
        if (expander) expander.style.display = moreInventory.length ? "" : "none";
        if (label) label.textContent = moreInventory.length ? `More (${moreInventory.length})` : "More";
    }

    function renderUnlinkedInventory(inventoryRows) {
        const unlinked = inventoryRows.filter((row) => !String(row[COLS.listingUrl] || "").trim());
        const count = document.getElementById("reconciliation-count");
        const list = document.getElementById("reconciliation-list");
        if (count) count.textContent = number.format(unlinked.length);
        if (!list) return;
        list.innerHTML = unlinked.slice(0, 12).map((row) => `
            <div class="inventory-item">
                <div>
                    <strong>${escapeHtml(titleWithAge(row[COLS.item], row[COLS.buyDate], "purchased"))}</strong>
                    <span>${escapeHtml(row[COLS.type] || "Other")} · ${escapeHtml(row[COLS.status] || "Active")} · ${escapeHtml(row[COLS.source] || row[COLS.notes] || "No listing URL")}</span>
                </div>
                <b>${money.format(toNumber(row[COLS.asking]))}</b>
            </div>
        `).join("") || "<p>Every active row has a listing URL.</p>";
    }

    function renderRecentSales(records) {
        const recent = [...records].sort((a, b) => (excelDate(b[COLS.soldDate]) || 0) - (excelDate(a[COLS.soldDate]) || 0)).slice(0, 12);
        document.getElementById("recent-sales").innerHTML = recent.map((row) => {
            const profit = toNumber(row[COLS.profit]);
            return `
                <tr>
                    <td>${formatDate(row[COLS.soldDate])}</td>
                    <td>${escapeHtml(titleWithAge(row[COLS.item], row[COLS.soldDate], "sold"))}</td>
                    <td>${escapeHtml(row[COLS.type] || "")}</td>
                    <td>${money.format(toNumber(row[COLS.buyPrice]))}</td>
                    <td>${money.format(toNumber(row[COLS.soldPrice]))}</td>
                    <td class="${profit >= 0 ? "profit-positive" : "profit-negative"}">${money.format(profit)}</td>
                    <td>${formatDaysToSell(row)}</td>
                </tr>
            `;
        }).join("");
    }

    function renderRecentPurchases(records) {
        const recent = [...records]
            .sort((a, b) => (excelDate(b[COLS.buyDate]) || 0) - (excelDate(a[COLS.buyDate]) || 0))
            .slice(0, 12);
        document.getElementById("recent-purchases").innerHTML = recent.map((row) => `
            <div class="inventory-item">
                <div>
                    <strong>${escapeHtml(titleWithAge(row[COLS.item], row[COLS.buyDate], "purchased"))}</strong>
                    <span>${escapeHtml(row[COLS.type] || "Other")} bought ${formatDate(row[COLS.buyDate])}</span>
                </div>
                <b>${money.format(toNumber(row[COLS.buyPrice]))}</b>
            </div>
        `).join("") || "<p>No purchases match the selected filters.</p>";
    }

    function setSourceStatus(text) {
        if (sourceStatus) sourceStatus.textContent = text;
    }

    function cleanNumberish(value) {
        if (value == null) return "";
        if (typeof value === "number") return Number.isFinite(value) ? value : "";
        const text = String(value).trim();
        if (!text || text === "#REF!") return "";
        const numeric = Number(text.replace(/[$,%]/g, "").replace(/,/g, ""));
        return Number.isFinite(numeric) ? numeric : value;
    }

    function formatDaysToSell(row) {
        const rawValue = row?.[COLS.daysToSell];
        if (rawValue == null || String(rawValue).trim() === "") return "—";
        return number.format(toNumber(rawValue));
    }

    function toNumber(value) {
        const cleaned = cleanNumberish(value);
        if (typeof cleaned === "number") return cleaned;
        const numeric = Number(cleaned);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function excelDate(value) {
        if (!value) return null;
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return null;
            const gviz = trimmed.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
            if (gviz) return new Date(Date.UTC(Number(gviz[1]), Number(gviz[2]), Number(gviz[3])));
            const parsed = new Date(trimmed);
            if (!Number.isNaN(parsed.valueOf())) return parsed;
            const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (mdy) return new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
        }
        const serial = Number(value);
        if (!Number.isFinite(serial)) return null;
        return new Date(Date.UTC(1899, 11, 30 + serial));
    }

    function getYear(value) {
        const date = excelDate(value);
        return date ? date.getUTCFullYear() : "";
    }

    function dateKey(date) {
        return date.toISOString().slice(0, 10);
    }

    function addDays(date, days) {
        const copy = new Date(date);
        copy.setUTCDate(copy.getUTCDate() + days);
        return copy;
    }

    function formatDate(value) {
        const date = excelDate(value);
        return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
    }

    function formatAge(value, mode) {
        const date = excelDate(value);
        if (!date) return "";
        const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
        return `${days} day${days === 1 ? "" : "s"} since ${mode}`;
    }

    function titleWithAge(title, dateValue, mode) {
        const cleanTitle = String(title || "Untitled item").trim();
        const age = formatAge(dateValue, mode);
        return age ? `${cleanTitle} - ${age}` : cleanTitle;
    }

    function formatExportedAt(value) {
        if (!value) return "unknown time";
        const parsed = new Date(value);
        return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString();
    }

    function formatRatio(value) {
        return `${number.format((Number.isFinite(value) ? value : 0) * 100)}%`;
    }

    function formatWholeRatio(value) {
        return `${wholeNumber.format((Number.isFinite(value) ? value : 0) * 100)}%`;
    }

    function formatInventoryAge(days) {
        if (days > 60) return `${number.format(days / 30.44)} months`;
        return `${number.format(days)} days`;
    }

    function mean(values) {
        const valid = values.filter((value) => Number.isFinite(value));
        return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
    }

    function median(values) {
        const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
        if (!valid.length) return 0;
        const middle = Math.floor(valid.length / 2);
        return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
    }

    function rollingMean(values, windowSize) {
        return values.map((_, index) => mean(values.slice(Math.max(0, index - windowSize + 1), index + 1)));
    }

    function rollingSum(values, windowSize) {
        return values.map((_, index) => values
            .slice(Math.max(0, index - windowSize + 1), index + 1)
            .filter((value) => Number.isFinite(value))
            .reduce((total, value) => total + value, 0));
    }

    function latestFinite(values) {
        for (let index = values.length - 1; index >= 0; index -= 1) {
            if (Number.isFinite(values[index])) return values[index];
        }
        return null;
    }

    function sum(records, key) {
        return records.reduce((total, row) => total + toNumber(row[key]), 0);
    }

    function average(records, key) {
        const values = records.map((row) => toNumber(row[key])).filter((value) => value > 0);
        return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    }

    function averageRatio(records, numeratorKey, denominatorKey) {
        const values = records
            .map((row) => {
                const denominator = toNumber(row[denominatorKey]);
                const numerator = toNumber(row[numeratorKey]);
                return denominator > 0 ? numerator / denominator : null;
            })
            .filter((value) => value != null && Number.isFinite(value));
        return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    }

    function averageMarkup(records) {
        const values = records.map((row) => toRatioNumber(row[COLS.markup])).filter((value) => value > 0);
        return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    }

    function toRatioNumber(value) {
        if (typeof value === "string" && value.includes("%")) {
            return toNumber(value) / 100;
        }
        return toNumber(value);
    }

    function annualizedReturnOnCapital(records) {
        const numerator = records.reduce((total, row) => {
            const cost = toNumber(row[COLS.buyPrice]);
            const profit = toNumber(row[COLS.profit]);
            const held = Math.max(1, toNumber(row[COLS.daysToSell]));
            if (cost <= 0 || profit === 0) return total;
            return total + (profit * 365 / held);
        }, 0);
        const denominator = sum(records, COLS.buyPrice);
        return denominator > 0 ? numerator / denominator : 0;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        }[char]));
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, "&#096;");
    }
}());
