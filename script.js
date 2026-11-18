(() => {
"use strict";

const KEY = { users: "connectHubUsers", posts: "connectHubPosts", current: "connectHubCurrentUser" };
const DEFAULT_BIO = "Welcome to my ConnectHub profile.";

let user = null;
let view = "home";
let query = "";
let topic = "";
const openComments = new Set(); // post ids whose comment box is open

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- Storage ---------- */
function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null || value === undefined ? fallback : value;
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    toast("Couldn't save. Device storage is full or unavailable.");
    return false;
  }
}
const getUsers = () => read(KEY.users, []);
const getPosts = () => read(KEY.posts, []);

/* ---------- Helpers ---------- */
let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
function authMessage(text, ok) {
  const el = $("#auth-message");
  el.textContent = text || "";
  el.classList.toggle("success", !!ok);
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function uid() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function formatDate(ms) {
  return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function plural(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

/* Passwords are salted and hashed so they are not kept as plain text. */
async function hashPassword(password, salt) {
  const data = salt + ":" + password;
  if (window.crypto && window.crypto.subtle) {
    const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381; // fallback for non-secure contexts
  for (const ch of data) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return "x" + h;
}

/* ---------- Seed data ---------- */
function seed() {
  let list = getPosts();
  if (!list.length) {
    list = [
      { id: uid(), author: "Rahul Sharma", email: "rahul@example.demo", topic: "Learning",
        message: "Hello everyone! Welcome to our new community. Excited to connect with all of you!",
        createdAt: Date.now() - 7200000 },
      { id: uid(), author: "Priya Patel", email: "priya@example.demo", topic: "Lifestyle",
        message: "What are your goals for this week? Let's motivate each other!",
        createdAt: Date.now() - 18000000 }
    ];
  }
  // Normalise older saved data so nothing breaks on missing fields.
  list = list.map(p => ({
    id: p.id || uid(),
    author: p.author || "Member",
    email: p.email || "",
    topic: p.topic || "",
    message: p.message || p.text || "",
    createdAt: p.createdAt || Date.now(),
    likes: Array.isArray(p.likes) ? p.likes : [],
    comments: Array.isArray(p.comments) ? p.comments : [],
    savedBy: Array.isArray(p.savedBy) ? p.savedBy : []
  }));
  write(KEY.posts, list);
}

/* ---------- Screens ---------- */
function showAuth(tab) {
  user = null;
  $("#auth").hidden = false;
  $("#app").hidden = true;
  $("#logout").hidden = true;
  $("#nav").hidden = true;
  $("#search").hidden = true;
  $("#login-form").hidden = tab !== "login";
  $("#register-form").hidden = tab !== "register";
  $("#show-login").classList.toggle("active", tab === "login");
  $("#show-register").classList.toggle("active", tab === "register");
}

function openApp() {
  const email = localStorage.getItem(KEY.current);
  user = getUsers().find(u => u.email === email) || null;
  if (!user) {
    localStorage.removeItem(KEY.current);
    showAuth("login");
    return;
  }
  $("#auth").hidden = true;
  $("#app").hidden = false;
  $("#logout").hidden = false;
  $("#nav").hidden = false;
  $("#search").hidden = false;
  $("#first-name").textContent = user.name.split(/\s+/)[0];
  $("#avatar").textContent = initials(user.name);
  $("#profile-name").textContent = user.name;
  $("#profile-email").textContent = user.email;
  $("#profile-bio").textContent = user.bio || DEFAULT_BIO;
  setView(view);
}

function setView(next) {
  if (!user) return;
  view = next;
  ["home", "saved", "profile"].forEach(v => { $("#" + v + "-view").hidden = v !== view; });
  $$("#nav [data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  render();
  window.scrollTo(0, 0);
}

/* ---------- Rendering ---------- */
function card(p, names) {
  const node = $("#post-template").content.firstElementChild.cloneNode(true);
  const authorName = names[p.email] || p.author; // always show the member's current name
  node.dataset.id = p.id;
  $(".avatar", node).textContent = initials(authorName);
  $(".author", node).textContent = authorName;
  $(".post-date", node).textContent = formatDate(p.createdAt);
  $(".post-message", node).textContent = p.message;
  if (p.topic) {
    const tag = $(".topic-tag", node);
    tag.textContent = "#" + p.topic;
    tag.hidden = false;
  }
  $(".likes-count", node).textContent = plural(p.likes.length, "like", "likes");
  $(".comments-count", node).textContent = plural(p.comments.length, "comment", "comments");

  const liked = p.likes.includes(user.email);
  const saved = p.savedBy.includes(user.email);
  const likeBtn = $(".like", node);
  const saveBtn = $(".save", node);
  likeBtn.textContent = liked ? "♥ Liked" : "♡ Like";
  likeBtn.classList.toggle("selected", liked);
  saveBtn.textContent = saved ? "★ Saved" : "☆ Save";
  saveBtn.classList.toggle("selected", saved);
  if (p.email !== user.email) $(".delete", node).hidden = true;

  const list = $(".comment-list", node);
  p.comments.forEach(c => {
    const row = document.createElement("div");
    row.className = "comment";
    const who = document.createElement("b");
    who.textContent = (names[c.email] || c.author) + ": ";
    row.appendChild(who);
    row.appendChild(document.createTextNode(c.text));
    list.appendChild(row);
  });
  if (openComments.has(p.id)) $(".comments", node).hidden = false;
  return node;
}

function fillList(el, posts, names) {
  el.innerHTML = "";
  posts.forEach(p => el.appendChild(card(p, names)));
}

function render() {
  if (!user) return;
  const names = {};
  getUsers().forEach(u => { names[u.email] = u.name; });
  const all = getPosts().sort((a, b) => b.createdAt - a.createdAt);

  if (view === "home") {
    const found = all.filter(p => {
      const matchesQuery = !query || (p.message + " " + (names[p.email] || p.author)).toLowerCase().includes(query);
      const matchesTopic = !topic || p.topic === topic;
      return matchesQuery && matchesTopic;
    });
    $("#feed-heading").textContent = topic ? "#" + topic : query ? "Search results" : "Latest posts";
    $("#feed-count").textContent = plural(found.length, "post", "posts");
    fillList($("#feed"), found, names);
    $("#empty-home").hidden = found.length > 0;
    $$("#chips [data-topic]").forEach(b => b.classList.toggle("active", b.dataset.topic === topic));
  } else if (view === "saved") {
    const saved = all.filter(p => p.savedBy.includes(user.email));
    fillList($("#saved-list"), saved, names);
    $("#empty-saved").hidden = saved.length > 0;
  } else if (view === "profile") {
    const mine = all.filter(p => p.email === user.email);
    $("#my-count").textContent = mine.length;
    fillList($("#my-posts"), mine, names);
    $("#empty-profile").hidden = mine.length > 0;
  }
}

/* ---------- Account actions ---------- */
async function register(e) {
  e.preventDefault();
  const name = $("#register-name").value.trim();
  const email = $("#register-email").value.trim().toLowerCase();
  const password = $("#register-password").value;
  if (name.length < 2) return authMessage("Enter a name with at least 2 characters.");
  if (password.length < 6) return authMessage("Password must be at least 6 characters.");
  const list = getUsers();
  if (list.some(u => u.email === email)) return authMessage("This email is already registered. Log in instead.");
  const salt = uid();
  list.push({ name, email, salt, hash: await hashPassword(password, salt), bio: "", joinedAt: Date.now() });
  if (!write(KEY.users, list)) return;
  $("#register-form").reset();
  $("#login-email").value = email;
  showAuth("login");
  authMessage("Account created. Log in to continue.", true);
}

async function login(e) {
  e.preventDefault();
  const email = $("#login-email").value.trim().toLowerCase();
  const password = $("#login-password").value;
  const list = getUsers();
  const found = list.find(u => u.email === email);
  let ok = false;
  if (found && found.hash) {
    ok = (await hashPassword(password, found.salt)) === found.hash;
  } else if (found && typeof found.password === "string" && found.password === password) {
    // Account saved by the old version: upgrade it to a hashed password.
    found.salt = uid();
    found.hash = await hashPassword(password, found.salt);
    delete found.password;
    write(KEY.users, list);
    ok = true;
  }
  if (!ok) return authMessage("Email or password is incorrect.");
  localStorage.setItem(KEY.current, found.email);
  $("#login-form").reset();
  authMessage("");
  view = "home";
  openApp();
}

function logout() {
  localStorage.removeItem(KEY.current);
  query = "";
  topic = "";
  $("#search").value = "";
  showAuth("login");
  authMessage("");
}

function saveProfile(e) {
  e.preventDefault();
  const name = $("#edit-name").value.trim();
  if (name.length < 2) return toast("Enter a name with at least 2 characters.");
  const list = getUsers();
  const me = list.find(u => u.email === user.email);
  if (!me) return;
  me.name = name;
  me.bio = $("#edit-bio").value.trim();
  if (!write(KEY.users, list)) return;
  $("#edit-dialog").close();
  openApp();
  toast("Profile saved.");
}

/* ---------- Post actions ---------- */
function publish(e) {
  e.preventDefault();
  const text = $("#post-text").value.trim();
  if (!text) return;
  const list = getPosts();
  list.push({
    id: uid(), author: user.name, email: user.email, topic: $("#post-topic").value,
    message: text, createdAt: Date.now(), likes: [], comments: [], savedBy: []
  });
  if (!write(KEY.posts, list)) return;
  $("#post-form").reset();
  $("#char-count").textContent = "0 / 1000";
  render();
  toast("Published.");
}

function toggle(array, value) {
  const i = array.indexOf(value);
  if (i < 0) array.push(value); else array.splice(i, 1);
}

function onPostClick(e) {
  const cardEl = e.target.closest(".post");
  if (!cardEl || !user) return;
  const list = getPosts();
  const index = list.findIndex(p => p.id === cardEl.dataset.id);
  if (index < 0) return;
  const post = list[index];

  if (e.target.closest(".comment-toggle")) {
    const box = $(".comments", cardEl);
    box.hidden = !box.hidden;
    if (box.hidden) openComments.delete(post.id); else openComments.add(post.id);
    return;
  }
  if (e.target.closest(".like")) {
    toggle(post.likes, user.email);
  } else if (e.target.closest(".save")) {
    toggle(post.savedBy, user.email);
  } else if (e.target.closest(".delete")) {
    if (post.email !== user.email || !confirm("Delete this post?")) return;
    list.splice(index, 1);
    openComments.delete(post.id);
  } else {
    return;
  }
  if (write(KEY.posts, list)) render();
}

function onCommentSubmit(e) {
  if (!e.target.matches(".comment-form") || !user) return;
  e.preventDefault();
  const cardEl = e.target.closest(".post");
  const input = $(".comment-input", e.target);
  const text = input.value.trim();
  if (!text) return;
  const list = getPosts();
  const post = list.find(p => p.id === cardEl.dataset.id);
  if (!post) return;
  post.comments.push({ author: user.name, email: user.email, text });
  openComments.add(post.id);
  if (write(KEY.posts, list)) render();
}

/* ---------- Start ---------- */
function init() {
  seed();

  $("#show-login").onclick = () => { authMessage(""); showAuth("login"); };
  $("#show-register").onclick = () => { authMessage(""); showAuth("register"); };
  $("#login-form").onsubmit = login;
  $("#register-form").onsubmit = register;
  $("#logout").onclick = logout;

  $("#post-form").onsubmit = publish;
  $("#post-text").oninput = function () { $("#char-count").textContent = this.value.length + " / 1000"; };
  ["feed", "saved-list", "my-posts"].forEach(id => $("#" + id).addEventListener("click", onPostClick));
  document.addEventListener("submit", onCommentSubmit);

  $$("#nav [data-view]").forEach(b => { b.onclick = () => setView(b.dataset.view); });
  $("#home-link").onclick = e => { e.preventDefault(); if (user) setView("home"); };

  $("#search").oninput = function () {
    query = this.value.trim().toLowerCase();
    if (view !== "home") setView("home"); else render();
  };
  $$("#chips [data-topic]").forEach(b => {
    b.onclick = () => { topic = b.dataset.topic; render(); };
  });

  $("#edit-profile").onclick = () => {
    $("#edit-name").value = user.name;
    $("#edit-bio").value = user.bio || "";
    $("#edit-dialog").showModal();
  };
  $("#edit-form").onsubmit = saveProfile;
  $("#cancel-edit").onclick = () => $("#edit-dialog").close();

  openApp();
}

document.addEventListener("DOMContentLoaded", init);
})();
