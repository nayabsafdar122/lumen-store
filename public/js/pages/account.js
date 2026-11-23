import { state, hooks, api, errText, esc, money, emptyState, toast, busy, initials, $, emit } from '../core.js';

export default async function account({ app }) {
  if (!state.user) {
    app.innerHTML = emptyState('👤', 'Your account', 'Sign in to manage your profile and orders.', '<button class="btn btn-primary" id="ac-login">Sign in</button>');
    $('#ac-login').onclick = () => hooks.openAuth('login', () => hooks.route());
    return;
  }
  const u = state.user;
  app.innerHTML = `
    <div class="page-head"><div style="display:flex;gap:18px;align-items:center">
      <span class="avatar" style="width:64px;height:64px;font-size:22px;display:grid;place-items:center;margin:0">${esc(initials(u.name))}</span>
      <div><h1>Hi, ${esc(u.name.split(' ')[0])}</h1><p>${esc(u.email)}${u.role === 'admin' ? ' · Administrator' : ''}</p></div>
    </div></div>
    <div class="account-grid">
      <nav class="side-nav">
        <a href="#/account" class="active">👤 Profile</a>
        <a href="#/orders">📦 Orders</a>
        <a href="#/wishlist">♡ Wishlist <span class="count" ${state.wishlist.size ? '' : 'hidden'}>${state.wishlist.size}</span></a>
        <a href="#/feedback">💬 Help & feedback</a>
        ${u.role === 'admin' ? '<a href="#/admin">📊 Admin dashboard</a>' : ''}
      </nav>
      <div>
        <div class="mini-stats" id="ac-stats"><div class="skel" style="height:86px"></div><div class="skel" style="height:86px"></div><div class="skel" style="height:86px"></div></div>
        <div class="row2" style="gap:18px;align-items:start">
          <form class="panel" id="profile-form">
            <h3>Profile</h3>
            <div class="field"><label for="p-name">Full name</label><input class="input" id="p-name" name="name" value="${esc(u.name)}" required maxlength="100"></div>
            <div class="field"><label>Email</label><input class="input" value="${esc(u.email)}" disabled><span class="hint">Contact support to change your email.</span></div>
            <button class="btn btn-primary" type="submit">Save changes</button>
          </form>
          <form class="panel" id="pw-form">
            <h3>Change password</h3>
            <div id="pw-error"></div>
            <div class="field"><label for="pw-cur">Current password</label><input class="input" id="pw-cur" name="current" type="password" required autocomplete="current-password"></div>
            <div class="field"><label for="pw-new">New password</label><input class="input" id="pw-new" name="next" type="password" required minlength="8" autocomplete="new-password"><span class="hint">At least 8 characters</span></div>
            <button class="btn btn-primary" type="submit">Update password</button>
          </form>
        </div>
      </div>
    </div>`;

  $('#profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]'); busy(btn);
    try {
      state.user = (await api('/auth/me', { method: 'PATCH', body: { name: e.target.elements['name'].value } })).user;
      toast('Profile updated'); emit('auth'); hooks.route();
    } catch (err) { toast(errText(err), { type: 'error' }); busy(btn, false); }
  };
  $('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('[type=submit]'); busy(btn);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: f.current.value, newPassword: f.next.value } });
      f.reset(); $('#pw-error').innerHTML = ''; toast('Password updated 🔒');
    } catch (err) { $('#pw-error').innerHTML = `<div class="form-error">${esc(errText(err))}</div>`; }
    busy(btn, false);
  };

  const { data } = await api('/orders?limit=100');
  const mine = data.filter((o) => o.UserId === u.id);
  const spent = mine.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + o.totalCents, 0);
  const active = mine.filter((o) => ['pending', 'paid', 'shipped'].includes(o.status)).length;
  const st = $('#ac-stats');
  if (st) st.innerHTML = `<div><span>Orders placed</span><strong>${mine.length}</strong></div><div><span>Total spent</span><strong>${money(spent)}</strong></div><div><span>On the way</span><strong>${active}</strong></div>`;
}
