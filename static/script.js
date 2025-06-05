const API_BASE_URL = '/api';

document.addEventListener('DOMContentLoaded', function() {
    const mainJournalTableBody = document.getElementById('events-table-body');
    const dashboardJournalTableBody = document.getElementById('dashboard-events-table-body');
    const errorLogCountElement = document.getElementById('error-log-count');
    const logIdentifiersChartCtx = document.getElementById('logIdentifiersChart')?.getContext('2d');
    const logsByPriorityChartCtx = document.getElementById('logsByPriorityChart')?.getContext('2d');
    const logsByPriorityLegendContainer = document.getElementById('logsByPriorityLegend');
    const bootListElement = document.getElementById('boot-list');
    const msgFilter = document.getElementById('journal-message-filter');
    const prioFilter = document.getElementById('journal-priority-filter');
    const idFilter = document.getElementById('journal-identifier-filter');
    const hostFilter = document.getElementById('journal-hostname-filter');
    const applyFiltersBtn = document.getElementById('journal-apply-filters-btn');
    const globalSearchInput = document.getElementById('global-journal-search');

    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageInfoSpan = document.getElementById('page-info');
    let currentPage = 1;
    let totalPages = 1;
    const logsPerPage = 20; // Sunucu tarafıyla senkronize olmalı

    function formatJournalTimestamp(epochSeconds) {
        if (!epochSeconds) return '-';
        try {
            const date = new Date(parseFloat(epochSeconds) * 1000); // saniyeden milisaniyeye
            return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' }); // Türkçe format
        } catch (e) {
            console.error("Timestamp format error:", e);
            return 'Invalid Date';
        }
    }

    function getPriorityTextAndClass(priority) {
        const p = parseInt(priority);
        switch (p) {
            case 0: return { text: 'EMERG', class: 'priority-0 priority-emerg', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-emerg-color').trim() };
            case 1: return { text: 'ALERT', class: 'priority-1 priority-alert', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-alert-color').trim() };
            case 2: return { text: 'CRIT', class: 'priority-2 priority-crit', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-crit-color').trim() };
            case 3: return { text: 'ERR', class: 'priority-3 priority-err', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-err-color').trim() };
            case 4: return { text: 'WARNING', class: 'priority-4 priority-warning', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-warning-color').trim() };
            case 5: return { text: 'NOTICE', class: 'priority-5 priority-notice', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-notice-color').trim() };
            case 6: return { text: 'INFO', class: 'priority-6 priority-info', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-info-color').trim() };
            case 7: return { text: 'DEBUG', class: 'priority-7 priority-debug', color: getComputedStyle(document.documentElement).getPropertyValue('--priority-debug-color').trim() };
            default: return { text: `P${priority}`, class: '', color: '#cccccc' };
        }
    }

    async function fetchAndPopulateJournalTable(page = 1, filters = {}) {
        if (!mainJournalTableBody) return;

        let queryParams = new URLSearchParams({
            page: page,
            per_page: logsPerPage,
            ...filters 
        });

        try {
            const response = await fetch(`${API_BASE_URL}/logs?${queryParams.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            mainJournalTableBody.innerHTML = ''; // Tabloyu temizle
            if (data.logs && data.logs.length > 0) {
                data.logs.forEach(entry => {
                    const row = mainJournalTableBody.insertRow();
                    const priorityInfo = getPriorityTextAndClass(entry.priority);
                    const message = entry.message || '-';
                    const identifier = entry.syslog_identifier || entry._COMM || entry._SYSTEMD_UNIT || '-';

                    row.innerHTML = `
                        <td>${formatJournalTimestamp(entry.timestamp)}</td>
                        <td>${entry.hostname || '-'}</td>
                        <td class="${priorityInfo.class}">${priorityInfo.text}</td>
                        <td>${identifier}</td>
                        <td>${entry.pid || '-'}</td>
                        <td class="message-col">${message}</td>
                        <td>${entry.transport || '-'}</td>
                        <td><button class="action-btn" data-log-id="${entry.id}"><i class="fas fa-search-plus"></i> View</button></td>
                    `;
                    row.querySelector('.action-btn').addEventListener('click', function() {
                        showLogDetails(entry); // Detay gösterme fonksiyonu
                    });
                });
            } else {
                mainJournalTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No logs found.</td></tr>';
            }

            // Sayfalama bilgisini güncelle
            currentPage = data.page;
            totalPages = data.total_pages;
            if (pageInfoSpan) pageInfoSpan.textContent = `Page ${currentPage} / ${totalPages}`;
            if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
            if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;

        } catch (error) {
            console.error('Error fetching logs:', error);
            if (mainJournalTableBody) mainJournalTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Error loading logs.</td></tr>';
        }
    }
    // --- Detay Gösterme Fonksiyonu (Modal) ---
    function showLogDetails(logEntry) {
        // Basit bir modal oluşturma
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.zIndex = '1000';

        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'var(--secondary-bg)';
        modalContent.style.padding = '30px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.maxWidth = '80%';
        modalContent.style.maxHeight = '80%';
        modalContent.style.overflowY = 'auto';
        modalContent.style.color = 'var(--text-primary)';
        modalContent.style.border = '1px solid var(--border-color)';

        let detailsHtml = `<h2>Log Details (ID: ${logEntry.id})</h2>`;
        for (const key in logEntry) {
            if (logEntry.hasOwnProperty(key)) {
                let value = logEntry[key];
                if (key === "timestamp") {
                    value = formatJournalTimestamp(value) + ` (${value})`;
                } else if (key === "raw_log" && typeof value === 'string' && value.length > 300) {
                    value = `<pre style="white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; background-color: var(--primary-bg); padding: 5px; border-radius: 4px;">${value.substring(0,300)}...</pre> <button onclick="this.previousElementSibling.innerHTML='${escapeHtml(value)}'; this.remove();">Show Full Raw Log</button>`;
                } else if (typeof value === 'object' && value !== null) {
                    value = `<pre style="white-space: pre-wrap; word-break: break-all;">${JSON.stringify(value, null, 2)}</pre>`;
                }
                detailsHtml += `<p><strong>${key.toUpperCase()}:</strong> ${value === null || value === undefined ? '-' : value}</p>`;
            }
        }

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.marginTop = '20px';
        closeButton.style.padding = '10px 15px';
        closeButton.style.backgroundColor = 'var(--accent-color)';
        closeButton.style.color = 'white';
        closeButton.style.border = 'none';
        closeButton.style.borderRadius = '5px';
        closeButton.style.cursor = 'pointer';

        modalContent.innerHTML = detailsHtml;
        modalContent.appendChild(closeButton);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        closeButton.onclick = () => document.body.removeChild(modalOverlay);
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) { // Sadece overlay'e tıklanınca kapat
                document.body.removeChild(modalOverlay);
            }
        };
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/'/g, "'");
    }


    function jsStringEscape(string) {
    if (typeof string !== 'string') return string;
    return string.replace(/[`"'\\]/g, '\\$&') 
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/\u2028/g, '\\u2028') 
                .replace(/\u2029/g, '\\u2029');
    }

    async function updateDashboardWidgets() {
        try {
            const response = await fetch(`${API_BASE_URL}/dashboard-data`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            if (errorLogCountElement) {
                errorLogCountElement.textContent = data.error_log_count !== undefined ? data.error_log_count : 'N/A';
            }

            // Top Log Identifiers Chart
            if (logIdentifiersChartCtx && data.log_identifiers) {
                const identifiers = data.log_identifiers.map(item => item.identifier);
                const counts = data.log_identifiers.map(item => item.count);
                if (window.logIdentifiersChartInstance) window.logIdentifiersChartInstance.destroy();
                window.logIdentifiersChartInstance = new Chart(logIdentifiersChartCtx, {
                    type: 'bar',
                    data: { labels: identifiers, datasets: [{ label: 'Log Count', data: counts, backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: false } } }
                });
            }

            // Logs by Priority Chart
            if (logsByPriorityChartCtx && logsByPriorityLegendContainer && data.logs_by_priority) {
                const priorityLabels = data.logs_by_priority.map(p => getPriorityTextAndClass(p.priority).text);
                const priorityCounts = data.logs_by_priority.map(p => p.count);
                const priorityColors = data.logs_by_priority.map(p => getPriorityTextAndClass(p.priority).color);

                if (window.logsByPriorityChartInstance) window.logsByPriorityChartInstance.destroy();
                window.logsByPriorityChartInstance = new Chart(logsByPriorityChartCtx, {
                    type: 'doughnut',
                    data: { labels: priorityLabels, datasets: [{ data: priorityCounts, backgroundColor: priorityColors, borderColor: 'var(--secondary-bg)', borderWidth: 2 }] },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}` } } } }
                });

                logsByPriorityLegendContainer.innerHTML = '';
                data.logs_by_priority.forEach(pData => {
                    const pInfo = getPriorityTextAndClass(pData.priority);
                    const legendItem = document.createElement('div'); legendItem.className = 'legend-item';
                    const colorBox = document.createElement('div'); colorBox.className = 'legend-color-box';
                    colorBox.style.backgroundColor = pInfo.color;
                    const text = document.createElement('span'); text.className = 'legend-text'; text.textContent = `${pInfo.text} (${pData.count})`;
                    legendItem.appendChild(colorBox); legendItem.appendChild(text);
                    logsByPriorityLegendContainer.appendChild(legendItem);
                });
            }

            // Recent System Boots
            if (bootListElement && data.recent_boots) {
                bootListElement.innerHTML = '';
                if (data.recent_boots.length > 0) {
                    data.recent_boots.forEach(boot => {
                        const li = document.createElement('li');
                        li.textContent = `Boot ID: ${boot.boot_id} (since ${formatJournalTimestamp(boot.timestamp)})`;
                        bootListElement.appendChild(li);
                    });
                } else {
                    bootListElement.innerHTML = '<li>No boot data with _BOOT_ID found.</li>';
                }
            }

            // Dashboard Recent Logs (Sunucudan zaten geliyor, burada tekrar fetch etmeye gerek yok)
            // Eğer ayrı bir endpoint'ten alınacaksa:
            const dashboardLogsResponse = await fetch(`${API_BASE_URL}/logs?page=1&per_page=5`); // İlk 5 log
            if (!dashboardLogsResponse.ok) throw new Error(`HTTP error! status: ${dashboardLogsResponse.status}`);
            const dashboardLogData = await dashboardLogsResponse.json();

            if (dashboardJournalTableBody && dashboardLogData.logs) {
                 dashboardJournalTableBody.innerHTML = '';
                 dashboardLogData.logs.forEach(entry => {
                    const row = dashboardJournalTableBody.insertRow();
                    const priorityInfo = getPriorityTextAndClass(entry.priority);
                    const message = entry.message || '-';
                    const messageSnippet = message.length > 70 ? message.substring(0, 67) + "..." : message;
                    const identifier = entry.syslog_identifier || entry._COMM || entry._SYSTEMD_UNIT || '-';

                    row.innerHTML = `
                        <td>${formatJournalTimestamp(entry.timestamp)}</td>
                        <td>${entry.hostname || '-'}</td>
                        <td class="${priorityInfo.class}">${priorityInfo.text}</td>
                        <td>${identifier}</td>
                        <td class="message-col">${messageSnippet}</td>
                        <td><button class="action-btn" data-log-id="${entry.id}"><i class="fas fa-search-plus"></i> View</button></td>
                    `;
                     row.querySelector('.action-btn').addEventListener('click', function() {
                        showLogDetails(entry);
                    });
                });
            }


        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        }
    }

    // --- Event Listeners ---
    // Filtre butonu
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            const filters = {
                message: msgFilter.value,
                priority: prioFilter.value,
                identifier: idFilter.value,
                hostname: hostFilter.value,
                global_search: '' // Filtreleme için global search'ü boş bırak
            };
            currentPage = 1; // Filtre uygulandığında ilk sayfaya dön
            fetchAndPopulateJournalTable(currentPage, filters);
        });
    }

    // Global Arama
    if (globalSearchInput) {
        globalSearchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const searchTerm = globalSearchInput.value.trim();
                 const filters = { global_search: searchTerm };
                currentPage = 1;
                fetchAndPopulateJournalTable(currentPage, filters);
                navigateToSection('events'); // Arama yapıldığında loglar sayfasına git
            }
        });
    }

    // Sayfalama butonları
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                const currentFilters = getCurrentFilters();
                fetchAndPopulateJournalTable(currentPage - 1, currentFilters);
            }
        });
    }
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                const currentFilters = getCurrentFilters();
                fetchAndPopulateJournalTable(currentPage + 1, currentFilters);
            }
        });
    }

    function getCurrentFilters() {
        // Global search aktifse, diğer filtreleri yok sayabiliriz veya birleştirebiliriz.
        // Şimdilik, global search aktifse sadece onu, değilse diğerlerini alalım.
        const globalSearchTerm = globalSearchInput.value.trim();
        if (globalSearchTerm) {
            return { global_search: globalSearchTerm };
        }
        return {
            message: msgFilter ? msgFilter.value : '',
            priority: prioFilter ? prioFilter.value : '',
            identifier: idFilter ? idFilter.value : '',
            hostname: hostFilter ? hostFilter.value : ''
        };
    }

    // --- Sayfa Yüklendiğinde İlk Verileri Yükle ---
    if (document.getElementById('dashboard')) { // Sadece dashboard görünürse
        updateDashboardWidgets(); // Dashboard widget'larını ve grafiklerini güncelle
    }
    if (document.getElementById('events')) { // Sadece eventler sayfası için veya ilk yüklemede
        fetchAndPopulateJournalTable(currentPage, getCurrentFilters()); // Ana log tablosunu ilk sayfayla doldur
    }


    // Sidebar navigasyonu (mevcut kodunuzdan)
    const sidebarLinks = document.querySelectorAll('.sidebar ul li');
    const contentSections = document.querySelectorAll('.content-section');

    function navigateToSection(targetId) {
        sidebarLinks.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.target === targetId) {
                item.classList.add('active');
            }
        });
        contentSections.forEach(section => {
            if (section.id === targetId) {
                section.classList.add('active-section');
                // Eğer hedef section 'events' ise logları yeniden yükle
                if (targetId === 'events') {
                    fetchAndPopulateJournalTable(1, getCurrentFilters());
                } else if (targetId === 'dashboard') {
                    updateDashboardWidgets();
                }
            } else {
                section.classList.remove('active-section');
            }
        });
         // Aktif bölüm değiştiğinde sayfa başlığını da güncelleyebiliriz
        const activeLinkText = document.querySelector('.sidebar ul li.active a')?.textContent.trim() || 'PyLog';
        document.title = `PyLog - ${activeLinkText}`;
    }

    sidebarLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.dataset.target;
            navigateToSection(targetId);
        });
    });

    document.querySelectorAll('.interactive-widget[data-link-target]').forEach(widget => {
        widget.addEventListener('click', function() {
            const targetPageId = this.dataset.linkTarget;
            const filterPriorityValue = this.dataset.filterPriority; // Örn: "err"
            navigateToSection(targetPageId);

            if (targetPageId === 'events' && filterPriorityValue && prioFilter) {
                // filterPriorityValue'ya göre doğru option'ı bul (örn: "3 (err)")
                const targetOption = Array.from(prioFilter.options).find(opt => {
                    // `opt.text` "3 (err)" gibi, `filterPriorityValue` "err"
                    return opt.text.toLowerCase().includes(`(${filterPriorityValue.toLowerCase()})`);
                });
                if (targetOption) {
                    prioFilter.value = targetOption.value; // Option'ın value'sunu ayarla (örn: "3")
                } else {
                     prioFilter.value = ""; // Bulamazsa tüm öncelikler
                }
                if (applyFiltersBtn) applyFiltersBtn.click(); // Filtreleri uygula
            }
        });
    });

    const viewAllEventsLink = document.querySelector('.view-all-link[data-link-target="events"]');
    if (viewAllEventsLink) {
        viewAllEventsLink.addEventListener('click', function(e) {
            e.preventDefault();
            const targetPageId = this.dataset.linkTarget;
            navigateToSection(targetPageId);
        });
    }

     // Başlangıçta aktif olan bölümü yükle (URL'den veya varsayılan)
    const initialSection = new URLSearchParams(window.location.search).get('section') || 'dashboard';
    navigateToSection(initialSection);


    // TODO: Implement "View" button functionality for individual log details (e.g., show full log in a modal)
    // TODO: Implement Watchlist Alerts and Investigation page functionalities (server-side logic needed)
    // TODO: Implement Settings page functionalities (server-side logic needed)
});