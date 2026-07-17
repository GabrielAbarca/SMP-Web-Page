import "./errorHandler.js";
import "./speedInsights.js";
import { signIn, signUp, getSession } from "./auth.js";
import { initTheme, bindThemeToggle } from "./theme.js";
import { initI18n, applyTranslations, t } from "./i18n.js";
import { DEMO_MODE, DEMO_CREDENTIALS } from "./demoMode.js";

// Login has no settings panel → detection-only (navigator.language). No stored
// key; the static markup carries data-i18n and is translated on load below.
initI18n("login");
applyTranslations();

const currentUser = await getSession();
if (currentUser) {
  window.location.replace("/");
}

let isSignUpMode = false;

const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authAvatarIcon = document.getElementById("auth-avatar-icon");
const authToast = document.getElementById("auth-toast");

const groupName = document.getElementById("group-name");
const groupConfirm = document.getElementById("group-confirm");

const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");
const inputPassword = document.getElementById("input-password");
const inputConfirm = document.getElementById("input-confirm");

const errorName = document.getElementById("error-name");
const errorEmail = document.getElementById("error-email");
const errorPassword = document.getElementById("error-password");
const errorConfirm = document.getElementById("error-confirm");

const btnSubmit = document.getElementById("btn-submit");
const btnText = document.getElementById("btn-text");
const btnSpinner = document.getElementById("btn-spinner");
const btnSwitch = document.getElementById("btn-switch");
const switchText = document.getElementById("switch-text");

const togglePassword = document.getElementById("toggle-password");
const toggleIcon = document.getElementById("toggle-password-icon");

const themeToggler = document.getElementById("login-theme-toggler");

// Swap the inline SVG sprite icon inside a `.material-symbols-outlined` span
// (icons are now <svg><use href="#icon-NAME"> rather than a font ligature).
function setIcon(spanEl, name) {
  const use = spanEl.querySelector("use");
  if (use) use.setAttribute("href", `#icon-${name}`);
}

initTheme();
bindThemeToggle(themeToggler);

// Demo sandbox: this deploy is a single shared profile. Prefill and lock the
// credentials so visitors sign in with one click, and hide the sign-up path
// (which only errors anyway). Gated on DEMO_MODE → a real build is untouched.
if (DEMO_MODE) {
  inputEmail.value = DEMO_CREDENTIALS.email;
  inputPassword.value = DEMO_CREDENTIALS.password;

  [inputEmail, inputPassword].forEach((input) => {
    input.readOnly = true;
    input.closest(".input-wrapper").classList.add("demo-locked");
  });

  // Keep the password masked and drop the reveal toggle.
  togglePassword.style.display = "none";

  // Hide the Sign Up switch (disabled server-side in demo).
  const authSwitch = document.querySelector(".auth-switch");
  if (authSwitch) authSwitch.style.display = "none";

  authSubtitle.textContent = t("login.demoSubtitle");

  const demoNotice = document.getElementById("demo-notice");
  if (demoNotice) demoNotice.style.display = "block";
}

btnSwitch.addEventListener("click", () => {
  isSignUpMode = !isSignUpMode;
  clearErrors();
  clearToast();

  if (isSignUpMode) {
    authTitle.textContent = t("login.createTitle");
    authSubtitle.textContent = t("login.createSubtitle");
    setIcon(authAvatarIcon, "person_add");
    btnText.textContent = t("login.signUp");
    switchText.textContent = t("login.haveAccount");
    btnSwitch.textContent = t("login.signIn");

    showField(groupName);
    showField(groupConfirm);
    inputPassword.setAttribute("autocomplete", "new-password");
  } else {
    authTitle.textContent = t("login.welcomeTitle");
    authSubtitle.textContent = t("login.welcomeSubtitle");
    setIcon(authAvatarIcon, "lock");
    btnText.textContent = t("login.signIn");
    switchText.textContent = t("login.noAccount");
    btnSwitch.textContent = t("login.signUp");

    hideField(groupName);
    hideField(groupConfirm);
    inputPassword.setAttribute("autocomplete", "current-password");
  }
});

togglePassword.addEventListener("click", () => {
  const isHidden = inputPassword.type === "password";
  inputPassword.type = isHidden ? "text" : "password";
  setIcon(toggleIcon, isHidden ? "visibility_off" : "visibility");
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  clearToast();

  const email = inputEmail.value.trim();
  const password = inputPassword.value;
  const name = inputName.value.trim();
  const confirm = inputConfirm.value;

  let valid = true;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError(errorEmail, inputEmail, t("login.validation.email"));
    valid = false;
  }

  if (!password || password.length < 6) {
    setFieldError(errorPassword, inputPassword, t("login.validation.password"));
    valid = false;
  }

  if (isSignUpMode) {
    if (!name) {
      setFieldError(errorName, inputName, t("login.validation.name"));
      valid = false;
    }
    if (password !== confirm) {
      setFieldError(
        errorConfirm,
        inputConfirm,
        t("login.validation.passwordsMatch"),
      );
      valid = false;
    }
  }

  if (!valid) return;

  setLoading(true);

  try {
    if (isSignUpMode) {
      await signUp(name, email, password);

      await signIn(email, password);
      window.location.replace("/");
    } else {
      await signIn(email, password);
      window.location.replace("/");
    }
  } catch (err) {
    const message =
      err.name === "DemoDisabledError"
        ? t("login.error.demoSignupDisabled")
        : formatAuthError(err.message);
    showToast(message, "error");
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  btnSubmit.disabled = loading;
  btnText.style.display = loading ? "none" : "inline";
  btnSpinner.style.display = loading ? "inline-block" : "none";
  authForm.querySelectorAll("input").forEach((el) => (el.disabled = loading));
  btnSwitch.disabled = loading;
}

function setFieldError(errorEl, inputEl, message) {
  errorEl.textContent = message;
  inputEl.closest(".input-wrapper").classList.add("input-error");
}

function clearErrors() {
  [errorName, errorEmail, errorPassword, errorConfirm].forEach((el) => {
    if (el) el.textContent = "";
  });
  authForm.querySelectorAll(".input-wrapper").forEach((el) => {
    el.classList.remove("input-error");
  });
}

function showToast(message, type = "error") {
  authToast.textContent = message;
  authToast.className = `auth-toast toast-${type}`;
}

function clearToast() {
  authToast.textContent = "";
  authToast.className = "auth-toast";
}

function showField(el) {
  el.style.display = "block";
}

function hideField(el) {
  el.style.display = "none";
}

function formatAuthError(message) {
  if (!message) return t("login.error.unexpected");

  const lower = message.toLowerCase();
  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials")
  ) {
    return t("login.error.credentials");
  }
  if (lower.includes("email not confirmed")) {
    return t("login.error.notConfirmed");
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered")
  ) {
    return t("login.error.exists");
  }
  if (lower.includes("password should be")) {
    return t("login.error.passwordLength");
  }
  if (lower.includes("rate limit")) {
    return t("login.error.rateLimit");
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return t("login.error.network");
  }
  return message;
}

authForm.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", () => {
    const wrapper = input.closest(".input-wrapper");
    if (wrapper) wrapper.classList.remove("input-error");
  });
});
