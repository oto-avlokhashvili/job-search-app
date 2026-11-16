import { descriptionFacts, structureDescription, StructuredDescription } from './vacancy-description';

const titles = (d: StructuredDescription | null) => d!.sections.map((s) => `${s.kind}:${s.title ?? ''}`);
const allText = (d: StructuredDescription | null) => JSON.stringify(d);

describe('structureDescription', () => {
  it('puts the sections in a fixed order without changing a word', () => {
    const d = structureDescription(
      [
        'კომპანია აცხადებს ვაკანსიას ოპერატორის პოზიციაზე.',
        '',
        'ჩვენ გთავაზობთ:',
        '** მეგობრულ გარემოს;',
        '** ტრენინგებს;',
        '',
        'საკვალიფიკაციო მოთხოვნები:',
        '** საოფისე პროგრამების ცოდნა;',
        '** გუნდური მუშაობის უნარი;',
        '',
        'ძირითადი მოვალეობები:',
        '** ზარებზე პასუხი;',
        '** შეკვეთების მიღება;',
      ].join('\n'),
    );
    expect(titles(d)).toEqual(['about:', 'duties:ძირითადი მოვალეობები', 'requirements:საკვალიფიკაციო მოთხოვნები', 'offer:ჩვენ გთავაზობთ']);
    expect(d!.sections[1].blocks).toEqual([{ type: 'list', items: ['ზარებზე პასუხი;', 'შეკვეთების მიღება;'] }]);
  });

  it('moves the "how to apply" part and the data-protection notice out of the text', () => {
    const d = structureDescription(
      [
        'შპს "ალფა" აცხადებს ვაკანსიას.',
        '',
        'მოთხოვნები:',
        '• გამოცდილება;',
        '',
        'დაინტერესებულ პირებს გთხოვთ, გამოაგზავნოთ რეზიუმე: hr@alfa.ge',
        '',
        'რეზიუმეს გამოგზავნით, ადასტურებთ, რომ თანახმა ხართ თქვენი პერსონალური მონაცემები კომპანიამ დაამუშაოს მონაცემთა დაცვის საერთაშორისო სტანდარტებისა და საქართველოს მოქმედი კანონმდებლობის შესაბამისად.',
      ].join('\n'),
    );
    expect(d!.apply).toEqual([{ type: 'paragraph', text: 'დაინტერესებულ პირებს გთხოვთ, გამოაგზავნოთ რეზიუმე: hr@alfa.ge' }]);
    expect(d!.legal).toHaveLength(1);
    expect(allText({ ...d!, legal: [] })).not.toContain('პერსონალური მონაცემები');
  });

  it('keeps a first paragraph that names the address where it is', () => {
    const d = structureDescription('ფიტნესი ეძებს ადმინისტრატორს. CV გამოგვიგზავნეთ: fit@gmail.com\nმოვალეობები\n• სტუმრების მიღება;');
    expect(d!.sections[0].blocks[0]).toEqual({ type: 'paragraph', text: 'ფიტნესი ეძებს ადმინისტრატორს. CV გამოგვიგზავნეთ: fit@gmail.com' });
    expect(d!.apply).toEqual([]);
  });

  it('shows "label: value" lines as rows', () => {
    const d = structureDescription('კომპანია ეძებს იურისტს.\n\nსამუშაო ადგილი: ქ. თბილისი\n\nსამუშაო გრაფიკი: სრული');
    expect(d!.sections[0].blocks[1]).toEqual({
      type: 'details',
      rows: [
        { label: 'სამუშაო ადგილი', value: 'ქ. თბილისი' },
        { label: 'სამუშაო გრაფიკი', value: 'სრული' },
      ],
    });
  });

  it('splits what hr.ge glues together', () => {
    const d = structureDescription('შესავალი ტექსტი აქ.\nმოვალეობებიბაღის მოვლა და მორწყვა.ხილის მიღება და დახარისხება.ჰიგიენის დაცვა');
    const duties = d!.sections.find((s) => s.kind === 'duties')!;
    expect(duties.title).toBe('მოვალეობები');
    expect(duties.blocks).toEqual([{ type: 'list', items: ['ბაღის მოვლა და მორწყვა.', 'ხილის მიღება და დახარისხება.', 'ჰიგიენის დაცვა'] }]);
  });

  it('splits items written on one line with semicolons', () => {
    const d = structureDescription('შესავალი.\n\nძირითადი მოვალეობები:\nაღრიცხვა; დეკლარაციების მომზადება; ოპერაციების შესრულება.');
    expect(d!.sections[1].blocks).toEqual([{ type: 'list', items: ['აღრიცხვა;', 'დეკლარაციების მომზადება;', 'ოპერაციების შესრულება.'] }]);
  });

  it("puts awork.ge's Word line wraps back together, and only there", () => {
    const raw = 'შესავალი.\n\nძირითადი\nფუნქცია-მოვალეობები:\n\nმომხმარებლებისთვის\nკონსულტაციის გაწევა;\nსისუფთავის დაცვა.';
    const d = structureDescription(raw, 'awork.ge');
    expect(titles(d)).toEqual(['about:', 'duties:ძირითადი ფუნქცია-მოვალეობები']);
    expect(d!.sections[1].blocks).toEqual([{ type: 'list', items: ['მომხმარებლებისთვის კონსულტაციის გაწევა;', 'სისუფთავის დაცვა.'] }]);
  });

  it('leaves an unpunctuated list alone', () => {
    const d = structureDescription('შესავალი.\n\nპიროვნული თვისებები:\nორგანიზებულობა\nპუნქტუალობა\nგუნდური მუშაობა', 'awork.ge');
    expect(d!.sections[1].blocks).toEqual([{ type: 'list', items: ['ორგანიზებულობა', 'პუნქტუალობა', 'გუნდური მუშაობა'] }]);
  });

  it('keeps the order of a posting with several positions', () => {
    const d = structureDescription(
      [
        'სასტუმრო ეძებს თანამშრომლებს.',
        '',
        'მოვალეობები:',
        '• საუზმის მომზადება;',
        'მოთხოვნები:',
        '• გამოცდილება;',
        'ჩვენ გთავაზობთ:',
        '• სამუშაო საათები 07:30-დან 15:00-მდე',
        '',
        'მოვალეობები:',
        '• ჭურჭლის რეცხვა;',
        'მოთხოვნები:',
        '• პუნქტუალურობა;',
      ].join('\n'),
    );
    expect(d!.sections.map((s) => s.kind)).toEqual(['about', 'duties', 'requirements', 'offer', 'duties', 'requirements']);
    expect(d!.facts.find((f) => f.label === 'გრაფიკი')).toBeUndefined();
  });

  it('reads English headings from LinkedIn', () => {
    const d = structureDescription(
      'Seniority level: Entry level | Employment type: Full-time | Industries: Banking\n\nAbout us\n\nWe build apps.\n\nJob Benefits\n\nFully remote work\nStock options\n\nKey Responsibilities\n\nAnalyze risk\nReport to leadership',
    );
    expect(titles(d)).toEqual(['about:About us', 'duties:Key Responsibilities', 'offer:Job Benefits']);
    expect(allText(d)).not.toContain('Seniority level');
  });

  it('returns null for an empty description', () => {
    expect(structureDescription('  ')).toBeNull();
    expect(structureDescription(null)).toBeNull();
  });
});

