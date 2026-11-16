import { descriptionToText } from './description-excerpt';

/**
 * Lays an imported vacancy's description out in our own structure, with code only (no AI): a facts
 * card worked out from the text, then the sections in a fixed order (about, duties, requirements,
 * offer, other), the "how to apply" part in its own card and the data-protection small print last.
 *
 * Wording is never changed: lines are only moved as whole sections, split where portals glued items
 * together, turned into lists or label/value rows, and re-joined where a portal broke a line mid-phrase.
 */

export type SectionKind = 'about' | 'duties' | 'requirements' | 'offer' | 'other' | 'apply';

export type DescriptionBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'details'; rows: { label: string; value: string }[] };

export interface DescriptionSection {
  kind: SectionKind;
  /** The portal's own heading, without the trailing colon; null for the opening text */
  title: string | null;
  blocks: DescriptionBlock[];
}

export interface DescriptionFact {
  icon: string;
  label: string;
  value: string;
}

export interface StructuredDescription {
  facts: DescriptionFact[];
  sections: DescriptionSection[];
  /** How to apply (email, phone, link): shown in its own card at the end */
  apply: DescriptionBlock[];
  /** Data-protection notices, collapsed at the very bottom */
  legal: string[];
}

// ---------------------------------------------------------------------------------------------
// Headings

const KIND_ORDER: Record<SectionKind, number> = { about: 0, duties: 1, requirements: 2, other: 3, offer: 4, apply: 5 };

