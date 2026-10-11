// login.js - User Login
// Handles user login form submission

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        rememberMe: document.getElementById('rememberMe').checked
    };

    try {
        // POST to backend
        const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData),
            credentials: 'include' // Send cookies (session)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Login failed');
        }

        // Success - store user info and redirect to dashboard
        console.log('Login successful', result);
        
        // Store user info in localStorage (optional)
        localStorage.setItem('user', JSON.stringify(result.user));
        
        // Show success message
        showAlert('Login successful! Redirecting...', 'success');
        
        // Redirect to dashboard
        setTimeout(() => {
            // Redirect based on user role
            if (result.user.role === 'admin') {
                window.location.href = '/pages/admin-dashboard.html';
            } else if (result.user.role === 'agent') {
                window.location.href = '/pages/agent-queue.html';
            } else if (result.user.role === 'customer') {
                window.location.href = '/pages/my-tickets.html';
            } else {
                window.location.href = '/pages/dashboard.html';
            }
        }, 1500);

    } catch (error) {
        console.error('Login error:', error);
        showAlert(error.message, 'danger');
    }
});

// Show alert message
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
}