describe('descriptionFacts', () => {
  const facts = (text: string) => Object.fromEntries(descriptionFacts(text).map((f) => [f.label, f.value]));

  it('reads the schedule, experience, languages and education', () => {
    expect(
      facts(
        'სამუშაო გრაფიკი: სრული, 5/2, ორშაბათი-პარასკევი 09:30-დან 18:30-მდე. მინიმუმ 2 წლის სამუშაო გამოცდილება. ინგლისური და რუსული ენების ცოდნა. უმაღლესი განათლება. ჰიბრიდული.',
      ),
    ).toEqual({
      დასაქმება: 'სრული განაკვეთი',
      ფორმატი: 'ჰიბრიდული',
      გრაფიკი: '5/2 · 09:30–18:30',
      გამოცდილება: '2+ წელი',
      ენები: 'ინგლისური, რუსული',
      განათლება: 'უმაღლესი',
    });
  });

  it('reads ranges, licences and perks', () => {
    expect(facts('2–5 წლის გამოცდილება მეღვინეობაში. მართვის მოწმობა B. ჯანმრთელობის დაზღვევა, ერთჯერადი კვება, ბონუსი.')).toEqual({
      გამოცდილება: '2–5 წელი',
      'მართვის მოწმობა': 'B',
      ბენეფიტები: 'ბონუსი, დაზღვევა, კვება',
    });
  });

  it('does not take an industry or a fraction for a perk or a schedule', () => {
    expect(facts('გამოცდილება კვების მრეწველობაში. დაზღვევის აგენტი. 1/2 განაკვეთი. პრემიუმ სეგმენტი.')).toEqual({});
  });
});
