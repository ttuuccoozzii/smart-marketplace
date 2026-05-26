const Auth = {
  TOKEN_KEY: 'admin_token',

  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    sessionStorage.setItem(this.TOKEN_KEY, token);
  },

  clearToken() {
    sessionStorage.removeItem(this.TOKEN_KEY);
  },

  async login(password) {
    try {
      const res = await fetch('/api/admin/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password })
      });
      if (!res.ok) return false;
      const { token } = await res.json();
      this.setToken(token);
      return true;
    } catch {
      return false;
    }
  },

  async logout() {
    const token = this.getToken();
    if (token) {
      await fetch('/api/admin/logout', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    this.clearToken();
    window.location.href = 'admin-login.html';
  },

  // Call at the top of admin.js — redirects to login if session is invalid.
  async guardPage() {
    const token = this.getToken();
    if (!token) { window.location.replace('admin-login.html'); return false; }

    try {
      const res = await fetch('/api/admin/check', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('invalid');
      return true;
    } catch {
      this.clearToken();
      window.location.replace('admin-login.html');
      return false;
    }
  }
};
