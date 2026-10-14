(function () {
    const FALLBACK_PAYLOAD = window.FLIP_TRACKER_DATA || { headers: [], rows: [] };
    const SHEET_ID = "12TELzT2bzIxdry3pyLvSv3hdWJpkdvGC25aSlvsBq94";
    const INVENTORY_SHEET = "Inventory Register";
    const SALES_SHEET = "Sales Ledger";
    const KPI_SHEET = "KPI Export - Web Dashboard";
    const CACHE_KEY = "flip-tracker:last-good-payload:v3";
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