import { signIn, signUp, getSession } from './auth.js';




const currentUser = await getSession();
if (currentUser) {
    window.location.replace('/');
}




let isSignUpMode = false;




const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authAvatarIcon = document.getElementById('auth-avatar-icon');
const authToast = document.getElementById('auth-toast');

const groupName = document.getElementById('group-name');
const groupConfirm = document.getElementById('group-confirm');

const inputName = document.getElementById('input-name');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const inputConfirm = document.getElementById('input-confirm');

const errorName = document.getElementById('error-name');
const errorEmail = document.getElementById('error-email');
const errorPassword = document.getElementById('error-password');
const errorConfirm = document.getElementById('error-confirm');

const btnSubmit = document.getElementById('btn-submit');
const btnText = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');
const btnSwitch = document.getElementById('btn-switch');
const switchText = document.getElementById('switch-text');

const togglePassword = document.getElementById('toggle-password');
const toggleIcon = document.getElementById('toggle-password-icon');

const themeToggler = document.getElementById('login-theme-toggler');
const themeIconLight = document.getElementById('theme-icon-light');
const themeIconDark = document.getElementById('theme-icon-dark');




themeToggler.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme-variables');
    themeIconLight.classList.toggle('active');
    themeIconDark.classList.toggle('active');
});




btnSwitch.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    clearErrors();
    clearToast();

    if (isSignUpMode) {
        
        authTitle.textContent = 'Create an account';
        authSubtitle.textContent = 'Join SMP and access your student portal';
        authAvatarIcon.textContent = 'person_add';
        btnText.textContent = 'Sign Up';
        switchText.textContent = 'Already have an account?';
        btnSwitch.textContent = 'Sign In';

        showField(groupName);
        showField(groupConfirm);
        inputPassword.setAttribute('autocomplete', 'new-password');
    } else {
        
        authTitle.textContent = 'Welcome back';
        authSubtitle.textContent = 'Sign in to your account to continue';
        authAvatarIcon.textContent = 'lock';
        btnText.textContent = 'Sign In';
        switchText.textContent = "Don't have an account?";
        btnSwitch.textContent = 'Sign Up';

        hideField(groupName);
        hideField(groupConfirm);
        inputPassword.setAttribute('autocomplete', 'current-password');
    }
});




togglePassword.addEventListener('click', () => {
    const isHidden = inputPassword.type === 'password';
    inputPassword.type = isHidden ? 'text' : 'password';
    toggleIcon.textContent = isHidden ? 'visibility_off' : 'visibility';
});




authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    clearToast();

    const email = inputEmail.value.trim();
    const password = inputPassword.value;
    const name = inputName.value.trim();
    const confirm = inputConfirm.value;

    
    let valid = true;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldError(errorEmail, inputEmail, 'Please enter a valid email address.');
        valid = false;
    }

    if (!password || password.length < 6) {
        setFieldError(errorPassword, inputPassword, 'Password must be at least 6 characters.');
        valid = false;
    }

    if (isSignUpMode) {
        if (!name) {
            setFieldError(errorName, inputName, 'Full name is required.');
            valid = false;
        }
        if (password !== confirm) {
            setFieldError(errorConfirm, inputConfirm, 'Passwords do not match.');
            valid = false;
        }
    }

    if (!valid) return;

    
    setLoading(true);

    try {
        if (isSignUpMode) {
            await signUp(name, email, password);
            
            await signIn(email, password);
            window.location.replace('/');
        } else {
            await signIn(email, password);
            window.location.replace('/');
        }
    } catch (err) {
        showToast(formatAuthError(err.message), 'error');
    } finally {
        setLoading(false);
    }
});






function setLoading(loading) {
    btnSubmit.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnSpinner.style.display = loading ? 'inline-block' : 'none';
    authForm.querySelectorAll('input').forEach(el => el.disabled = loading);
    btnSwitch.disabled = loading;
}


function setFieldError(errorEl, inputEl, message) {
    errorEl.textContent = message;
    inputEl.closest('.input-wrapper').classList.add('input-error');
}


function clearErrors() {
    [errorName, errorEmail, errorPassword, errorConfirm].forEach(el => {
        if (el) el.textContent = '';
    });
    authForm.querySelectorAll('.input-wrapper').forEach(el => {
        el.classList.remove('input-error');
    });
}


function showToast(message, type = 'error') {
    authToast.textContent = message;
    authToast.className = `auth-toast toast-${type}`;
}


function clearToast() {
    authToast.textContent = '';
    authToast.className = 'auth-toast';
}


function showField(el) {
    el.style.display = 'block';
}


function hideField(el) {
    el.style.display = 'none';
}


function formatAuthError(message) {
    if (!message) return 'An unexpected error occurred. Please try again.';

    const lower = message.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
        return 'Incorrect email or password. Please try again.';
    }
    if (lower.includes('email not confirmed')) {
        return 'Your email is not confirmed. Please check your inbox.';
    }
    if (lower.includes('user already registered') || lower.includes('already been registered')) {
        return 'An account with this email already exists. Try signing in instead.';
    }
    if (lower.includes('password should be')) {
        return 'Password must be at least 6 characters long.';
    }
    if (lower.includes('rate limit')) {
        return 'Too many attempts. Please wait a moment before trying again.';
    }
    if (lower.includes('network') || lower.includes('fetch')) {
        return 'Network error. Please check your connection and try again.';
    }
    return message;
}


authForm.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
        const wrapper = input.closest('.input-wrapper');
        if (wrapper) wrapper.classList.remove('input-error');
    });
});
