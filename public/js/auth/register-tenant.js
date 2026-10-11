// register-tenant.js - Tenant Registration
// Handles organization registration form submission

document.getElementById('registerTenantForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form data
    const formData = {
        name: document.getElementById('companyName').value,
        slug: document.getElementById('slug').value,
        supportEmailAlias: document.getElementById('supportEmail').value,
        slaTargets: {
            low: parseInt(document.getElementById('slaLow').value),
            normal: parseInt(document.getElementById('slaNormal').value),
            high: parseInt(document.getElementById('slaHigh').value),
            urgent: parseInt(document.getElementById('slaUrgent').value)
        }
    };

    try {
        // POST to backend
        const response = await fetch('/api/v1/auth/register-tenant', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData),
            credentials: 'include' // Send cookies
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Registration failed');
        }

        // Success - show message and redirect
        showAlert('Organization registered successfully! Your share code is: ' + result.shareCode, 'success');
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.href = '/pages/login.html';
        }, 2000);

    } catch (error) {
        console.error('Registration error:', error);
        showAlert(error.message, 'danger');
    }
});

// Show alert message
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    alertContainer.appendChild(alertDiv);
}

// Format slug automatically
document.getElementById('companyName').addEventListener('input', (e) => {
    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    document.getElementById('slug').value = slug;
});
