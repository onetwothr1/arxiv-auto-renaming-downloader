/**
 * Popup script — loads metadata, manages settings, handles download.
 */
(function () {
  'use strict';

  // DOM refs
  const notArxiv      = document.getElementById('notArxiv');
  const main          = document.getElementById('main');
  const paperTitle    = document.getElementById('paperTitle');
  const paperAuthors  = document.getElementById('paperAuthors');
  const badgeYear     = document.getElementById('badgeYear');
  const badgeId       = document.getElementById('badgeId');
  const badgeCat      = document.getElementById('badgeCat');
  const formatInput   = document.getElementById('formatInput');
  const previewText   = document.getElementById('previewText');
  const colonInput    = document.getElementById('colonInput');
  const spaceSelect   = document.getElementById('spaceSelect');
  const caseSelect    = document.getElementById('caseSelect');
  const maxLenInput   = document.getElementById('maxLenInput');
  const saveAsCheck   = document.getElementById('saveAsCheck');
  const autoRenameCheck = document.getElementById('autoRenameCheck');
  const downloadBtn   = document.getElementById('downloadBtn');

  let currentMetadata = null;

  // ---- Init ----
  async function init() {
    // Load saved settings
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    applySettingsToUI(settings);

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.match(/arxiv\.org\/abs\//)) {
      notArxiv.style.display = 'block';
      main.style.display = 'none';
      return;
    }

    // Request metadata from content script
    try {
      const metadata = await chrome.tabs.sendMessage(tab.id, { type: 'getMetadata' });
      if (metadata && metadata.title) {
        currentMetadata = metadata;
        renderPaperInfo(metadata);
        main.style.display = 'block';
        updatePreview();
      } else {
        notArxiv.style.display = 'block';
      }
    } catch (err) {
      // Content script not injected yet — show notice
      notArxiv.style.display = 'block';
    }
  }

  function applySettingsToUI(s) {
    formatInput.value    = s.formatPattern || DEFAULT_SETTINGS.formatPattern;
    colonInput.value     = s.colonReplacement || DEFAULT_SETTINGS.colonReplacement;
    spaceSelect.value    = s.spaceHandling || DEFAULT_SETTINGS.spaceHandling;
    caseSelect.value     = s.titleCase || DEFAULT_SETTINGS.titleCase;
    maxLenInput.value    = s.maxTitleLength || '';
    saveAsCheck.checked  = !!s.saveAs;
    autoRenameCheck.checked = s.autoRename !== false; // default true
  }

  function renderPaperInfo(m) {
    paperTitle.textContent = m.title || 'Untitled';
    paperTitle.title = m.title || '';

    // Authors: convert "Surname, First" to "First Surname" for display
    if (m.authors && m.authors.length > 0) {
      const displayNames = m.authors.map(a => {
        if (a.includes(',')) return a.split(',').reverse().map(s => s.trim()).join(' ');
        return a;
      });
      const maxShow = 3;
      let text = displayNames.slice(0, maxShow).join(', ');
      if (displayNames.length > maxShow) text += ' et al.';
      paperAuthors.textContent = text;
      paperAuthors.title = displayNames.join(', ');
    }

    // Badges
    if (m.date) {
      const year = m.date.split('/')[0];
      badgeYear.textContent = year;
    }
    if (m.arxivId) badgeId.textContent = m.arxivId;
    if (m.category) {
      badgeCat.textContent = m.category;
      badgeCat.style.display = 'inline-block';
    }
  }

  // ---- Settings helpers ----
  function gatherSettings() {
    return {
      formatPattern:    formatInput.value || DEFAULT_SETTINGS.formatPattern,
      colonReplacement: colonInput.value,
      spaceHandling:    spaceSelect.value,
      titleCase:        caseSelect.value,
      maxTitleLength:   parseInt(maxLenInput.value) || 0,
      saveAs:           saveAsCheck.checked,
      autoRename:       autoRenameCheck.checked
    };
  }

  async function saveSettings() {
    const settings = gatherSettings();
    await chrome.storage.sync.set(settings);
  }

  function updatePreview() {
    if (!currentMetadata) return;
    const settings = gatherSettings();
    const filename = buildFilename(currentMetadata, settings);
    previewText.textContent = filename;
  }

  // ---- Event listeners ----
  // Live preview on any settings change
  [formatInput, colonInput, maxLenInput].forEach(el =>
    el.addEventListener('input', () => { updatePreview(); saveSettings(); })
  );
  [spaceSelect, caseSelect].forEach(el =>
    el.addEventListener('change', () => { updatePreview(); saveSettings(); })
  );
  [saveAsCheck, autoRenameCheck].forEach(el =>
    el.addEventListener('change', () => { saveSettings(); })
  );

  // Token hint click-to-insert
  document.querySelectorAll('.token-hint code').forEach(code => {
    code.addEventListener('click', () => {
      const token = code.textContent;
      const pos = formatInput.selectionStart;
      const val = formatInput.value;
      formatInput.value = val.slice(0, pos) + token + val.slice(pos);
      formatInput.focus();
      formatInput.selectionStart = formatInput.selectionEnd = pos + token.length;
      updatePreview();
      saveSettings();
    });
  });

  // Download button — trigger download via content script (fetch+blob for reliable renaming)
  downloadBtn.addEventListener('click', async () => {
    if (!currentMetadata) return;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading…';

    const settings = gatherSettings();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'triggerDownload',
        settings
      });
    } catch (err) {
      // Fallback: use background service worker
      console.error('Content script download failed, using background:', err);
      await chrome.runtime.sendMessage({
        type: 'downloadPdf',
        metadata: currentMetadata,
        settings
      });
    }

    setTimeout(() => {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download PDF`;
    }, 1500);
  });

  init();
})();
