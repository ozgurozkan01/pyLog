document.addEventListener('DOMContentLoaded', function() {
    const sidebarLinks = document.querySelectorAll('.sidebar ul li');
    const contentSections = document.querySelectorAll('.content-section');
    const criticalAlertsCountElement = document.getElementById('critical-alerts-count');
    const errorLogCountElement = document.getElementById('error-log-count');
    const logIdentifiersChartCtx = document.getElementById('logIdentifiersChart')?.getContext('2d');
    const logsByPriorityChartCtx = document.getElementById('logsByPriorityChart')?.getContext('2d');
    const logsByPriorityLegendContainer = document.getElementById('logsByPriorityLegend');
    const bootListElement = document.getElementById('boot-list');

    const mainJournalTableBody = document.getElementById('events-table-body');
    const dashboardJournalTableBody = document.getElementById('dashboard-events-table-body');

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
            } else {
                section.classList.remove('active-section');
            }
        });
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
            const filterPriorityValue = this.dataset.filterPriority;
            navigateToSection(targetPageId);

            if (targetPageId === 'events' && filterPriorityValue && prioFilter) {
                const targetOption = Array.from(prioFilter.options).find(opt => {
                    return opt.text.toLowerCase().includes(`(${filterPriorityValue.toLowerCase()})`);
                });
                if (targetOption) {
                    prioFilter.value = targetOption.value;
                } else {
                     prioFilter.value = "";
                }
                if (applyFiltersBtn) applyFiltersBtn.click();
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

    const allSampleJournalEntries = [
        { "__CURSOR" : "s=aaa;i=bbb;b=ccc;m=ddd;t=eee;x=fff", "__REALTIME_TIMESTAMP": "1678886412123456", "_HOSTNAME": "server01", "PRIORITY": "3", "SYSLOG_IDENTIFIER": "sshd", "_PID": "12345", "MESSAGE": "Failed password for invalid user test_user from 192.168.1.100 port 2222 ssh2", "_TRANSPORT": "journal", "_SYSTEMD_UNIT": "sshd.service" },
        { "__CURSOR" : "s=111;i=222;b=333;m=444;t=555;x=666", "__REALTIME_TIMESTAMP": "1678886460987654", "_HOSTNAME": "server01", "PRIORITY": "6", "SYSLOG_IDENTIFIER": "kernel", "_PID": "0", "MESSAGE": "usb 1-1: new high-speed USB device number 2 using xhci_hcd", "_TRANSPORT": "kernel", "_BOOT_ID": "boot1" },
        { "__CURSOR" : "s=abc;i=def;b=ghi;m=jkl;t=mno;x=pqr", "__REALTIME_TIMESTAMP": "1678886475123000", "_HOSTNAME": "server02", "PRIORITY": "4", "SYSLOG_IDENTIFIER": "systemd", "_PID": "1", "MESSAGE": "Starting User Manager for UID 1000...", "_TRANSPORT": "journal", "_SYSTEMD_UNIT": "user@1000.service" },
        { "__CURSOR" : "s=def;i=ghi;b=jkl;m=mno;t=pqr;x=stu", "__REALTIME_TIMESTAMP": "1678886490500200", "_HOSTNAME": "server01", "PRIORITY": "2", "SYSLOG_IDENTIFIER": "kernel", "_PID": "0", "MESSAGE": "Out of memory: Kill process 1234 (oom_killer) score 900 or sacrifice child", "_TRANSPORT": "kernel", "_BOOT_ID": "boot1" },
        { "__CURSOR" : "s=ghi;i=jkl;b=mno;m=pqr;t=stu;x=vwx", "__REALTIME_TIMESTAMP": "1678886500000000", "_HOSTNAME": "server01", "PRIORITY": "3", "SYSLOG_IDENTIFIER": "my-app", "_PID": "5678", "MESSAGE": "Application specific error occurred: Database connection timeout. Check credentials and network.", "_TRANSPORT": "stdout" },
        { "__CURSOR" : "s=jkl;i=mno;b=pqr;m=stu;t=vwx;x=yza", "__REALTIME_TIMESTAMP": "1678886510000000", "_HOSTNAME": "server02", "PRIORITY": "5", "SYSLOG_IDENTIFIER": "cron", "_PID": "9999", "MESSAGE": "CMD (run-parts /etc/cron.hourly)", "_TRANSPORT": "journal", "_SYSTEMD_UNIT": "cron.service"},
        { "__CURSOR" : "s=mno;i=pqr;b=stu;m=vwx;t=yza;x=bcd", "__REALTIME_TIMESTAMP": "1678886520000000", "_HOSTNAME": "server01", "PRIORITY": "7", "SYSLOG_IDENTIFIER": "sshd", "_PID": "12350", "MESSAGE": "debug1: userauth-request for user test_user service ssh-connection method password [preauth]", "_TRANSPORT": "journal", "_SYSTEMD_UNIT": "sshd.service"},
        { "__CURSOR" : "s=pqr;i=stu;b=vwx;m=yza;t=bcd;x=efg", "__REALTIME_TIMESTAMP": "1678886530000000", "_HOSTNAME": "server01", "PRIORITY": "6", "SYSLOG_IDENTIFIER": "kernel", "_PID": "0", "MESSAGE": "Linux version 5.15.0-48-generic (buildd@bos02-amd64-011) (gcc (Ubuntu 11.2.0-19ubuntu1) 11.2.0, GNU ld (GNU Binutils for Ubuntu) 2.38)", "_TRANSPORT": "kernel", "_BOOT_ID": "boot2"},
        { "__CURSOR" : "s=stu;i=vwx;b=yza;m=bcd;t=efg;x=hij", "__REALTIME_TIMESTAMP": "1678886540000000", "_HOSTNAME": "server03", "PRIORITY": "4", "SYSLOG_IDENTIFIER": "apache2", "_PID": "3030", "MESSAGE": "AH00558: apache2: Could not reliably determine the server's fully qualified domain name, using 127.0.1.1. Set the 'ServerName' directive globally to suppress this message", "_TRANSPORT": "stderr", "_SYSTEMD_UNIT": "apache2.service"},
    ];

    function formatJournalTimestamp(microseconds) {
        if (!microseconds) return '-';
        try {
            const date = new Date(parseInt(microseconds) / 1000);
            return date.toLocaleString('en-US', {dateStyle: 'short', timeStyle: 'medium'});
        } catch (e) {
            return 'Invalid Date';
        }
    }

    function getPriorityTextAndClass(priority) {
        const p = parseInt(priority);
        switch (p) {
            case 0: return { text: 'EMERG', class: 'priority-0 priority-emerg', color: 'var(--priority-emerg-color)' };
            case 1: return { text: 'ALERT', class: 'priority-1 priority-alert', color: 'var(--priority-alert-color)' };
            case 2: return { text: 'CRIT', class: 'priority-2 priority-crit', color: 'var(--priority-crit-color)' };
            case 3: return { text: 'ERR', class: 'priority-3 priority-err', color: 'var(--priority-err-color)' };
            case 4: return { text: 'WARNING', class: 'priority-4 priority-warning', color: 'var(--priority-warning-color)' };
            case 5: return { text: 'NOTICE', class: 'priority-5 priority-notice', color: 'var(--priority-notice-color)' };
            case 6: return { text: 'INFO', class: 'priority-6 priority-info', color: 'var(--priority-info-color)' };
            case 7: return { text: 'DEBUG', class: 'priority-7 priority-debug', color: 'var(--priority-debug-color)' };
            default: return { text: `P${priority}`, class: '', color: '#cccccc' };
        }
    }

    function populateJournalTable(tableBody, entries, forDashboard = false) {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        const entriesToDisplay = forDashboard ? entries.slice(0, 5) : entries;

        entriesToDisplay.forEach(entry => {
            const row = tableBody.insertRow();
            const priorityInfo = getPriorityTextAndClass(entry.PRIORITY);
            const message = entry.MESSAGE || '-';
            const messageSnippet = message.length > 70 && forDashboard ? message.substring(0, 67) + "..." : message;

            const identifier = entry.SYSLOG_IDENTIFIER || entry._SYSTEMD_UNIT || '-';

            let rowHtml = `
                <td>${formatJournalTimestamp(entry.__REALTIME_TIMESTAMP)}</td>
                <td>${entry._HOSTNAME || '-'}</td>
                <td class="${priorityInfo.class}">${priorityInfo.text}</td>
                <td>${identifier}</td>
            `;

            if (forDashboard) {
                rowHtml += `<td class="message-col">${messageSnippet}</td>`;
            } else {
                rowHtml += `<td>${entry._PID || '-'}</td>`;
                rowHtml += `<td class="message-col">${message}</td>`;
                rowHtml += `<td>${entry._TRANSPORT || '-'}</td>`;
            }

            rowHtml += `<td><button class="action-btn" data-cursor="${entry.__CURSOR || ''}"><i class="fas fa-search-plus"></i> View</button></td>`;
            row.innerHTML = rowHtml;
        });
    }

    if (dashboardJournalTableBody) {
        populateJournalTable(dashboardJournalTableBody, allSampleJournalEntries, true);
    }

    if (mainJournalTableBody) {
        populateJournalTable(mainJournalTableBody, allSampleJournalEntries);
    }

    function updateDashboardWidgets() {
        if (errorLogCountElement) {
            const oneHourAgoMicros = (Date.now() * 1000) - (3600 * 1000 * 1000);
            const errorLogsLastHour = allSampleJournalEntries.filter(e =>
                parseInt(e.PRIORITY) <= 3 && parseInt(e.__REALTIME_TIMESTAMP) > oneHourAgoMicros
            );
            errorLogCountElement.textContent = errorLogsLastHour.length;
        }

        if (logIdentifiersChartCtx) {
            const identifierCounts = allSampleJournalEntries.reduce((acc, entry) => {
                const id = entry.SYSLOG_IDENTIFIER || entry._SYSTEMD_UNIT || 'unknown';
                acc[id] = (acc[id] || 0) + 1;
                return acc;
            }, {});
            const sortedIdentifiers = Object.entries(identifierCounts).sort(([,a],[,b]) => b-a).slice(0,5);

            if (window.logIdentifiersChartInstance) window.logIdentifiersChartInstance.destroy();
            window.logIdentifiersChartInstance = new Chart(logIdentifiersChartCtx, {
                type: 'bar',
                data: {
                    labels: sortedIdentifiers.map(item => item[0]),
                    datasets: [{
                        label: 'Log Count', data: sortedIdentifiers.map(item => item[1]),
                        backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1
                    }]
                },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: false } } }
            });
        }

        if (logsByPriorityChartCtx && logsByPriorityLegendContainer) {
            const priorityData = allSampleJournalEntries.reduce((acc, entry) => {
                const pInfo = getPriorityTextAndClass(entry.PRIORITY);
                if (!acc[entry.PRIORITY]) {
                    acc[entry.PRIORITY] = { count: 0, label: pInfo.text, class: pInfo.class, color: pInfo.color, originalPriority: parseInt(entry.PRIORITY) };
                }
                acc[entry.PRIORITY].count += 1;
                return acc;
            }, {});
            const sortedPrioritiesData = Object.values(priorityData).sort((a, b) => a.originalPriority - b.originalPriority);

            if (window.logsByPriorityChartInstance) window.logsByPriorityChartInstance.destroy();
            window.logsByPriorityChartInstance = new Chart(logsByPriorityChartCtx, {
                type: 'doughnut',
                data: {
                    labels: sortedPrioritiesData.map(p => p.label),
                    datasets: [{
                        data: sortedPrioritiesData.map(p => p.count),
                        backgroundColor: sortedPrioritiesData.map(p => p.color.startsWith('var(') ? getComputedStyle(document.documentElement).getPropertyValue(p.color.slice(4, -1)).trim() : p.color),
                        borderColor: 'var(--secondary-bg)', borderWidth: 2
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}` } } } }
            });

            logsByPriorityLegendContainer.innerHTML = '';
            sortedPrioritiesData.forEach(pData => {
                const legendItem = document.createElement('div'); legendItem.className = 'legend-item';
                const colorBox = document.createElement('div'); colorBox.className = 'legend-color-box';
                let bgColor = pData.color.startsWith('var(') ? getComputedStyle(document.documentElement).getPropertyValue(pData.color.slice(4, -1)).trim() : pData.color;
                colorBox.style.backgroundColor = bgColor;
                const text = document.createElement('span'); text.className = 'legend-text'; text.textContent = `${pData.label} (${pData.count})`;
                legendItem.appendChild(colorBox); legendItem.appendChild(text);
                logsByPriorityLegendContainer.appendChild(legendItem);
            });
        }

        if (bootListElement) {
            bootListElement.innerHTML = '';
            const uniqueBootIDs = [...new Set(allSampleJournalEntries.filter(e => e._BOOT_ID).map(e => e._BOOT_ID))];
            if (uniqueBootIDs.length > 0) {
                uniqueBootIDs.slice(-3).reverse().forEach(bootId => {
                    const firstEntryForBoot = allSampleJournalEntries.find(e => e._BOOT_ID === bootId);
                    const li = document.createElement('li');
                    li.textContent = `Boot ID: ${bootId.substring(0,8)}... (since ${formatJournalTimestamp(firstEntryForBoot.__REALTIME_TIMESTAMP)})`;
                    bootListElement.appendChild(li);
                });
            } else {
                bootListElement.innerHTML = '<li>No boot data with _BOOT_ID found.</li>';
            }
        }
    }
    updateDashboardWidgets();


    const msgFilter = document.getElementById('journal-message-filter');
    const prioFilter = document.getElementById('journal-priority-filter');
    const idFilter = document.getElementById('journal-identifier-filter');
    const hostFilter = document.getElementById('journal-hostname-filter');
    const applyFiltersBtn = document.getElementById('journal-apply-filters-btn');

    if (applyFiltersBtn && mainJournalTableBody) {
        applyFiltersBtn.addEventListener('click', () => {
            const msgTerm = msgFilter.value.toLowerCase();
            const prioTerm = prioFilter.value;
            const idTerm = idFilter.value.toLowerCase();
            const hostTerm = hostFilter.value.toLowerCase();

            const filteredEntries = allSampleJournalEntries.filter(entry => {
                const msgMatch = !msgTerm || (entry.MESSAGE && entry.MESSAGE.toLowerCase().includes(msgTerm));
                const prioMatch = !prioTerm || entry.PRIORITY === prioTerm;
                const idMatch = !idTerm || ((entry.SYSLOG_IDENTIFIER && entry.SYSLOG_IDENTIFIER.toLowerCase().includes(idTerm)) || (entry._SYSTEMD_UNIT && entry._SYSTEMD_UNIT.toLowerCase().includes(idTerm)));
                const hostMatch = !hostTerm || (entry._HOSTNAME && entry._HOSTNAME.toLowerCase().includes(hostTerm));
                return msgMatch && prioMatch && idMatch && hostMatch;
            });
            populateJournalTable(mainJournalTableBody, filteredEntries);
        });
    }

    const globalSearchInput = document.getElementById('global-journal-search');
    if(globalSearchInput && mainJournalTableBody) {
        globalSearchInput.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') {
                const searchTerm = globalSearchInput.value.toLowerCase();
                if (!searchTerm) {
                    populateJournalTable(mainJournalTableBody, allSampleJournalEntries);
                    navigateToSection('events');
                    return;
                }
                const filtered = allSampleJournalEntries.filter(entry => {
                    return Object.values(entry).some(val => String(val).toLowerCase().includes(searchTerm));
                });
                navigateToSection('events');
                populateJournalTable(mainJournalTableBody, filtered);
            }
        });
    }

    // TODO: Implement "View" button functionality (e.g., show full log in a modal)
    // TODO: Implement pagination functionality
    // TODO: Implement Watchlist Alerts and Investigation page functionalities
});