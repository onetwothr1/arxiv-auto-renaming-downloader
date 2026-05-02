/**
 * Content script — runs on arxiv.org/abs/* pages.
 * Extracts paper metadata, caches it for PDF page use, and responds to popup.
 */
(function () {
  'use strict';

  /** Extract metadata from arXiv abstract page meta tags (with DOM fallbacks). */
  function extractMetadata() {
    const m = {};

    // Title
    const titleMeta = document.querySelector('meta[name="citation_title"]');
    if (titleMeta) {
      m.title = titleMeta.content;
    } else {
      const el = document.querySelector('#abs > h1');
      if (el) m.title = el.textContent.replace(/^Title:\s*/i, '').trim();
    }

    // Authors (citation_author format: "Surname, Firstname")
    const authorMetas = document.querySelectorAll('meta[name="citation_author"]');
    m.authors = [];
    authorMetas.forEach(meta => m.authors.push(meta.content));
    if (m.authors.length === 0) {
      document.querySelectorAll('div.authors a').forEach(a => m.authors.push(a.textContent.trim()));
    }

    // Date (YYYY/MM/DD)
    const dateMeta = document.querySelector('meta[name="citation_date"]');
    if (dateMeta) {
      m.date = dateMeta.content;
    } else {
      const idMatch = location.pathname.match(/\/abs\/(\d{4})/);
      if (idMatch) {
        const yymm = idMatch[1];
        m.date = '20' + yymm.slice(0,2) + '/' + yymm.slice(2,4);
      }
    }

    // arXiv ID (strip version) + PDF URL
    const absMatch = location.pathname.match(/\/abs\/(.+)/);
    if (absMatch) {
      const paperId = absMatch[1].replace(/v\d+$/, '');
      m.pdfUrl = 'https://arxiv.org/pdf/' + paperId + '.pdf';
      m.arxivId = paperId;
    }

    // Primary category
    const subj = document.querySelector('span.primary-subject');
    if (subj) {
      const catMatch = subj.textContent.match(/\(([^)]+)\)/);
      if (catMatch) m.category = catMatch[1];
    }

    return m;
  }

  // ---- Cache metadata for use on PDF pages ----
  const metadata = extractMetadata();
  if (metadata.arxivId) {
    const key = 'paper_' + metadata.arxivId;
    chrome.storage.local.set({ [key]: metadata });
    console.log('[arXiv Downloader] Cached metadata for', metadata.arxivId);
  }

  // ---- Download via fetch + blob + a[download] ----
  async function downloadWithName(url, filename) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error('[arXiv Downloader] Blob download failed:', err);
    }
  }

  // ---- Respond to messages from popup ----
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'getMetadata') {
      sendResponse(extractMetadata());
    }
    if (msg.type === 'triggerDownload') {
      const md = extractMetadata();
      const settings = msg.settings || {};
      const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, settings);
      const filename = buildFilename(md, mergedSettings);
      downloadWithName(md.pdfUrl, filename);
      sendResponse({ ok: true });
    }
    return true;
  });

  console.log('[arXiv Downloader] Content script loaded on', location.href);
})();
