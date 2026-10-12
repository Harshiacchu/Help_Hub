// public/js/admin/dashboard.js - Admin Dashboard Logic
// Loads metrics, analytics, API keys, and rules configuration

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadDashboard();
    await loadApiKeys();
    await loadRules();
});

// ============================================
// DASHBOARD METRICS
// ============================================

async function loadDashboard() {
    try {
        const response = await fetch('/api/v1/admin/dashboard', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load dashboard');

        const result = await response.json();
        const data = result.data;

        // Update cards
        document.getElementById('totalTickets').textContent = data.totalTickets;
        document.getElementById('openTickets').textContent = data.openTickets;
        document.getElementById('inProgressTickets').textContent = data.inProgressTickets;
        document.getElementById('pendingTickets').textContent = data.pendingTickets;
        document.getElementById('closedTickets').textContent = data.closedTickets;
        document.getElementById('slaCompliance').textContent = data.slaCompliance.toFixed(1) + '%';
        document.getElementById('avgResponseTime').textContent = data.avgResponseTime.toFixed(1);
        document.getElementById('avgResolutionTime').textContent = data.avgResolutionTime.toFixed(1);

        // Priority stats
        const priorityHtml = Object.entries(data.ticketsByPriority)
            .map(([priority, count]) => `<p class="mb-1"><strong>${priority.charAt(0).toUpperCase() + priority.slice(1)}:</strong> ${count}</p>`)
            .join('');
        document.getElementById('priorityStats').innerHTML = priorityHtml;

        // Top categories
        const categoriesHtml = data.topCategories
            .map(cat => `<p class="mb-1"><strong>${cat.category}:</strong> ${cat.count}</p>`)
            .join('');
        document.getElementById('topCategories').innerHTML = categoriesHtml;

        // Agent workload
        const tbody = document.querySelector('#agentWorkloadTable tbody');
        tbody.innerHTML = data.agentWorkload
            .map(agent => `
                <tr>
                    <td>${agent.name}</td>
                    <td>${agent.ticketCount}</td>
                    <td>${agent.avgResolutionTime.toFixed(1)} hours</td>
                    <td>${agent.slaMet}/${agent.ticketCount}</td>
                </tr>
            `)
            .join('');

    } catch (error) {
        console.error('Dashboard load error:', error);
        showAlert('Failed to load dashboard metrics', 'danger');
    }
}

// ============================================
// ANALYTICS
// ============================================

async function loadAnalytics() {
    try {
        const startDate = document.getElementById('analyticsStartDate').value;
        const endDate = document.getElementById('analyticsEndDate').value;
        const priority = document.getElementById('analyticsPriority').value;

        const query = new URLSearchParams();
        if (startDate) query.append('startDate', startDate);
        if (endDate) query.append('endDate', endDate);
        if (priority) query.append('priority', priority);

        const response = await fetch(`/api/v1/admin/analytics?${query}`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load analytics');

        const result = await response.json();
        const data = result.data;

        // Build analytics display
        let html = `
            <div class="row mt-3">
                <div class="col-md-6">
                    <h6>SLA Compliance by Priority</h6>
                    <ul class="list-group">
        `;

        Object.entries(data.slaByPriority).forEach(([priority, compliance]) => {
            html += `<li class="list-group-item">${priority}: ${compliance.toFixed(1)}%</li>`;
        });

        html += `
                    </ul>
                </div>
                <div class="col-md-6">
                    <h6>Response Time by Category</h6>
                    <ul class="list-group">
        `;

        data.responseTimeByCategory.forEach(cat => {
            html += `<li class="list-group-item">${cat.category}: ${cat.avgResponseTime.toFixed(1)} hours</li>`;
        });

        html += `
                    </ul>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <h6>Quarterly Metrics</h6>
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Quarter</th>
                                <th>Created</th>
                                <th>Resolved</th>
                                <th>SLA Compliance</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        Object.entries(data.quarterlyMetrics).forEach(([quarter, metrics]) => {
            html += `
                <tr>
                    <td>${quarter}</td>
                    <td>${metrics.ticketsCreated}</td>
                    <td>${metrics.resolved}</td>
                    <td>${metrics.slaCompliance.toFixed(1)}%</td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('analyticsResults').innerHTML = html;

    } catch (error) {
        console.error('Analytics load error:', error);
        showAlert('Failed to load analytics', 'danger');
    }
}

// ============================================
// API KEYS
// ============================================

async function loadApiKeys() {
    try {
        const response = await fetch('/api/v1/api-keys', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load API keys');

        const result = await response.json();
        const tbody = document.querySelector('#apiKeysTable tbody');

        tbody.innerHTML = result.data
            .map(key => `
                <tr>
                    <td>${key.name}</td>
                    <td><code>${key.prefix}</code></td>
                    <td>${new Date(key.createdAt).toLocaleDateString()}</td>
                    <td>${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="revokeApiKey('${key.keyId}')">
                            Revoke
                        </button>
                    </td>
                </tr>
            `)
            .join('');

    } catch (error) {
        console.error('API keys load error:', error);
    }
}

async function createApiKey() {
    try {
        const name = document.getElementById('apiKeyName').value;

        if (!name) {
            showAlert('Please enter a key name', 'warning');
            return;
        }

        const response = await fetch('/api/v1/api-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
            credentials: 'include'
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error);

        // Display the key
        document.getElementById('displayedKey').textContent = result.data.key;
        document.getElementById('newKeyDisplay').style.display = 'block';
        document.getElementById('apiKeyName').value = '';

        // Reload keys list
        await loadApiKeys();
        showAlert('API key created successfully!', 'success');

    } catch (error) {
        console.error('Create API key error:', error);
        showAlert(error.message, 'danger');
    }
}

async function revokeApiKey(keyId) {
    if (!confirm('Revoke this API key? It will no longer work.')) return;

    try {
        const response = await fetch(`/api/v1/api-keys/${keyId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to revoke key');

        showAlert('API key revoked', 'success');
        await loadApiKeys();

    } catch (error) {
        console.error('Revoke error:', error);
        showAlert('Failed to revoke API key', 'danger');
    }
}

// ============================================
// RULES & CONFIGURATION
// ============================================

async function loadRules() {
    try {
        const response = await fetch('/api/v1/rules', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load rules');

        const result = await response.json();
        const data = result.data;

        // Load priorities
        document.querySelector('#prioritiesForm input[name="p1"]').value = data.priorities[1];
        document.querySelector('#prioritiesForm input[name="p2"]').value = data.priorities[2];
        document.querySelector('#prioritiesForm input[name="p3"]').value = data.priorities[3];
        document.querySelector('#prioritiesForm input[name="p4"]').value = data.priorities[4];
        document.querySelector('#prioritiesForm input[name="p5"]').value = data.priorities[5];

        // Load SLA
        document.querySelector('#slaForm input[name="critical"]').value = data.slaTargets.critical;
        document.querySelector('#slaForm input[name="high"]').value = data.slaTargets.high;
        document.querySelector('#slaForm input[name="medium"]').value = data.slaTargets.medium;
        document.querySelector('#slaForm input[name="low"]').value = data.slaTargets.low;
        document.querySelector('#slaForm input[name="minimal"]').value = data.slaTargets.minimal;

        // Load categories
        document.getElementById('categoriesInput').value = data.categories.join(', ');

    } catch (error) {
        console.error('Load rules error:', error);
    }
}

async function updatePriorities() {
    try {
        const priorities = {
            1: document.querySelector('#prioritiesForm input[name="p1"]').value,
            2: document.querySelector('#prioritiesForm input[name="p2"]').value,
            3: document.querySelector('#prioritiesForm input[name="p3"]').value,
            4: document.querySelector('#prioritiesForm input[name="p4"]').value,
            5: document.querySelector('#prioritiesForm input[name="p5"]').value
        };

        const response = await fetch('/api/v1/rules/priorities', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(priorities),
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to update priorities');

        showAlert('Priorities updated successfully', 'success');

    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function updateSLA() {
    try {
        const slaTargets = {
            critical: parseInt(document.querySelector('#slaForm input[name="critical"]').value),
            high: parseInt(document.querySelector('#slaForm input[name="high"]').value),
            medium: parseInt(document.querySelector('#slaForm input[name="medium"]').value),
            low: parseInt(document.querySelector('#slaForm input[name="low"]').value),
            minimal: parseInt(document.querySelector('#slaForm input[name="minimal"]').value)
        };

        const response = await fetch('/api/v1/rules/sla-targets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slaTargets),
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to update SLA');

        showAlert('SLA targets updated successfully', 'success');

    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function updateCategories() {
    try {
        const categories = document.getElementById('categoriesInput').value
            .split(',')
            .map(c => c.trim())
            .filter(c => c);

        const response = await fetch('/api/v1/rules/categories', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories }),
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to update categories');

        showAlert('Categories updated successfully', 'success');

    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// ============================================
// UTILITIES
// ============================================

function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertBefore(alert, document.body.firstChild);
}

function logout() {
    fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
        .then(() => window.location.href = '/pages/login.html');
}
