// register.js - User Registration
// Handles user registration form submission

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate passwords match
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'danger');
        return;
    }

    // Validate password strength
    if (!validatePassword(password)) {
        showAlert('Password must be at least 8 characters with 1 uppercase letter and 1 number', 'danger');
        return;
    }

    const formData = {
        email: document.getElementById('email').value,
        password: password,
        name: document.getElementById('name').value,
        shareCode: document.getElementById('shareCode').value
    };

    try {
        // POST to backend
        const response = await fetch('/api/v1/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData),
            credentials: 'include'
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Registration failed');
        }

        // Success
        showAlert('Registration successful! Redirecting to login...', 'success');
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.href = '/pages/login.html';
        }, 2000);

    } catch (error) {
        console.error('Registration error:', error);
        showAlert(error.message, 'danger');
    }
});

// Validate password strength
function validatePassword(password) {
    // Min 8 chars, 1 uppercase, 1 number
    const regex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    return regex.test(password);
}

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
