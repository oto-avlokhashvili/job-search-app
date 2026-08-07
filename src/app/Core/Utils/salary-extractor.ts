export function extractSalary(job: any): string {
  if (!job) return 'შეთანხმებით';

  const existingSalary = job.salaryRange?.trim();
  if (existingSalary && existingSalary !== 'შეთანხმებით' && existingSalary !== 'არ არის მითითებული' && existingSalary.toLowerCase() !== 'n/a') {
    return ensureCurrency(existingSalary);
  }

  const rawText = `${job.description || ''} ${job.requirements || ''} ${job.vacancy || ''}`;
  if (!rawText.trim()) return ensureCurrency(existingSalary) || 'შეთანხმებით';

  const cleanText = rawText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ');

  const matches: string[] = [];

  // Number pattern supporting numbers with or without commas: e.g. 1300, 1500, 1,500, 500, 25000
  const numPattern = `(?:\\d{1,3}(?:[,\\.]\\d{3})+|\\d{1,6})(?:\\.\\d+)?`;
  const numWithPlus = `${numPattern}(?:-(?:დან|მდე))?\\s*\\+?`;
  const rangePattern = `${numWithPlus}(?:(?:\\s*[-–—]\\s*|\\s+(?:[-–—]|დან|მდე)?\\s*)(?:[\\$₾€]\\s*)?${numWithPlus})?`;
  const currencyUnits = `(?:[\\$₾€]|GEL|USD|EUR|ლარი|ლარამდე|ლარიდან|ლარს|ლარის|დოლარი|დოლარს)`;

  // 1. Keyword search (e.g. ფიქსირებული ანაზღაურება: 500 – 700$, ანაზღაურება: 1300 ლარი, ანაზღაურება: 800+ ლარი)
  const keywordRegex = /(?:ხელფასი|ანაზღაურება|სარგო|შემოსავალი)[:\s\-\—]+([^\.\n;<>]+?)(?=\n|\r|\.|\;|<|$|ბონუსი|პროფესიული|მოთხოვნები|მოვალეობები|სამუშაო|კარიერული)/gi;
  const subCurrencyRegex = new RegExp(
    `(?:[\\$₾€]\\s*${rangePattern}|${rangePattern}\\s*${currencyUnits}?)`,
    'gi'
  );

  let kMatch;
  while ((kMatch = keywordRegex.exec(cleanText)) !== null) {
    const matchText = kMatch[1].trim();
    const subCurrency = matchText.match(subCurrencyRegex);
    if (subCurrency) {
      for (const sub of subCurrency) {
        const candidate = sub.trim();
        if (isValidSalaryCandidate(candidate)) {
          const formatted = ensureCurrency(candidate);
          if (!matches.includes(formatted)) {
            matches.push(formatted);
          }
        }
      }
    }
  }

  // 2. Direct currency pattern matching
  if (matches.length === 0) {
    const generalCurrencyRegex = new RegExp(
      `(?:[\\$₾€]\\s*${rangePattern}|${rangePattern}\\s*${currencyUnits})`,
      'gi'
    );
    let gMatch;
    while ((gMatch = generalCurrencyRegex.exec(cleanText)) !== null) {
      const candidate = gMatch[0].trim();
      if (isValidSalaryCandidate(candidate)) {
        const formatted = ensureCurrency(candidate);
        if (!matches.includes(formatted)) {
          matches.push(formatted);
        }
      }
    }
  }

  if (matches.length > 0) {
    return matches.slice(0, 2).join(' / ');
  }

  return ensureCurrency(existingSalary) || 'შეთანხმებით';
}

function isValidSalaryCandidate(candidate: string): boolean {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  // Ignore shift schedule patterns like 5/2, 1/2, 2/2, 6/1
  if (/\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(trimmed)) {
    return false;
  }

  // Ignore percentages like 30%
  if (/%/.test(trimmed)) {
    return false;
  }

  const hasCurrency = /[\$₾€]|GEL|USD|EUR|ლარი|ლარამდე|ლარიდან|ლარს|ლარის|დოლარი|დოლარს/i.test(trimmed);

  const numMatches = trimmed.match(/\d+/g);
  if (!numMatches) return false;

  const numbers = numMatches.map(n => parseInt(n, 10));

  if (hasCurrency) {
    // If currency is explicitly specified, filter out single digit schedule noise (e.g. 1, 2, 5 from schedule lines)
    return numbers.some(n => n >= 10);
  } else {
    // If NO currency is specified, require numbers to be >= 100 to avoid capturing schedule items (e.g. 5/2, 8 hours, 1 day, 2 days off)
    return numbers.every(n => n >= 100);
  }
}

function ensureCurrency(salaryStr: string | undefined): string {
  if (!salaryStr) return '';
  const trimmed = salaryStr.trim();
  if (!trimmed) return trimmed;

  const hasCurrency = /[\$₾€]|GEL|USD|EUR|ლარი|ლარამდე|ლარიდან|ლარს|ლარის|დოლარი|დოლარს/i.test(trimmed);
  if (!hasCurrency && /\d/.test(trimmed)) {
    return `${trimmed} ლარი`;
  }
  return trimmed;
}
