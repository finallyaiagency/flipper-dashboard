/**
 * Flipper Dashboard — Daily Scan Feed UI
 * Renders scan results with price comparison, ROI, and discard functionality.
 */
(function () {
    'use strict';

    const CATEGORIES = ['All', 'Kayak', 'Power Station', 'Solar Panel', 'SUP', 'Trailer', 'Other'];
    const VERDICTS = ['All', 'STRONG GO', 'GO', 'POSSIBLE', 'NO-GO'];

    let currentCategory = 'All';
    let currentVerdict = 'All';
    let currentSort = 'roi-desc';
    let showDiscarded = false;
    let allListings = [];

    const els = {};

    function init() {
        const section = document.getElementById('scan-feed-section');
        if (!section) return;
        section.innerHTML = buildHTML();
        cacheEls();
        bindEvents();
        loadData();
    }

    function buildHTML() {
        return `
            <div class="scan-feed-header">
                <h2>Daily Scan Feed</h2>
                <div class="scan-stats" id="scan-stats"></div>
            </div>
            <div class="scan-filters">
                <label>
                    <span>Category</span>
                    <select id="scan-category-filter">
                        ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </label>
                <label>
                    <span>Verdict</span>
                    <select id="scan-verdict-filter">
                        ${VERDICTS.map((v) => `<option value="${v}">${v}</option>`).join('')}
                    </select>
                </label>
                <label>
                    <span>Sort</span>
                    <select id="scan-sort">
                        <option value="roi-desc">ROI: High to Low</option>
                        <option value="roi-asc">ROI: Low to High</option>
                        <option value="percent-desc">% of New: High to Low</option>
                        <option value="percent-asc">% of New: Low to High</option>
                        <option value="ask-asc">Ask: Low to High</option>
                        <option value="ask-desc">Ask: High to Low</option>
                        <option value="date-desc">Newest First</option>
                    </select>
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding-top:24px;">
                    <input type="checkbox" id="scan-show-discarded" style="width:auto;">
                    <span style="color:var(--muted);font-size:0.72rem;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;">Show Discarded</span>
                </label>
                <button class="reset-btn" id="scan-refresh-btn" type="button" style="height:38px;padding:0 14px;">Refresh</button>
            </div>
            <div class="scan-grid" id="scan-grid"></div>
        `;
    }

    function cacheEls() {
        els.stats = document.getElementById('scan-stats');
        els.category = document.getElementById('scan-category-filter');
        els.verdict = document.getElementById('scan-verdict-filter');
        els.sort = document.getElementById('scan-sort');
        els.showDiscarded = document.getElementById('scan-show-discarded');
        els.refresh = document.getElementById('scan-refresh-btn');
        els.grid = document.getElementById('scan-grid');
    }

    function bindEvents() {
        els.category.addEventListener('change', (e) => { currentCategory = e.target.value; render(); });
        els.verdict.addEventListener('change', (e) => { currentVerdict = e.target.value; render(); });
        els.sort.addEventListener('change', (e) => { currentSort = e.target.value; render(); });
        els.showDiscarded.addEventListener('change', (e) => { showDiscarded = e.target.checked; loadData(); });
        els.refresh.addEventListener('click', loadData);
        els.grid.addEventListener('click', handleGridClick);
    }

    async function loadData() {
        try {
            allListings = await window.ScanDB.getListings({ includeDiscarded: showDiscarded });
            // First-run demo: populate with sample data if empty
            if (!allListings.length) {
                await loadSampleData();
                allListings = await window.ScanDB.getListings({ includeDiscarded: showDiscarded });
            }
            render();
        } catch (err) {
            console.error('Failed to load scan data:', err);
            els.grid.innerHTML = '<div class="scan-empty"><p>Failed to load scan data.</p></div>';
        }
    }

    async function loadSampleData() {
        try {
            const res = await fetch('scan-results.json?v=20260907-1', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.listings && data.listings.length) {
                await window.ScanDB.saveScan(data);
                await window.ScanDB.setLastScanTime(new Date().toISOString());
            }
        } catch (err) {
            console.warn('Sample data load failed:', err);
        }
    }

    function render() {
        renderStats();
        renderGrid();
    }

    function renderStats() {
        const active = allListings.filter((l) => !l.discarded);
        const goCount = active.filter((l) => l.verdict === 'GO' || l.verdict === 'STRONG GO').length;
        const avgRoi = active.length ? Math.round(active.reduce((s, l) => s + (l.roi || 0), 0) / active.length) : 0;
        const avgPercent = active.length ? Math.round(active.reduce((s, l) => s + (l.percentOfNew || 0), 0) / active.length) : 0;

        els.stats.innerHTML = `
            <div class="scan-stat"><span>Active</span><strong>${active.length}</strong></div>
            <div class="scan-stat"><span>GO</span><strong>${goCount}</strong></div>
            <div class="scan-stat"><span>Avg ROI</span><strong>${avgRoi}%</strong></div>
            <div class="scan-stat"><span>Avg % New</span><strong>${avgPercent}%</strong></div>
            ${showDiscarded ? `<div class="scan-stat"><span>Discarded</span><strong>${allListings.filter(l=>l.discarded).length}</strong></div>` : ''}
        `;
    }

    function renderGrid() {
        let filtered = allListings.filter((l) => {
            if (!showDiscarded && l.discarded) return false;
            if (currentCategory !== 'All' && l.category !== currentCategory) return false;
            if (currentVerdict !== 'All' && l.verdict !== currentVerdict) return false;
            return true;
        });

        filtered.sort(sorter(currentSort));

        if (!filtered.length) {
            els.grid.innerHTML = `
                <div class="scan-empty">
                    <div class="scan-empty-icon">📭</div>
                    <h3>No listings match these filters</h3>
                    <p>Try adjusting filters or wait for the next scan.</p>
                </div>
            `;
            return;
        }

        els.grid.innerHTML = filtered.map((listing) => renderCard(listing)).join('');
    }

    function renderCard(listing) {
        const pctOfNew = listing.percentOfNew || (listing.newPrice ? Math.round((listing.askingPrice / listing.newPrice) * 100) : 0);
        const roiClass = listing.roi >= 60 ? 'high' : listing.roi >= 30 ? 'medium' : 'low';
        const verdictClass = listing.verdict === 'STRONG GO' ? 'strong-go' : listing.verdict === 'GO' ? 'go' : listing.verdict === 'POSSIBLE' ? 'possible' : 'no-go';
        const imgHtml = listing.imageUrl
            ? `<img class="scan-card-image" src="${escapeAttr(listing.imageUrl)}" alt="${escapeAttr(listing.title)}" loading="lazy">`
            : `<div class="scan-card-image placeholder">No Image</div>`;

        const discardBtn = listing.discarded
            ? `<button class="btn-undo" data-action="undiscard" data-id="${listing.id}">Undo</button>`
            : `<button class="btn-discard" data-action="discard" data-id="${listing.id}">Discard</button>`;

        const viewBtn = listing.url
            ? `<button class="btn-view" data-action="view" data-url="${escapeAttr(listing.url)}">View Ad</button>`
            : '';

        return `
            <article class="scan-card ${listing.discarded ? 'discarded' : ''}" data-id="${listing.id}">
                <div class="scan-card-top">
                    <span class="scan-card-title">${escapeHtml(listing.title)}</span>
                    <span class="scan-card-category">${escapeHtml(listing.category || 'Other')}</span>
                </div>
                ${imgHtml}
                <div class="scan-price-bar">
                    <div class="scan-price-item ask">
                        <span>Ask</span>
                        <strong>$${listing.askingPrice ? listing.askingPrice.toLocaleString() : '-'}</strong>
                    </div>
                    <div class="scan-price-item new">
                        <span>New</span>
                        <strong>$${listing.newPrice ? listing.newPrice.toLocaleString() : '-'}</strong>
                    </div>
                    <div class="scan-price-item percent">
                        <span>% of New</span>
                        <strong>${pctOfNew}%</strong>
                    </div>
                </div>
                <div class="scan-roi-row">
                    <span class="scan-roi-label">Est. ROI</span>
                    <span class="scan-roi-value ${roiClass}">${listing.roi ? listing.roi + '%' : '-'}</span>
                </div>
                <div class="scan-verdict-row">
                    <span class="scan-verdict ${verdictClass}">${listing.verdict || '—'}</span>
                    ${listing.daysToSell ? `<span style="color:var(--muted);font-size:0.72rem;">~${listing.daysToSell}d sell</span>` : ''}
                </div>
                <div class="scan-card-actions">
                    ${viewBtn}
                    ${discardBtn}
                </div>
            </article>
        `;
    }

    function handleGridClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id, 10);

        if (action === 'discard') {
            if (confirm('Discard this listing? Future scans will skip it.')) {
                window.ScanDB.discardListing(id).then(() => loadData());
            }
        } else if (action === 'undiscard') {
            window.ScanDB.undiscardListing(id).then(() => loadData());
        } else if (action === 'view') {
            window.open(btn.dataset.url, '_blank', 'noopener,noreferrer');
        }
    }

    function sorter(mode) {
        switch (mode) {
            case 'roi-desc': return (a, b) => (b.roi || 0) - (a.roi || 0);
            case 'roi-asc': return (a, b) => (a.roi || 0) - (b.roi || 0);
            case 'percent-desc': return (a, b) => (b.percentOfNew || 0) - (a.percentOfNew || 0);
            case 'percent-asc': return (a, b) => (a.percentOfNew || 0) - (b.percentOfNew || 0);
            case 'ask-asc': return (a, b) => (a.askingPrice || 0) - (b.askingPrice || 0);
            case 'ask-desc': return (a, b) => (b.askingPrice || 0) - (a.askingPrice || 0);
            case 'date-desc': return (a, b) => (b.addedAt || '').localeCompare(a.addedAt || '');
            default: return (a, b) => (b.roi || 0) - (a.roi || 0);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function escapeAttr(text) {
        return (text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
