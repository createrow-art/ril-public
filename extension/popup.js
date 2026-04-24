const API = 'http://localhost:3001';

const urlInput   = document.getElementById('url-input');
const noteInput  = document.getElementById('note-input');
const saveBtn    = document.getElementById('save-btn');
const errorMsg   = document.getElementById('error-msg');
const viewForm   = document.getElementById('view-form');
const viewSuccess = document.getElementById('view-success');
const successSub = document.getElementById('success-sub');
const openRilBtn = document.getElementById('open-ril-btn');
const closeBtn   = document.getElementById('close-btn');

// Pre-fill URL from active tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.url) {
    urlInput.value = tab.url;
  }
});

async function save() {
  const url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }

  errorMsg.classList.add('hidden');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const note = noteInput.value.trim() || undefined;
    const res = await fetch(`${API}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, note }),
    });

    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();

    successSub.textContent = data.duplicate
      ? 'This URL is already in your vault.'
      : 'Article extracted and saved.';

    viewForm.classList.add('hidden');
    viewSuccess.classList.remove('hidden');

  } catch {
    errorMsg.classList.remove('hidden');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

saveBtn.addEventListener('click', save);

[urlInput, noteInput].forEach((el) => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
  });
});

openRilBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://newtab' });
  window.close();
});

closeBtn.addEventListener('click', () => window.close());
