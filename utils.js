/**
 * Shared utilities for arXiv Paper Downloader
 * Used by content.js, popup.js, and background.js
 */

const DEFAULT_SETTINGS = {
  formatPattern: '{author}-{year}-{title}',
  colonReplacement: '\u2014', // em dash
  spaceHandling: 'keep',     // keep | underscore | hyphen | dot
  titleCase: 'original',     // original | lowercase | titlecase
  maxTitleLength: 0,          // 0 = unlimited
  saveAs: false,
  autoRename: true
};

/**
 * Parse an author string into surname and full name.
 * Handles both "Surname, Firstname" (citation_author) and "Firstname Lastname" formats.
 */
function parseAuthor(authorStr) {
  if (!authorStr) return { surname: '', full: '' };
  const trimmed = authorStr.trim();
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',');
    return {
      surname: parts[0].trim(),
      full: parts.reverse().map(s => s.trim()).join(' ')
    };
  } else {
    const parts = trimmed.split(/\s+/);
    return {
      surname: parts[parts.length - 1],
      full: trimmed
    };
  }
}

/**
 * Build the filename from metadata and settings.
 * @param {Object} metadata - { title, authors[], date, arxivId, category }
 * @param {Object} settings - user settings (merged with DEFAULT_SETTINGS)
 * @returns {string} filename with .pdf extension
 */
function buildFilename(metadata, settings) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings);

  // Authors
  let authorSurname = '';
  let authorFull = '';
  let allAuthorsSurnames = '';

  if (metadata.authors && metadata.authors.length > 0) {
    const first = parseAuthor(metadata.authors[0]);
    authorSurname = first.surname;
    authorFull = first.full;
    allAuthorsSurnames = metadata.authors.map(a => parseAuthor(a).surname).join(', ');
  }

  // Date
  let year = '';
  let month = '';
  if (metadata.date) {
    const parts = metadata.date.split('/');
    year = parts[0] || '';
    month = parts.length > 1 ? parts[1].padStart(2, '0') : '';
  }

  // Title
  let title = metadata.title || '';
  title = title.replace(/:/g, s.colonReplacement);

  switch (s.spaceHandling) {
    case 'underscore': title = title.replace(/\s+/g, '_'); break;
    case 'hyphen':     title = title.replace(/\s+/g, '-'); break;
    case 'dot':        title = title.replace(/\s+/g, '.'); break;
  }

  switch (s.titleCase) {
    case 'lowercase': title = title.toLowerCase(); break;
    case 'titlecase':
      title = title.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
      break;
  }

  if (s.maxTitleLength > 0 && title.length > s.maxTitleLength) {
    title = title.substring(0, s.maxTitleLength).trim();
  }

  // Token replacement
  let filename = s.formatPattern
    .replace(/\{author\}/g, authorSurname)
    .replace(/\{authorFull\}/g, authorFull)
    .replace(/\{allAuthors\}/g, allAuthorsSurnames)
    .replace(/\{year\}/g, year)
    .replace(/\{month\}/g, month)
    .replace(/\{title\}/g, title)
    .replace(/\{arxivId\}/g, metadata.arxivId || '')
    .replace(/\{category\}/g, metadata.category || '');

  // Remove characters invalid in filenames
  filename = filename.replace(/[/\\?*<>|"]/g, '');

  return filename + '.pdf';
}