const HEADING_KINDS: [SectionKind, RegExp][] = [
  ['about', /^(ვინ ვართ|ჩვენ შესახებ|ჩვენს შესახებ|კომპანიის შესახებ|კომპანიის აღწერა|ჩვენი მისია|about\b|who we are|our (company|mission|team))/i],
  ['duties', /(მოვალეობ|ფუნქცი|პასუხისმგებლობებ|ამოცანებ|რას გააკეთებ|რას აკეთებ|სამუშაოს აღწერა|responsibilit|duties|what you('|’)?ll do|key tasks|the role|^role$|job description)/i],
  ['offer', /(გთავაზობ|სთავაზობ|შევთავაზებ|გრაფიკ|ანაზღაურებ|ადგილმდებარეობ|ლოკაცი|schedule|location|salary|ბენეფიტ|შეთავაზებ|სამუშაო პირობ|^პირობებ?$|ანაზღაურება და|რას მიიღებ|we offer|what we offer|benefits|perks|compensation)/i],
  ['requirements', /(მოთხოვნ|უნარ|კომპეტენცი|გამოცდილებ|განათლებ|თვისებ|მახასიათებ|ცოდნა|დაგჭირდება|ვის ვეძებთ|ენებ|requirement|qualification|skills|must have|nice to have|who you are|what you('|’)?ll need|experience|looking for|languages|expertise)/i],
  ['apply', /(როგორ გავაგზავნო|განაცხადის გაგზავნა|how to apply|application process|^apply|დაკავშირება|კონტაქტ)/i],
];

// A short line that names a section: an optional qualifier word, then the heading word
const HEADING_WORDS =
  'მოვალეობ|ფუნქცი|პასუხისმგებლობებ|ამოცანებ|მოთხოვნ|უნარ|კომპეტენცი|გამოცდილება|განათლება|თვისებ|მახასიათებ|გთავაზობ|ბენეფიტ|პირობებ|შეთავაზებ|ანაზღაურება|გრაფიკი|ვინ ვართ|შესახებ|დაგჭირდება|ვის ვეძებთ';
const QUALIFIERS =
  'ძირითადი|საკვალიფიკაციო|სამუშაო|პიროვნული|პერსონალური|აუცილებელი|სავალდებულო|სასურველი|კანდიდატის|ჩვენი|დამატებითი|ზოგადი|ტექნიკური|პროფესიული|რას|კომპანიის|ჩვენ|ამისთვის|საჭირო';
const GEORGIAN_HEADING = new RegExp(`^(?:(?:${QUALIFIERS})\\s+){0,3}(?:${HEADING_WORDS})`, 'i');
const ENGLISH_HEADING =
  /^(about( (us|the (company|role|team|job|position)|[A-Z][\w&.-]*))?|who we are|team|the team|role|the role|responsibilities|key responsibilities|requirements|qualifications|skills|what you('|’)?ll do|what you('|’)?ll need|what we offer|we offer|benefits|perks|nice to have|must have|preferred qualifications|job description|how to apply)$/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const endsSentence = (s: string) => /[.!?;:,)]$/.test(s);

function headingTitle(line: string): string | null {
  const text = line.replace(/\s*:\s*$/, '').trim();
  if (!text || text.length > 70 || words(text) > 7) return null;
  if (/https?:|@|\d{3}/.test(text)) return null;
  if (ENGLISH_HEADING.test(text)) return text;
  if (GEORGIAN_HEADING.test(text) && (line.trim().endsWith(':') || !/[.;,]$/.test(text))) return text;
  // English Title Case: "Job Benefits", "Skills, Knowledge & Expertise" (but not "Air freight")
  if (/^[A-Z]/.test(text) && !/[.;!?]$/.test(text) && words(text) <= 6) {
    const long = text.split(/[\s,/&]+/).filter((w) => w.length > 3);
    if (long.length && long.every((w) => /^[A-Z]/.test(w))) return text;
  }
  // Any short "Something:" line that isn't a label/value pair
  if (line.trim().endsWith(':') && words(text) <= 6) return text;
  return null;
}

function kindOf(title: string): SectionKind | null {
  for (const [kind, re] of HEADING_KINDS) if (re.test(title)) return kind;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Line clean-up

// Dashes and "+" only with a space after them: "+995 ..." and "-დან" are text
const BULLET = /^(?:[•*·▪▫●◦✓✔➤►■□✅🔹🔸👉]\s*|[-–—+]\s+)+(?=\S)/u;
const NUMBERED = /^\d{1,2}[.)]\s+(?=\S)/;

/** Portals glue items: "დაგეგმვა.ბაზარზე" (a period or semicolon straight into the next word). */
function splitGlued(line: string): string[] {
  return line
    .replace(/([ა-ჿ]{4,}[.;])(?=[ა-ჿ])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** hr.ge drops the line break after a heading: "მოვალეობებიბაღის მოვლა: ..." */
const GLUED_HEADINGS = ['ძირითადი პასუხისმგებლობები', 'სამუშაო პირობები', 'მოვალეობები', 'მოთხოვნები', 'გთავაზობთ', 'პასუხისმგებლობები'];
function splitGluedHeading(line: string): string[] {
  for (const heading of GLUED_HEADINGS) {
    if (!line.startsWith(heading)) continue;
    const rest = line.slice(heading.length);
    // "მოთხოვნების ..." is the word going on, not a new one
    if (rest.length > 15 && /^[ა-ჿ0-9A-Za-z„"]/.test(rest) && !/^[სთზშმდაცვეოუ]/.test(rest)) {
      return [heading, rest.trim()];
    }
  }
  return [line];
}

/** Links the portals repeat in brackets: "hr@x.ge (mailto:hr@x.ge?subject=)", "https://a (https://a)" */
function dropRepeats(line: string): string {
  return line
    .replace(/\s*\(mailto:[^)\s]*\)/gi, '')
    .replace(/(https?:\/\/\S+)\s*\(\1\)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const CONTINUES = /(?:,|\s(და|ან|და\/ან|რომ|რომელიც|რომლის|ხოლო|თუ|მათ შორის|როგორც|ასევე|and|or|the|of|to|with|for|in))$/i;

/** A portal broke a phrase over lines ("ძირითადი\nფუნქცია-მოვალეობები:"): put it back together. */
function shouldJoin(prev: string, next: string, inProse: boolean): boolean {
  if (BULLET.test(next) || NUMBERED.test(next)) return false;
  // "საკვალიფიკაციო" + "მოთხოვნები:" is one heading broken in two
  if (words(prev) <= 2 && !endsSentence(prev) && !headingTitle(prev) && next.endsWith(':') && headingTitle(next)) return true;
  if (headingTitle(prev) || headingTitle(next)) return false;
  if (CONTINUES.test(prev)) return true;
  if (/[-‐]$/.test(prev) && !/\s[-–]$/.test(prev)) return true;
  if (!inProse) return false;
  if (endsSentence(prev)) return false;
  return words(prev) <= 2 || (words(next) <= 2 && /[.,;:]$/.test(next));
}

// ---------------------------------------------------------------------------------------------
// Special paragraphs

const APPLY_HINT =
  /(გამოაგზავნ|გამოგვიგზავნ|გადმოგვიგზავნ|გადმოგვიგზვან|გადმოგზავნ|გამოგზავნ|მოგვწერეთ|დაგვიკავშირდ|დაინტერესებულ|დაინტერესების შემთხვევაში|დაინტერესბულ|send (us )?(your )?(cv|resume)|apply (here|via|at|through|now|by)|to apply|ეწვიეთ ბმულს|რეზიუმეს გადმოსაგზავნად)/i;
const CONTACT = /(@|https?:\/\/|\b5\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b|\+995|\bcv\b|რეზიუმე)/i;
const LEGAL = /(პერსონალურ(ი|ს)? მონაცემ|პერსონალურ მონაცემთა|personal data|data protection|კონფიდენციალურობ)/i;

const CONSENT = /(თანხმობ|თანახმა|ამუშავებ|დამუშავებ|დაამუშაო|ინახება|შენახვ|consent|process(ed|ing)? (your|the)|retain)/i;

/**
 * Where the data-protection notice starts in a paragraph (they come last), or -1. The notice must read
 * like one (consent/processing words) and be long, so a data officer's duties aren't taken for it.
 */
function legalStart(lines: Line[]): number {
  // Not a list item ("პერსონალური მონაცემების დაცვის კონტროლი;" is a duty)
  const start = lines.findIndex((l) => LEGAL.test(l.text) && !l.bullet && !/;$/.test(l.text));
  if (start < 0) return -1;
  const tail = lines.slice(start);
  if (tail.some((l) => headingTitle(l.text))) return -1;
  const text = tail.map((l) => l.text).join(' ');
  return text.length > 140 && (CONSENT.test(text) || text.length > 300) ? start : -1;
}

/**
 * Descriptions that arrive as one long line ("... ბათუმში მოვალეობები: ნაღდი ფულის მიღება ..."):
 * break before the headings inside them so they get sections like the rest.
 */
const INLINE_HEADING = new RegExp(`\\s(?=(?:(?:${QUALIFIERS})\\s+){0,3}(?:${HEADING_WORDS})[^\\s:]*(?:\\s+[^\\s:]+){0,3}\\s?:\\s?\\S)`, 'g');
// "... 40 საათიანი სამუშაო კვირა. დაინტერესების შემთხვევაში, გთხოვთ ..." - the apply part starts here
const INLINE_APPLY = /\s(?=დაინტერეს\S*\s+(?:შემთხვევაში|პირებ|პირთ|კანდიდატებ))/g;
function splitLongLine(line: string): string[] {
  if (line.length < 120) return [line];
  return line
    .split(INLINE_HEADING)
    .flatMap((part) => part.split(INLINE_APPLY))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "საბუღალტრო აღრიცხვა; საგადასახადო დეკლარაციები; ..." - items on one line, split on the semicolons */
function splitItems(text: string): string[] {
  const parts = text.split(/(?<=;)\s*(?:\*\*\s*)?(?=\S)|\s+\*\*\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 3 ? parts : [text];
}

/**
 * awork.ge copies text out of Word with its line wraps: "მომხმარებლებისთვის\nკონსულტაციის ...\nშეთავაზება;".
 * Join an unfinished line up to the next one that ends an item or sentence (within a few lines), and
 * leave it alone when none does, so an unpunctuated list stays a list.
 */
function joinWrapped(lines: Line[]): Line[] {
  const out: Line[] = [];
  const ends = (s: string) => /[.;:!?]$/.test(s);
  for (let i = 0; i < lines.length; i++) {
    const line = { ...lines[i] };
    if (!ends(line.text) && !line.bullet && /^[ა-ჿ„"«(]/.test(line.text) && !(words(line.text) > 1 && headingTitle(line.text))) {
      let j = i + 1;
      while (j < lines.length && j - i <= 4 && !lines[j].bullet && !ends(lines[j].text)) j++;
      if (j < lines.length && j - i <= 4 && !lines[j].bullet && ends(lines[j].text)) {
        line.text = lines
          .slice(i, j + 1)
          .map((l) => l.text)
          .join(' ');
        i = j;
      }
    }
    out.push(line);
  }
  return out;
}

/** "სამუშაო გრაფიკი: სრული" → a label/value row */
function asRow(line: string): { label: string; value: string } | null {
  const m = /^([^:]{2,40}?)\s*:\s*(.+)$/.exec(line);
  if (!m) return null;
  const [, label, value] = m;
  if (words(label) > 4 || /https?$|mailto$|subject/i.test(label) || /\d/.test(label)) return null;
  if (value.length > 160) return null;
  return { label: label.trim(), value: value.trim().replace(/;$/, '') };
}

// ---------------------------------------------------------------------------------------------
// Facts

const LANGUAGES: [RegExp, string][] = [
  [/ინგლისურ|\benglish\b/i, 'ინგლისური'],
  [/რუსულ|\brussian\b/i, 'რუსული'],
  [/გერმანულ|\bgerman\b/i, 'გერმანული'],
  [/ფრანგულ|\bfrench\b/i, 'ფრანგული'],
  [/თურქულ|\bturkish\b/i, 'თურქული'],
  [/იტალიურ|\bitalian\b/i, 'იტალიური'],
  [/ესპანურ|\bspanish\b/i, 'ესპანური'],
  [/ჩინურ|\bchinese\b/i, 'ჩინური'],
  [/არაბულ|\barabic\b/i, 'არაბული'],
  [/ებრაულ|\bhebrew\b/i, 'ებრაული'],
  [/აზერბაიჯანულ|\bazerbaijani\b/i, 'აზერბაიჯანული'],
  [/სომხურ|\barmenian\b/i, 'სომხური'],
  [/ბერძნულ|\bgreek\b/i, 'ბერძნული'],
  [/პოლონურ|\bpolish\b/i, 'პოლონური'],
];

function experience(text: string): string | null {
  if (/გამოცდილების გარეშე|გამოცდილება არ არის (სავალდებულო|აუცილებელი)|no (prior )?experience (required|needed)/i.test(text)) {
    return 'გამოცდილების გარეშე';
  }
  const ka = /(?:მინ(?:იმუმ|\.)?\s*)?(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?\s*\+?\s*(?:-?\s*)?(?:წლიან|წლის|წელზე მეტ|წელი)\S*\s+(?:\S+\s+){0,3}?გამოცდილ/i.exec(text);
  if (ka) return ka[2] ? `${ka[1]}–${ka[2]} წელი` : `${ka[1]}+ წელი`;
  const months = /(?:მინ(?:იმუმ|\.)?\s*)?(\d{1,2})\s*-?\s*თვიან\S*\s+(?:\S+\s+){0,2}?გამოცდილ/i.exec(text);
  if (months) return `${months[1]}+ თვე`;
  const en = /(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\+?\s*years?(?:\s+of)?(?:\s+\S+){0,3}?\s+experience/i.exec(text);
  if (en) return en[2] ? `${en[1]}–${en[2]} წელი` : `${en[1]}+ წელი`;
  return null;
}

function hours(text: string): string | null {
  const m = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:სთ\.?|საათ\S*)?\s*(?:-?დან)?\s*(?:[-–—]|მდე|to|until)?\s*([01]?\d|2[0-3])[:.]([0-5]\d)/i.exec(text);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}–${m[3].padStart(2, '0')}:${m[4]}`;
}

export function descriptionFacts(text: string): DescriptionFact[] {
  const facts: DescriptionFact[] = [];
  const add = (icon: string, label: string, value: string | null | undefined) => {
    if (value) facts.push({ icon, label, value });
  };

  // LinkedIn's header: "Seniority level: ... | Employment type: Full-time | Industries: ..."
  const linkedInType = /Employment type:\s*([^|]{1,30})/i.exec(text)?.[1].trim();

  const fullTime = /სრული განაკვეთ|სრული გრაფიკ|სრულ განაკვეთზე|(გრაფიკი|დასაქმება)\s*[:-]\s*სრული|full[\s-]?time/i.test(text) || /^full-time$/i.test(linkedInType ?? '');
  const partTime = /ნახევარ(ი)? განაკვეთ|არასრული (გრაფიკ|განაკვეთ)|გრაფიკი\s*[:-]\s*არასრული|part[\s-]?time/i.test(text) || /^part-time$/i.test(linkedInType ?? '');
  const internship = /სტაჟირებ|სტაჟიორ|internship|\bintern\b/i.test(text) || /^internship$/i.test(linkedInType ?? '');
  add(
    'work_history',
    'დასაქმება',
    [internship && 'სტაჟირება', fullTime && 'სრული განაკვეთი', partTime && 'ნახევარი განაკვეთი'].filter(Boolean).join(' · ') || null,
  );

  const format = /ჰიბრიდ|hybrid/i.test(text)
    ? 'ჰიბრიდული'
    : /დისტანციურ|remote|სახლიდან მუშაობ|work from home/i.test(text)
      ? 'დისტანციური'
      : null;
  add('home_work', 'ფორმატი', format);

  // "5/2", "2/2": work days / days off ("1/2 განაკვეთი" is a fraction, not a schedule)
  const days = /(?<![\d/.,])([2-7])\s*\/\s*([1-5])(?![\d/]|[.,]\d)(?!\s*განაკვეთ)/.exec(text);
  const dayPattern = days && Number(days[1]) >= Number(days[2]) && Number(days[1]) + Number(days[2]) <= 7 ? `${days[1]}/${days[2]}` : null;
  const shifts = /ცვლებ|ცვლაში|ცვლის|ღამის ცვლ|shifts?\b/i.test(text);
  add(
    'schedule',
    'გრაფიკი',
    [dayPattern, hours(text), shifts ? 'ცვლებით' : null]
      .filter(Boolean)
      .join(' · ') || null,
  );

  add('workspace_premium', 'გამოცდილება', experience(text));

  const languages = LANGUAGES.filter(([re]) => re.test(text)).map(([, name]) => name);
  add('translate', 'ენები', languages.length ? languages.join(', ') : null);

  const education = /უმაღლეს(ი)? (\S+ )?განათლ|bachelor|master'?s degree|university degree/i.test(text)
    ? 'უმაღლესი'
    : /პროფესიულ(ი)? განათლ|vocational/i.test(text)
      ? 'პროფესიული'
      : null;
  add('school', 'განათლება', education);

  const licence = /მართვის მოწმობ\S*\s*(?:\S+\s+){0,2}?["„“]?([ABCDE]1?(?:\s*,\s*[ABCDE]1?)*)\b/.exec(text)?.[1];
  add('directions_car', 'მართვის მოწმობა', licence ? licence.replace(/\s+/g, '') : /მართვის მოწმობ|driving licen[cs]e|driver'?s licen[cs]e/i.test(text) ? 'საჭიროა' : null);

  const perks = [
    // Georgian letters aren't \w, so "(?![ა-ჰ])" stands in for \b ("პრემიუმ" is a brand, not a bonus)
    /ბონუს|პრემი(ა|ებ|ით|ას|ის)(?![ა-ჰ])|bonus/i.test(text) && 'ბონუსი',
    // Insurance as a perk, not an insurance-sales vacancy
    /(ჯანმრთელობის|სამედიცინო|კორპორატიული) დაზღვევ|დაზღვევით უზრუნველ|health insurance|medical insurance/i.test(text) && 'დაზღვევა',
    /ტრანსპორტირებ\S* (უზრუნველ|კომპანია)|(უზრუნველყოფს|კომპანია უზრუნველყოფს) \S*\s*ტრანსპორტ|ტრანსპორტით უზრუნველ|transport(ation)? (is )?provided/i.test(text) && 'ტრანსპორტი',
    // Meals as a perk ("კვების მრეწველობა" is an industry)
    /(ერთჯერად|ორჯერად|უფასო|სრული)\S*\s+კვებ|კვებით უზრუნველ|კვება უფასოა|free (meals|lunch)/i.test(text) && 'კვება',
    /ტრენინგ|training/i.test(text) && 'ტრენინგები',
    /კარიერულ(ი)? (წინსვლ|ზრდ|განვითარ)|career growth/i.test(text) && 'კარიერული ზრდა',
  ].filter((p): p is string => !!p);
  add('redeem', 'ბენეფიტები', perks.length ? perks.join(', ') : null);

  return facts;
}

// ---------------------------------------------------------------------------------------------
// Structure

interface Line {
  text: string;
  bullet: boolean;
}

function toLines(raw: string, wrapped: boolean): Line[][] {
  const text = descriptionToText(raw)
    // LinkedIn's header line: its parts are in the facts card
    .replace(/^Seniority level:[^\n]*\|[^\n]*\n?/im, '');

  const paragraphs: Line[][] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines: Line[] = [];
    for (const original of chunk.split('\n').flatMap((l) => splitLongLine(dropRepeats(l)))) {
      for (const piece of splitGluedHeading(original)) {
        const bullet = BULLET.test(piece) || NUMBERED.test(piece);
        const clean = piece.replace(BULLET, '').replace(NUMBERED, '').trim();
        if (!clean) continue;
        const parts = splitGlued(clean);
        parts.forEach((p) => lines.push({ text: p, bullet: bullet || parts.length > 2 }));
      }
    }
    if (lines.length) paragraphs.push(wrapped ? joinWrapped(lines) : lines);
  }
  return paragraphs;
}

/** Turns a section's lines into blocks: label/value rows, lists, paragraphs. */
function toBlocks(lines: Line[], listy: boolean): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  const push = (block: DescriptionBlock) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === 'list' && block.type === 'list') last.items.push(...block.items);
    else if (last?.type === 'details' && block.type === 'details') last.rows.push(...block.rows);
    else blocks.push(block);
  };

  // Several short lines in a duties/requirements/offer section are a list even without bullets
  const asList = listy && lines.length > 1;
  for (const line of lines) {
    const items = listy ? splitItems(line.text) : [line.text];
    if (items.length > 1) {
      push({ type: 'list', items });
      continue;
    }
    const row = !line.bullet || !asList ? asRow(line.text) : null;
    if (row && words(line.text) <= 22) push({ type: 'details', rows: [row] });
    // "...;" lines are items wherever they are
    else if (line.bullet || asList || (lines.length > 1 && /;$/.test(line.text))) push({ type: 'list', items: [line.text] });
    else push({ type: 'paragraph', text: line.text });
  }
  return blocks;
}

/** `source`: the portal's host ("awork.ge", ...), for its quirks: awork.ge keeps Word's line wraps. */
export function structureDescription(raw: string | null | undefined, source?: string | null): StructuredDescription | null {
  if (!raw || !raw.trim()) return null;
  const plain = descriptionToText(raw);
  const paragraphs = toLines(raw, /awork\.ge/i.test(source ?? ''));
  if (!paragraphs.length) return null;

  const { multiPosition, ...result } = build(plain, paragraphs, false);
  if (!multiPosition) return result;

  // Several positions in one posting ("მზარეული ... მიმტანი ..."), each with its own duties and
  // requirements: moving sections would mix them up, so keep the portal's order. The hours and
  // experience differ per position, so the facts card leaves those out.
  const { multiPosition: _, ...kept } = build(plain, paragraphs, true);
  return { ...kept, facts: kept.facts.filter((f) => f.label !== 'გრაფიკი' && f.label !== 'გამოცდილება') };
}

interface Draft {
  kind: SectionKind;
  title: string | null;
  lines: Line[];
}

function build(plain: string, paragraphs: Line[][], keepOrder: boolean): StructuredDescription & { multiPosition: boolean } {
  const drafts: Draft[] = [{ kind: 'about', title: null, lines: [] }];
  const apply: Line[] = [];
  const legal: string[] = [];
  let inApply = false;

  let lineNo = 0;
  for (const paragraph of paragraphs) {
    // Re-join phrases broken over lines
    const joined: Line[] = [];
    const current = drafts[drafts.length - 1];
    let inProse = current.kind === 'about' || current.kind === 'other';
    for (const line of paragraph) {
      const prev = joined[joined.length - 1];
      // Below a heading in this paragraph come its items, not prose
      if (prev && !prev.bullet && headingTitle(prev.text)) inProse = kindOf(headingTitle(prev.text)!) === 'about';
      if (prev && !line.bullet && shouldJoin(prev.text, line.text, inProse && !prev.bullet)) {
        // A word hyphenated over the break ("ფუნქცია-\nმოვალეობები") goes back together without a space
        prev.text = /\S[-‐]$/.test(prev.text) ? `${prev.text}${line.text}` : `${prev.text} ${line.text}`;
      } else {
        joined.push({ ...line });
      }
    }

    // The data-protection notice at the end of a paragraph goes to the small print
    const cut = legalStart(joined);
    if (cut >= 0) legal.push(joined.splice(cut).map((l) => l.text).join(' '));

    for (const line of joined) {
      const title = !line.bullet ? headingTitle(line.text) : null;
      if (title && !asRow(line.text)?.value) {
        const kind = kindOf(title) ?? drafts[drafts.length - 1].kind;
        inApply = kind === 'apply' && !keepOrder;
        if (inApply) continue;
        drafts.push({ kind: kind === 'apply' ? 'other' : kind, title, lines: [] });
        continue;
      }

      // "მოთხოვნები: კომუნიკაბელურობა, ..." - a heading with its content on the same line
      const inline = /^([^:]{3,45}):\s*(.{40,})$/.exec(line.text);
      const inlineTitle = inline && !line.bullet ? headingTitle(`${inline[1]}:`) : null;
      const inlineKind = inlineTitle ? kindOf(inlineTitle) : null;
      if (inline && inlineKind && inlineKind !== 'apply' && inlineKind !== 'about' && words(inline[2]) > 6) {
        drafts.push({ kind: inlineKind, title: inlineTitle, lines: [{ text: inline[2], bullet: false }] });
        inApply = false;
        continue;
      }

      // The first paragraph introduces the vacancy even when it names an address
      const applyLine = !keepOrder && lineNo++ > 0 && APPLY_HINT.test(line.text) && CONTACT.test(line.text);
      if (applyLine) inApply = true;
      if (inApply) {
        apply.push(line);
        continue;
      }
      drafts[drafts.length - 1].lines.push(line);
    }
  }

  const kept = drafts.filter((d) => d.lines.length);

  // A kind coming back after another one ("duties, requirements, duties, ...") means several positions
  const seen = new Set<SectionKind>();
  let multiPosition = false;
  let previous: SectionKind | null = null;
  for (const { kind } of kept) {
    if (kind === 'about' || kind === 'other') continue;
    if (kind !== previous && seen.has(kind)) multiPosition = true;
    seen.add(kind);
    previous = kind;
  }

  const ordered = keepOrder
    ? kept
    : kept
        .map((d, i) => ({ ...d, order: i }))
        .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.order - b.order);

  return {
    facts: descriptionFacts(plain.replace(/\s+/g, ' ')),
    sections: ordered.map(({ kind, title, lines }) => ({
      kind,
      title,
      blocks: toBlocks(lines, kind === 'duties' || kind === 'requirements' || kind === 'offer'),
    })),
    apply: toBlocks(apply, false),
    legal,
    multiPosition,
  };
}
