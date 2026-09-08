(function () {
    const SCALE_MAX_STORAGE_KEY = "flip_tracker_scale_max";
    const data = window.FLIP_TRACKER_DATA || { headers: [], rows: [] };
    const headers = data.headers || [];
    const records = (data.rows || []).map((row, index) => {
        const sourceRow = Array.isArray(row) ? row : (Array.isArray(row.value) ? row.value : []);
        const values = {};
        headers.forEach((header, colIndex) => {
            values[header] = sourceRow[colIndex] == null ? "" : String(sourceRow[colIndex]).trim();
        });
        return {
            id: index,
            values,
            title: getAny(values, ["Title"]) || `Record ${index + 1}`,
            location: getAny(values, ["Location"]) || "Unknown",
            verdict: normalizeVerdict(getAny(values, ["Verdict"])),
            ask: parseMoney(getAny(values, ["Ask Price"])),
            openingOffer: parseMoney(getAny(values, ["Opening Offer"])),
            maxBuy: parseMoney(getAny(values, ["Max Buy Price"])),
            listPrice: parseMoney(getAny(values, ["List Price"])),
            acceptPrice: parseMoney(getAny(values, ["Accept Price"])),
            estimatedCosts: parseMoney(getAny(values, ["Estimated Costs", "Est. Costs"])),
            profit: parseMoney(getAny(values, ["Estimated Gross Profit", "Est. Gross Profit"])),
            roi: parsePercent(getAny(values, ["ROI", "ROI %"])),
            newEstimate: parseMoney(getAny(values, ["New Price Estimate", "New Retail Price", "MSRP", "List Price"])),
            days: parseFirstNumber(getAny(values, ["Sell Days Min", "Est. Days to Sell"])),
            confidence: getAny(values, ["Confidence"]) || "-",
            searchable: headers.map((header) => get(values, header)).join(" ").toLowerCase()
        };
    });

    const strongGoTopTwoIds = computeStrongGoTopTwoIds(records);

    const state = {
        filtered: [],
        selectedId: records[0] ? records[0].id : null
    };

    const els = {
        search: document.getElementById("search-input"),
        location: document.getElementById("location-filter"),
        verdict: document.getElementById("verdict-filter"),
        kpi: document.getElementById("kpi-filter"),
        sort: document.getElementById("sort-select"),
        scaleMax: document.getElementById("scale-max-select"),
        reset: document.getElementById("reset-filters"),
        list: document.getElementById("record-list"),
        railCount: document.getElementById("rail-count"),
        visibleCount: document.getElementById("visible-count"),
        totalCount: document.getElementById("total-count"),
        goRate: document.getElementById("go-rate"),
        avgRoi: document.getElementById("avg-roi"),
        position: document.getElementById("record-position"),
        title: document.getElementById("record-title"),
        prev: document.getElementById("prev-record"),
        next: document.getElementById("next-record"),
        roiGauge: document.getElementById("roi-gauge"),
        profitGauge: document.getElementById("profit-gauge"),
        buyGauge: document.getElementById("buy-gauge"),
        confidenceGauge: document.getElementById("confidence-gauge"),
        roiValue: document.getElementById("roi-value"),
        profitValue: document.getElementById("profit-value"),
        buyValue: document.getElementById("buy-value"),
        confidenceValue: document.getElementById("confidence-value"),
        quickVerdict: document.getElementById("quick-verdict"),
        quickAsk: document.getElementById("quick-ask"),
        quickLocation: document.getElementById("quick-location"),
        quickDays: document.getElementById("quick-days"),
        accordion: document.getElementById("accordion-zone"),
        panel: document.querySelector(".record-panel"),
        verdictIndicator: document.getElementById("verdict-indicator"),
        buyZone: document.getElementById("buy-zone"),
        cautionZone: document.getElementById("caution-zone"),
        sellZone: document.getElementById("sell-zone"),
        buyBand: document.getElementById("buy-band"),
        sellBand: document.getElementById("sell-band"),
        priceGuides: document.getElementById("price-guides"),
        priceMarkers: document.getElementById("price-markers"),
        priceLegend: document.getElementById("price-scale-legend"),
        cockpitFile: document.getElementById("cockpit-file-input"),
        cockpitFileLabel: document.getElementById("cockpit-file-label"),
        cockpitPreview: document.getElementById("cockpit-preview"),
        cockpitItemName: document.getElementById("cockpit-item-name"),
        cockpitCategory: document.getElementById("cockpit-category"),
        cockpitSellerAsk: document.getElementById("cockpit-seller-ask"),
        cockpitRetail: document.getElementById("cockpit-retail"),
        cockpitUsedLow: document.getElementById("cockpit-used-low"),
        cockpitUsedMedian: document.getElementById("cockpit-used-median"),
        cockpitUsedHigh: document.getElementById("cockpit-used-high"),
        cockpitCondition: document.getElementById("cockpit-condition"),
        cockpitStorage: document.getElementById("cockpit-storage"),
        cockpitRecommendation: document.getElementById("cockpit-recommendation"),
        cockpitMaxPay: document.getElementById("cockpit-max-pay"),
        cockpitBestAsk: document.getElementById("cockpit-best-ask"),
        cockpitAcceptFloor: document.getElementById("cockpit-accept-floor"),
        cockpitProfit: document.getElementById("cockpit-profit"),
        cockpitRoi: document.getElementById("cockpit-roi"),
        cockpitConfidence: document.getElementById("cockpit-confidence"),
        cockpitPersonalFit: document.getElementById("cockpit-personal-fit"),
        cockpitRiskNotes: document.getElementById("cockpit-risk-notes"),
        useSelectedRecord: document.getElementById("use-selected-record"),
        copyCockpitPrompt: document.getElementById("copy-cockpit-prompt")
    };

    function get(values, key) {
        return values[key] || "";
    }

    function getAny(values, keys) {
        for (const key of keys) {
            if (values[key]) return values[key];
        }
        return "";
    }

    function parseMoney(value) {
        const text = String(value || "").replace(/,/g, "");
        const match = text.match(/-?\d+(\.\d+)?/);
        return match ? Number(match[0]) : null;
    }

    function parsePercent(value) {
        const text = String(value || "").replace(/,/g, "");
        const match = text.match(/-?\d+(\.\d+)?/);
        if (!match) return null;
        const numeric = Number(match[0]);
        if (!text.includes("%") && Math.abs(numeric) <= 3) return numeric * 100;
        return numeric;
    }

    function parseFirstNumber(value) {
        const match = String(value || "").match(/\d+(\.\d+)?/);
        return match ? Number(match[0]) : null;
    }

    function normalizeVerdict(value) {
        const raw = String(value || "").trim();
        const lower = raw.toLowerCase();
        if (lower.includes("strong")) return "STRONG GO";
        if (lower.includes("no")) return "NO-GO";
        if (lower.includes("caution")) return "CAUTION";
        if (lower.includes("go")) return "GO";
        return raw || "-";
    }

    function money(value) {
        return value == null || Number.isNaN(value) ? "-" : `$${Math.round(value).toLocaleString()}`;
    }

    function pct(value) {
        return value == null || Number.isNaN(value) ? "-" : `${Math.round(value)}%`;
    }

    function safeText(value) {
        return value == null || value === "" ? "-" : String(value);
    }

    function setGauge(el, value, max, tone) {
        const numeric = value == null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
        el.style.setProperty("--pct", `${numeric}%`);
        el.style.setProperty("--tone", tone);
    }

    function verdictClass(verdict) {
        const lower = String(verdict || "").toLowerCase();
        if (lower.includes("no")) return "no-go";
        if (lower.includes("caution")) return "caution";
        if (lower.includes("go")) return "go";
        return "";
    }

    function displayVerdict(record) {
        return isStrongGo(record) ? "STRONG GO" : normalizeVerdict(record?.verdict);
    }

    function buildFilters() {
        const locations = Array.from(new Set(records.map((record) => record.location).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        const verdicts = Array.from(new Set(records.map((record) => record.verdict).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        fillSelect(els.location, [["all", "All locations"], ...locations.map((value) => [value, value])]);
        fillSelect(els.verdict, [["all", "All verdicts"], ...verdicts.map((value) => [value, value])]);
    }

    function fillSelect(select, options) {
        select.innerHTML = options.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("");
    }

    function applyFilters() {
        const query = els.search.value.trim().toLowerCase();
        const location = els.location.value;
        const verdict = els.verdict.value;
        const kpi = els.kpi.value;

        state.filtered = records.filter((record) => {
            if (query && !record.searchable.includes(query)) return false;
            if (location !== "all" && record.location !== location) return false;
            if (verdict !== "all" && displayVerdict(record) !== verdict) return false;
            if (kpi === "go" && !["GO", "STRONG GO"].includes(displayVerdict(record))) return false;
            if (kpi === "roi60" && !(record.roi != null && record.roi >= 60)) return false;
            if (kpi === "profit50" && !(record.profit != null && record.profit >= 50)) return false;
            if (kpi === "ask100" && !(record.ask != null && record.ask <= 100)) return false;
            if (kpi === "caution" && ["GO", "STRONG GO"].includes(displayVerdict(record))) return false;
            return true;
        });

        state.filtered.sort(sorter(els.sort.value));
        if (!state.filtered.some((record) => record.id === state.selectedId)) {
            state.selectedId = state.filtered[0] ? state.filtered[0].id : null;
        }
        render();
    }

    function sorter(mode) {
        const byText = (field) => (a, b) => String(a[field] || "").localeCompare(String(b[field] || ""));
        const byNumDesc = (field) => (a, b) => (b[field] ?? -Infinity) - (a[field] ?? -Infinity);
        const byNumAsc = (field) => (a, b) => (a[field] ?? Infinity) - (b[field] ?? Infinity);
        const options = {
            "roi-desc": byNumDesc("roi"),
            "profit-desc": byNumDesc("profit"),
            "ask-asc": byNumAsc("ask"),
            "ask-desc": byNumDesc("ask"),
            "maxbuy-asc": byNumAsc("maxBuy"),
            "days-asc": byNumAsc("days"),
            "location-asc": byText("location"),
            "title-asc": byText("title")
        };
        return options[mode] || options["roi-desc"];
    }

    function render() {
        renderSummary();
        renderList();
        renderDetail();
    }

    function renderSummary() {
        const visible = state.filtered.length;
        const go = state.filtered.filter((record) => ["GO", "STRONG GO"].includes(displayVerdict(record))).length;
        const roiValues = state.filtered.map((record) => record.roi).filter((value) => value != null && !Number.isNaN(value));
        const avg = roiValues.length ? roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length : 0;
        els.visibleCount.textContent = visible;
        els.totalCount.textContent = records.length;
        els.goRate.textContent = visible ? `${Math.round((go / visible) * 100)}%` : "0%";
        els.avgRoi.textContent = `${Math.round(avg)}%`;
        els.railCount.textContent = visible;
    }

    function renderList() {
        const preservedScrollTop = els.list.scrollTop;
        if (!state.filtered.length) {
            els.list.innerHTML = '<div class="empty-state">No records match these filters.</div>';
            els.list.scrollTop = 0;
            return;
        }
        els.list.innerHTML = state.filtered.map((record) => `
            <button class="record-item ${record.id === state.selectedId ? "active" : ""}" type="button" data-id="${record.id}">
                <strong>${escapeHtml(record.title)}</strong>
                <small>${escapeHtml(record.location)} | Ask ${escapeHtml(money(record.ask))} | ROI ${escapeHtml(pct(record.roi))}</small>
                <span class="tag-row">
                    <span class="tag ${verdictClass(displayVerdict(record))}">${escapeHtml(displayVerdict(record))}</span>
                    <span class="tag">${escapeHtml(money(record.profit))} profit</span>
                </span>
            </button>
        `).join("");
        els.list.scrollTop = preservedScrollTop;
    }

    function renderDetail() {
        const record = state.filtered.find((item) => item.id === state.selectedId);
        if (!record) {
            els.position.textContent = "0 / 0";
            els.title.textContent = "No records";
            els.accordion.innerHTML = '<div class="empty-state">Adjust filters to show records.</div>';
            els.panel.dataset.verdict = "";
            els.verdictIndicator.textContent = "Verdict: -";
            clearPriceScale();
            return;
        }

        const index = state.filtered.findIndex((item) => item.id === record.id);
        const values = record.values;
        els.position.textContent = `${index + 1} / ${state.filtered.length}`;
        els.title.textContent = record.title;
        els.roiValue.textContent = pct(record.roi);
        els.profitValue.textContent = money(record.profit);
        els.buyValue.textContent = money(record.maxBuy);
        els.confidenceValue.textContent = record.confidence;
        els.quickVerdict.textContent = record.verdict;
        els.quickAsk.textContent = money(record.ask);
        els.quickLocation.textContent = record.location;
        els.quickDays.textContent = safeText(sellDays(values));
        setVerdictVisual(record);

        setGauge(els.roiGauge, record.roi, 120, record.roi >= 60 ? "var(--hud)" : "var(--amber)");
        setGauge(els.profitGauge, record.profit, 400, record.profit >= 50 ? "var(--hud)" : "var(--amber)");
        setGauge(els.buyGauge, record.maxBuy, Math.max(100, record.ask || record.maxBuy || 100), "var(--cyan)");
        setGauge(els.confidenceGauge, confidenceScore(record.confidence), 100, confidenceTone(record.confidence));
        renderPriceScale(record);

        els.accordion.innerHTML = [
            section("Mission Brief", values, ["Scan Timestamp", "Date analyzed", "Status", "Listing ID", "Listing URL", "URL", "Title", "Ask Price", "Location", "Verdict", "Confidence", "Sell Days Min", "Sell Days Max", "Est. Days to Sell"], true),
            section("Pricing", values, ["Max Buy Price", "Opening Offer", "List Price", "Accept Price", "Estimated Costs", "Est. Costs", "Estimated Gross Profit", "Est. Gross Profit", "ROI", "ROI %", "Price Justification"], true),
            section("Item ID", values, ["Seller Name", "Category", "Brand", "Model", "Part Number / SKU", "Size / Dimensions", "Condition Stated", "Condition", "Condition From Photos", "Accessories Included", "Key Accessories"], false),
            section("Media And Quality Gate", values, ["Photos Available", "Photos Inspected", "Vision Quality", "Media Inspected", "Data Quality", "Browser URL Verified", "Expected Listing ID", "Actual Listing ID"], false),
            section("Risk And Sales Notes", values, ["Missing / Risk Items", "Missing/Risk Items", "Demand Trend", "Seasonality", "Competition Level", "Red Flags", "Green Flags", "Suggested Title Keywords"], false),
            section("Seller Messages", values, ["Soft Seller Message", "Soft Message", "Lowball Seller Message", "Lowball Message", "Recommended Message"], false),
            allColumns(values)
        ].join("");
    }

    function scoreForStrongGo(record) {
        if (!record) return -Infinity;
        const normalized = normalizeVerdict(record.verdict);
        if (normalized === "NO-GO" || normalized === "CAUTION") return -Infinity;
        const roi = record.roi == null || Number.isNaN(record.roi) ? -Infinity : record.roi;
        const profit = record.profit == null || Number.isNaN(record.profit) ? -Infinity : record.profit;
        if (!Number.isFinite(roi) || !Number.isFinite(profit)) return -Infinity;
        return roi + (profit / 2);
    }

    function computeStrongGoTopTwoIds(allRecords) {
        return new Set(
            allRecords
                .map((record) => ({ id: record.id, score: scoreForStrongGo(record) }))
                .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 2)
                .map((entry) => entry.id)
        );
    }

    function isStrongGo(record) {
        if (!record) return false;
        if (normalizeVerdict(record.verdict) === "STRONG GO") return true;
        return strongGoTopTwoIds.has(record.id);
    }

    function setVerdictVisual(record) {
        const normalized = normalizeVerdict(record?.verdict);
        const verdictText = isStrongGo(record) ? "STRONG GO" : normalized;
        els.panel.dataset.verdict = verdictText;
        if (isStrongGo(record)) {
            els.panel.dataset.strongGo = "true";
        } else {
            delete els.panel.dataset.strongGo;
        }
        const tone = verdictClass(verdictText);
        els.verdictIndicator.className = "verdict-indicator";
        if (tone) els.verdictIndicator.classList.add(tone);
        if (isStrongGo(record)) els.verdictIndicator.classList.add("strong-go");
        els.verdictIndicator.textContent = `Verdict: ${verdictText}`;
    }

    function clearPriceScale() {
        els.buyZone.style.left = "0%";
        els.buyZone.style.width = "0%";
        els.cautionZone.style.left = "0%";
        els.cautionZone.style.width = "0%";
        els.sellZone.style.left = "0%";
        els.sellZone.style.width = "100%";
        els.buyBand.style.left = "0%";
        els.buyBand.style.width = "0%";
        els.sellBand.style.left = "0%";
        els.sellBand.style.width = "0%";
        els.priceGuides.innerHTML = "";
        els.priceMarkers.innerHTML = "";
        els.priceLegend.innerHTML = "";
    }

    function renderPriceScale(record) {
        const targetSale = [record.maxBuy, record.estimatedCosts, record.profit].every((value) => value != null)
            ? record.maxBuy + record.estimatedCosts + record.profit
            : null;
        const percentBase = valueOr(record.newEstimate, valueOr(record.listPrice, null));
        const points = [
            { label: "Opening", value: record.openingOffer, tone: "var(--buy-red)" },
            { label: "Max Buy", value: record.maxBuy, tone: "var(--buy-red)" },
            { label: "Ask", value: record.ask, tone: "var(--amber)" },
            { label: "Accept", value: record.acceptPrice, tone: "var(--sale-blue)" },
            { label: "List", value: record.listPrice, tone: "var(--sale-blue)" },
            { label: "New Est", value: record.newEstimate, tone: "var(--sale-blue)" },
            { label: "Costs", value: record.estimatedCosts, tone: "var(--steel)" },
            { label: "Profit Target", value: targetSale, tone: "var(--profit-green)" }
        ].filter((point) => point.value != null && !Number.isNaN(point.value));

        if (!points.length) {
            clearPriceScale();
            return;
        }

        const maxima = points.map((point) => point.value);
        const scaleMax = getScaleMax(maxima, percentBase);
        const buyEnd = clamp(0, valueOr(record.maxBuy, scaleMax * 0.35), scaleMax);
        const cautionEnd = clamp(buyEnd, valueOr(record.acceptPrice, scaleMax * 0.68), scaleMax);

        setSpan(els.buyZone, 0, buyEnd, scaleMax);
        setSpan(els.cautionZone, buyEnd, cautionEnd, scaleMax);
        setSpan(els.sellZone, cautionEnd, scaleMax, scaleMax);
        setSpan(els.buyBand, valueOr(record.openingOffer, buyEnd * 0.65), buyEnd, scaleMax);
        setSpan(els.sellBand, valueOr(record.acceptPrice, cautionEnd), valueOr(record.listPrice, scaleMax), scaleMax);
        renderGuides(scaleMax, valueOr(percentBase, scaleMax));

        els.priceMarkers.innerHTML = points.map((point, index) => {
            const position = pctPos(point.value, scaleMax);
            return `
                <div class="price-marker" style="--x:${position}%;--row:${index % 3};--tone:${point.tone}">
                    <span class="price-dot"></span>
                    <span class="price-chip">${escapeHtml(point.label)} ${escapeHtml(money(point.value))}</span>
                </div>
            `;
        }).join("");

        els.priceLegend.innerHTML = [
            `<span class="legend-item">Buy Zone: 0 to ${escapeHtml(money(buyEnd))}</span>`,
            `<span class="legend-item">Sell Zone: ${escapeHtml(money(cautionEnd))} to ${escapeHtml(money(scaleMax))}</span>`,
            `<span class="legend-item">Target Profit: ${escapeHtml(money(record.profit))}</span>`
        ].join("");
    }

    function renderGuides(scaleMax, percentBase) {
        const guidePercents = [25, 50, 60, 75, 90, 100];
        const base = Number.isFinite(percentBase) && percentBase > 0 ? percentBase : scaleMax;
        els.priceGuides.innerHTML = guidePercents.map((percent) => {
            const x = clamp(0, (base * (percent / 100)), scaleMax);
            const cls = percent === 100 ? "price-guide price-guide-100" : "price-guide";
            return `
                <div class="${cls}" style="--x:${pctPos(x, scaleMax)}%;" aria-hidden="true"></div>
            `;
        }).join("");
    }

    function getScaleMax(maxima, percentBase) {
        const selected = String(els.scaleMax.value || "1000");
        if (selected === "auto") return autoScaleMax(maxima, percentBase);
        const numeric = Number(selected);
        if (!Number.isFinite(numeric) || numeric <= 0) return 1000;
        return numeric;
    }

    function autoScaleMax(values, percentBase) {
        if (Number.isFinite(percentBase) && percentBase > 0) {
            return percentBase;
        }
        const peak = Math.max(1, ...(values || [1]));
        if (peak <= 100) return 100;
        if (peak <= 500) return 500;
        if (peak <= 1000) return 1000;
        if (peak <= 2000) return 2000;
        if (peak <= 5000) return 5000;
        return Math.ceil(peak / 1000) * 1000;
    }

    function setSpan(element, start, end, max) {
        const from = pctPos(clamp(0, start, max), max);
        const to = pctPos(clamp(0, end, max), max);
        const width = Math.max(0, to - from);
        element.style.left = `${from}%`;
        element.style.width = `${width}%`;
    }

    function pctPos(value, max) {
        if (max <= 0) return 0;
        return (value / max) * 100;
    }

    function valueOr(value, fallback) {
        return value == null || Number.isNaN(value) ? fallback : value;
    }

    function clamp(min, value, max) {
        return Math.min(max, Math.max(min, value));
    }

    function sellDays(values) {
        const min = getAny(values, ["Sell Days Min"]);
        const max = getAny(values, ["Sell Days Max"]);
        if (min && max) return `${min}-${max} days`;
        return getAny(values, ["Est. Days to Sell"]);
    }

    function section(title, values, keys, open) {
        const fields = keys.filter((key) => headers.includes(key)).map((key) => field(key, get(values, key))).join("");
        return `<details ${open ? "open" : ""}><summary>${escapeHtml(title)}</summary><div class="field-grid">${fields}</div></details>`;
    }

    function allColumns(values) {
        return `<details><summary>All Columns</summary><div class="field-grid">${headers.map((header) => field(header, get(values, header))).join("")}</div></details>`;
    }

    function field(label, value) {
        const text = safeText(value);
        const rendered = /^https?:\/\//i.test(text)
            ? `<a href="${escapeAttr(text)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
            : escapeHtml(text);
        return `<div class="field"><span class="field-label">${escapeHtml(label)}</span><div class="field-value">${rendered}</div></div>`;
    }

    function confidenceScore(value) {
        const lower = String(value || "").toLowerCase();
        if (lower.includes("high")) return 88;
        if (lower.includes("medium")) return 58;
        if (lower.includes("low")) return 28;
        return 42;
    }

    function confidenceTone(value) {
        const score = confidenceScore(value);
        if (score >= 80) return "var(--hud)";
        if (score >= 50) return "var(--amber)";
        return "var(--danger)";
    }

    function moveSelection(direction) {
        if (!state.filtered.length) return;
        const current = state.filtered.findIndex((record) => record.id === state.selectedId);
        const next = (current + direction + state.filtered.length) % state.filtered.length;
        state.selectedId = state.filtered[next].id;
        render();
    }

    function selectedRecord() {
        return state.filtered.find((item) => item.id === state.selectedId) || records.find((item) => item.id === state.selectedId) || null;
    }

    function numFromInput(element) {
        const numeric = Number(element?.value || 0);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function setInputValue(element, value) {
        if (!element || value == null || Number.isNaN(value)) return;
        element.value = String(Math.round(value));
    }

    function personalUseFit(category) {
        const lower = String(category || "").toLowerCase();
        if (/solar|power|battery|charger|generator|inverter|camp|emergency/.test(lower)) return "Possible personal use";
        if (/kayak|paddle|sup|board/.test(lower)) return "Resale only";
        if (/car|vehicle|cadillac|auto/.test(lower)) return "Unload / not a flip";
        return "Review";
    }

    function storagePenalty(storage) {
        const lower = String(storage || "").toLowerCase();
        if (lower.includes("very")) return 0.16;
        if (lower.includes("high")) return 0.1;
        if (lower.includes("medium")) return 0.05;
        return 0;
    }

    function analyzeCockpitCandidate() {
        if (!els.cockpitRecommendation) return;
        const sellerAsk = numFromInput(els.cockpitSellerAsk);
        const retail = numFromInput(els.cockpitRetail);
        const usedLow = numFromInput(els.cockpitUsedLow);
        const usedMedian = numFromInput(els.cockpitUsedMedian);
        const usedHigh = numFromInput(els.cockpitUsedHigh);
        const condition = Math.max(1, Math.min(10, numFromInput(els.cockpitCondition) || 7));
        const category = els.cockpitCategory.value;
        const storage = els.cockpitStorage.value;
        const compAnchor = usedMedian || usedHigh || usedLow || retail * 0.65 || sellerAsk;
        const conditionFactor = 0.82 + ((condition - 5) * 0.035);
        const burden = storagePenalty(storage);
        const bestAsk = Math.max(0, compAnchor * conditionFactor * (1 - burden));
        const acceptFloor = Math.max(0, Math.min(bestAsk * 0.82, usedLow || bestAsk * 0.82));
        const quickSale = Math.max(0, acceptFloor * 0.92);
        const targetCosts = Math.max(10, bestAsk * 0.08);
        const targetProfit = Math.max(35, bestAsk * 0.28);
        const maxPay = Math.max(0, acceptFloor - targetCosts - targetProfit);
        const expectedProfit = Math.max(0, acceptFloor - sellerAsk - targetCosts);
        const roi = sellerAsk > 0 ? (expectedProfit / sellerAsk) * 100 : 0;
        const spread = sellerAsk > 0 ? (maxPay - sellerAsk) / sellerAsk : 0;
        let verdict = "PASS";
        if (sellerAsk <= maxPay && roi >= 45) verdict = "BUY";
        else if (sellerAsk <= maxPay * 1.12 && roi >= 25) verdict = "MAYBE / NEGOTIATE";
        else if (personalUseFit(category).includes("Possible")) verdict = "PERSONAL USE ONLY UNLESS CHEAPER";

        const confidence = [usedLow, usedMedian, usedHigh, retail].filter((value) => value > 0).length;
        const notes = [];
        if (sellerAsk > maxPay) notes.push(`Seller ask is ${money(sellerAsk - maxPay)} above target max pay.`);
        if (storagePenalty(storage) >= 0.1) notes.push("Bulky storage burden: require a bigger margin or faster sale.");
        if (retail && bestAsk > retail * 0.9) notes.push("Used asking estimate is close to new retail; verify comps before buying.");
        if (personalUseFit(category).includes("Unload")) notes.push("Treat as unload/personal asset, not flip-profit inventory.");
        notes.push(`Quick-sale target: ${money(quickSale)}.`);

        els.cockpitRecommendation.textContent = verdict;
        els.cockpitMaxPay.textContent = money(maxPay);
        els.cockpitBestAsk.textContent = money(bestAsk);
        els.cockpitAcceptFloor.textContent = money(acceptFloor);
        els.cockpitProfit.textContent = money(expectedProfit);
        els.cockpitRoi.textContent = `ROI ${pct(roi)}`;
        els.cockpitConfidence.textContent = `Confidence ${confidence >= 3 ? "Medium/High" : "Low"}`;
        els.cockpitPersonalFit.textContent = `Personal fit ${personalUseFit(category)}`;
        els.cockpitRiskNotes.innerHTML = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
    }

    function loadSelectedRecordIntoCockpit() {
        const record = selectedRecord();
        if (!record) return;
        els.cockpitItemName.value = record.title || "";
        els.cockpitCategory.value = getAny(record.values, ["Category", "Type"]) || "Review";
        setInputValue(els.cockpitSellerAsk, record.ask);
        setInputValue(els.cockpitRetail, record.newEstimate || record.listPrice);
        setInputValue(els.cockpitUsedMedian, record.acceptPrice || record.listPrice || record.ask);
        setInputValue(els.cockpitUsedLow, record.maxBuy || record.openingOffer);
        setInputValue(els.cockpitUsedHigh, record.newEstimate || record.listPrice || record.ask);
        const condition = getAny(record.values, ["Condition Stated", "Condition", "Condition From Photos"]);
        els.cockpitCondition.value = /new/i.test(condition) ? "9" : /fair|parts|repair/i.test(condition) ? "5" : "7";
        analyzeCockpitCandidate();
    }

    function cockpitPrompt() {
        return [
            "Evaluate this local flipping opportunity from the attached screenshot/photo/PDF.",
            `Item/OCR note: ${els.cockpitItemName.value}`,
            `Category: ${els.cockpitCategory.value}`,
            `Seller ask: $${els.cockpitSellerAsk.value}`,
            `New retail: $${els.cockpitRetail.value}`,
            `Used comps low/median/high: $${els.cockpitUsedLow.value} / $${els.cockpitUsedMedian.value} / $${els.cockpitUsedHigh.value}`,
            `Condition score: ${els.cockpitCondition.value}/10`,
            `Storage burden: ${els.cockpitStorage.value}`,
            "Return: item identification, risks/missing parts, local demand, suggested max pay, opening offer, best asking price, lowest acceptable sale price, quick-sale price, expected profit, ROI, confidence, and Buy/Pass/Maybe recommendation. Exclude personal/unload items from flip-profit metrics."
        ].join("\n");
    }

    function handleCockpitFile() {
        const file = els.cockpitFile.files && els.cockpitFile.files[0];
        if (!file) return;
        els.cockpitFileLabel.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
        if (file.type.startsWith("image/")) {
            els.cockpitPreview.src = URL.createObjectURL(file);
            els.cockpitPreview.hidden = false;
        } else {
            els.cockpitPreview.hidden = true;
            els.cockpitFileLabel.textContent += " · PDF ready for future extraction";
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function bindEvents() {
        [els.search, els.location, els.verdict, els.kpi, els.sort].forEach((el) => {
            el.addEventListener("input", applyFilters);
            el.addEventListener("change", applyFilters);
        });
        els.scaleMax.addEventListener("change", () => {
            try {
                localStorage.setItem(SCALE_MAX_STORAGE_KEY, els.scaleMax.value);
            } catch (_e) {
                // Ignore storage failures
            }
            renderDetail();
        });
        els.reset.addEventListener("click", () => {
            els.search.value = "";
            els.location.value = "all";
            els.verdict.value = "all";
            els.kpi.value = "all";
            els.sort.value = "roi-desc";
            applyFilters();
        });
        els.prev.addEventListener("click", () => moveSelection(-1));
        els.next.addEventListener("click", () => moveSelection(1));
        els.list.addEventListener("click", (event) => {
            const button = event.target.closest(".record-item");
            if (!button) return;
            state.selectedId = Number(button.dataset.id);
            render();
        });
        [
            els.cockpitItemName,
            els.cockpitCategory,
            els.cockpitSellerAsk,
            els.cockpitRetail,
            els.cockpitUsedLow,
            els.cockpitUsedMedian,
            els.cockpitUsedHigh,
            els.cockpitCondition,
            els.cockpitStorage
        ].filter(Boolean).forEach((el) => {
            el.addEventListener("input", analyzeCockpitCandidate);
            el.addEventListener("change", analyzeCockpitCandidate);
        });
        els.useSelectedRecord?.addEventListener("click", loadSelectedRecordIntoCockpit);
        els.cockpitFile?.addEventListener("change", handleCockpitFile);
        els.copyCockpitPrompt?.addEventListener("click", async () => {
            const text = cockpitPrompt();
            try {
                await navigator.clipboard.writeText(text);
                els.copyCockpitPrompt.textContent = "Prompt Copied";
                setTimeout(() => { els.copyCockpitPrompt.textContent = "Copy AI Prompt"; }, 1400);
            } catch (_e) {
                window.prompt("Copy this AI prompt", text);
            }
        });
    }

    try {
        const savedScale = localStorage.getItem(SCALE_MAX_STORAGE_KEY);
        if (savedScale && Array.from(els.scaleMax.options).some((opt) => opt.value === savedScale)) {
            els.scaleMax.value = savedScale;
        }
    } catch (_e) {
        // Ignore storage failures
    }

    buildFilters();
    bindEvents();
    applyFilters();
    analyzeCockpitCandidate();
})();
