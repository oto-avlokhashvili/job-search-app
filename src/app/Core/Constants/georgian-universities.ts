/**
 * The HR search's university options. `value` must match the API's GEORGIAN_UNIVERSITIES
 * (job-search-api: src/cv/georgian-universities.ts): CV summaries store a university by that name,
 * and the API expands it to its other spellings for LinkedIn.
 * `ka` (Georgian name) and `abbr` (English and Georgian abbreviations, common nicknames) are only
 * for showing and searching the list here; they are never sent to the API.
 */
export interface UniversityOption {
  value: string;
  ka: string;
  abbr: string[];
  hint: string;
}

export const GEORGIAN_UNIVERSITIES: UniversityOption[] = [
  // State
  { value: 'Tbilisi Ivane Javakhishvili State University', ka: 'ივანე ჯავახიშვილის სახელობის თბილისის სახელმწიფო უნივერსიტეტი', abbr: ['TSU', 'თსუ'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'Georgian Technical University', ka: 'საქართველოს ტექნიკური უნივერსიტეტი', abbr: ['GTU', 'სტუ', 'პოლიტექნიკური'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'Ilia State University', ka: 'ილიას სახელმწიფო უნივერსიტეტი', abbr: ['ISU', 'Iliauni', 'ისუ', 'ილიაუნი'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'Tbilisi State Medical University', ka: 'თბილისის სახელმწიფო სამედიცინო უნივერსიტეტი', abbr: ['TSMU', 'თსსუ', 'სამედიცინო'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'International School of Economics at Tbilisi State University', ka: 'საერთაშორისო ეკონომიკური სკოლა თსუ-სთან', abbr: ['ISET', 'ისეტი'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'Akaki Tsereteli State University', ka: 'აკაკი წერეთლის სახელმწიფო უნივერსიტეტი', abbr: ['ATSU', 'აწსუ'], hint: 'სახელმწიფო · ქუთაისი' },
  { value: 'Batumi Shota Rustaveli State University', ka: 'ბათუმის შოთა რუსთაველის სახელმწიფო უნივერსიტეტი', abbr: ['BSU', 'ბსუ'], hint: 'სახელმწიფო · ბათუმი' },
  { value: 'Batumi State Maritime Academy', ka: 'ბათუმის სახელმწიფო საზღვაო აკადემია', abbr: ['BSMA', 'ბსსა'], hint: 'სახელმწიფო · ბათუმი' },
  { value: 'Batumi Art Teaching University', ka: 'ბათუმის ხელოვნების სასწავლო უნივერსიტეტი', abbr: ['BATU', 'ბხსუ'], hint: 'სახელმწიფო · ბათუმი' },
  { value: 'Akhaltsikhe State Education University', ka: 'ახალციხის სახელმწიფო სასწავლო უნივერსიტეტი', abbr: ['SJSU', 'სჯსუ'], hint: 'სახელმწიფო · ახალციხე' },
  { value: 'Gori State Teaching University', ka: 'გორის სახელმწიფო სასწავლო უნივერსიტეტი', abbr: ['GSTU', 'GSU', 'გსსუ', 'გსუ'], hint: 'სახელმწიფო · გორი' },
  { value: 'Shota Meskhia Zugdidi State University', ka: 'შოთა მესხიას ზუგდიდის სახელმწიფო სასწავლო უნივერსიტეტი', abbr: ['ZSU', 'ზსუ'], hint: 'სახელმწიფო · ზუგდიდი' },
  { value: 'Sokhumi State University', ka: 'სოხუმის სახელმწიფო უნივერსიტეტი', abbr: ['SSU', 'სსუ'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'Tbilisi State Academy of Arts', ka: 'თბილისის სახელმწიფო სამხატვრო აკადემია', abbr: ['TSAA', 'თსსა', 'სამხატვრო'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'Tbilisi Vano Sarajishvili State Conservatory', ka: 'თბილისის ვანო სარაჯიშვილის სახელობის სახელმწიფო კონსერვატორია', abbr: ['TSC', 'თსკ', 'კონსერვატორია'], hint: 'სახელმწიფო · თბილისი' },
  { value: 'Telavi Iakob Gogebashvili State University', ka: 'იაკობ გოგებაშვილის სახელობის თელავის სახელმწიფო უნივერსიტეტი', abbr: ['TeSaU', 'თესაუ'], hint: 'სახელმწიფო · თელავი' },
  { value: 'Shota Rustaveli University of Theater and Cinema', ka: 'შოთა რუსთაველის თეატრისა და კინოს სახელმწიფო უნივერსიტეტი', abbr: ['TAFU', 'თეატრალური'], hint: 'სახელმწიფო · თბილისი' },
  // Private
  { value: 'Free University of Tbilisi', ka: 'თბილისის თავისუფალი უნივერსიტეტი', abbr: ['FreeUni', 'ფრიუნი', 'თავისუფალი'], hint: 'კერძო · თბილისი' },
  { value: 'The University of Georgia', ka: 'საქართველოს უნივერსიტეტი', abbr: ['UG', 'იუჯი'], hint: 'კერძო · თბილისი' },
  { value: 'Caucasus University', ka: 'კავკასიის უნივერსიტეტი', abbr: ['CU', 'კუ'], hint: 'კერძო · თბილისი' },
  { value: 'International Black Sea University', ka: 'შავი ზღვის საერთაშორისო უნივერსიტეტი', abbr: ['IBSU', 'შზსუ'], hint: 'კერძო · თბილისი' },
  { value: 'Kutaisi International University', ka: 'ქუთაისის საერთაშორისო უნივერსიტეტი', abbr: ['KIU', 'ქსუ'], hint: 'კერძო · ქუთაისი' },
  { value: 'Agricultural University of Georgia', ka: 'საქართველოს აგრარული უნივერსიტეტი', abbr: ['AUG', 'AgriUni', 'აგრარული'], hint: 'კერძო · თბილისი' },
  { value: 'Georgian American University', ka: 'ქართულ-ამერიკული უნივერსიტეტი', abbr: ['GAU', 'ქაუ'], hint: 'კერძო · თბილისი' },
  { value: 'Business and Technology University', ka: 'ბიზნესისა და ტექნოლოგიების უნივერსიტეტი', abbr: ['BTU', 'ბტუ'], hint: 'კერძო · თბილისი' },
  { value: 'Georgian Institute of Public Affairs', ka: 'საქართველოს საზოგადოებრივ საქმეთა ინსტიტუტი', abbr: ['GIPA', 'ჯიპა'], hint: 'კერძო · თბილისი' },
  { value: 'Alterbridge University', ka: 'ალტერბრიჯის უნივერსიტეტი', abbr: ['ალტერბრიჯი'], hint: 'კერძო · თბილისი' },
  { value: 'American University for Humanities Tbilisi Campus', ka: 'ამერიკული ჰუმანიტარული უნივერსიტეტი, თბილისის კამპუსი', abbr: ['AUH', 'აჰუ'], hint: 'კერძო · თბილისი' },
  { value: 'BAU International University, Batumi', ka: 'ბაუ საერთაშორისო უნივერსიტეტი, ბათუმი', abbr: ['BAU', 'ბაუ'], hint: 'კერძო · ბათუმი' },
  { value: 'Caucasus International University', ka: 'კავკასიის საერთაშორისო უნივერსიტეტი', abbr: ['CIU', 'კსუ'], hint: 'კერძო · თბილისი' },
  { value: 'Central Global University', ka: 'ცენტრალური გლობალური უნივერსიტეტი', abbr: ['CGU', 'ცგუ'], hint: 'კერძო · ქუთაისი' },
  { value: 'David Aghmashenebeli University of Georgia', ka: 'საქართველოს დავით აღმაშენებლის სახელობის უნივერსიტეტი', abbr: ['DAUG', 'სდასუ'], hint: 'კერძო · თბილისი' },
  { value: 'David Tvildiani Medical University', ka: 'დავით ტვილდიანის სამედიცინო უნივერსიტეტი', abbr: ['DTMU', 'დტსუ', 'AIETI', 'აიეტი'], hint: 'კერძო · თბილისი' },
  { value: 'East European University', ka: 'აღმოსავლეთ ევროპის უნივერსიტეტი', abbr: ['EEU', 'აეუ'], hint: 'კერძო · თბილისი' },
  { value: 'European University', ka: 'ევროპის უნივერსიტეტი', abbr: ['EU', 'ეუ'], hint: 'კერძო · თბილისი' },
  { value: 'Georgian Aviation University', ka: 'საქართველოს საავიაციო უნივერსიტეტი', abbr: ['GAU', 'სსუ', 'საავიაციო'], hint: 'კერძო · თბილისი' },
  { value: 'Georgian International University', ka: 'საქართველოს საერთაშორისო უნივერსიტეტი', abbr: ['GIU', 'სსუ'], hint: 'კერძო · თბილისი' },
  { value: 'Georgian National University SEU', ka: 'საქართველოს ეროვნული უნივერსიტეტი სეუ', abbr: ['SEU', 'სეუ'], hint: 'კერძო · თბილისი' },
  { value: 'Grigol Robakidze University', ka: 'გრიგოლ რობაქიძის სახელობის უნივერსიტეტი', abbr: ['GRUNI', 'გრუნი'], hint: 'კერძო · თბილისი' },
  { value: 'Guram Tavartkiladze Tbilisi Teaching University', ka: 'გურამ თავართქილაძის სახელობის თბილისის სასწავლო უნივერსიტეტი', abbr: ['GTTU', 'გთსუ'], hint: 'კერძო · თბილისი' },
  { value: 'Kutaisi University', ka: 'ქუთაისის უნივერსიტეტი', abbr: ['KU', 'ქუ'], hint: 'კერძო · ქუთაისი' },
  { value: 'New Vision University', ka: 'ნიუ ვიჟენ უნივერსიტეტი', abbr: ['NVU', 'ნვუ'], hint: 'კერძო · თბილისი' },
  { value: 'New Georgian University', ka: 'ახალი საქართველოს უნივერსიტეტი', abbr: ['NGU', 'ასუ'], hint: 'კერძო · ფოთი' },
  { value: 'Saint Andrews Georgian University', ka: 'წმიდა ანდრია პირველწოდებულის სახელობის ქართული უნივერსიტეტი', abbr: ['SAGU', 'საპ'], hint: 'კერძო · თბილისი' },
  { value: 'Sulkhan-Saba Orbeliani University', ka: 'სულხან-საბა ორბელიანის უნივერსიტეტი', abbr: ['SSOU', 'სსოუ', 'საბა'], hint: 'კერძო · თბილისი' },
  { value: 'Sukhishvili Teaching University', ka: 'სუხიშვილის სასწავლო უნივერსიტეტი', abbr: ['STU', 'სსუ'], hint: 'კერძო · გორი' },
  { value: 'Petre Shotadze Tbilisi Medical Academy', ka: 'პეტრე შოთაძის თბილისის სამედიცინო აკადემია', abbr: ['TMA', 'თსა'], hint: 'კერძო · თბილისი' },
  { value: 'Tbilisi Medical Academy', ka: 'თბილისის სამედიცინო აკადემია', abbr: ['TMA', 'თსა'], hint: 'კერძო · თბილისი' },
  { value: 'Tbilisi Medical Institute Hippocrates', ka: 'თბილისის სამედიცინო ინსტიტუტი „ჰიპოკრატე“', abbr: ['TMI', 'თსი', 'ჰიპოკრატე'], hint: 'კერძო · თბილისი' },
  { value: 'Tbilisi Teaching University', ka: 'თბილისის სასწავლო უნივერსიტეტი', abbr: ['TTU', 'თსსუ'], hint: 'კერძო · თბილისი' },
  { value: 'Tbilisi University Metekhi', ka: 'თბილისის უნივერსიტეტი „მეტეხი“', abbr: ['მეტეხი'], hint: 'კერძო · თბილისი' },
  { value: 'Teaching University European Academy', ka: 'სასწავლო უნივერსიტეტი „ევროპის აკადემია“', abbr: ['EA', 'ევროპის აკადემია'], hint: 'კერძო · ზუგდიდი' },
  { value: 'Teaching University Geomedi', ka: 'სასწავლო უნივერსიტეტი „გეომედი“', abbr: ['გეომედი'], hint: 'კერძო · თბილისი' },
  { value: 'Teaching University Iveria', ka: 'სასწავლო უნივერსიტეტი „ივერია“', abbr: ['ივერია'], hint: 'კერძო · თბილისი' },
  { value: 'Teaching University of International Relations of Georgia', ka: 'საქართველოს საერთაშორისო ურთიერთობების სასწავლო უნივერსიტეტი', abbr: ['TUIRG', 'სსუსუ'], hint: 'კერძო · თბილისი' },
  { value: 'Teaching University Rvali', ka: 'სასწავლო უნივერსიტეტი „რვალი“', abbr: ['რვალი'], hint: 'კერძო · რუსთავი' },
  { value: 'Teaching University SEU', ka: 'სასწავლო უნივერსიტეტი სეუ', abbr: ['SEU', 'სეუ'], hint: 'კერძო · თბილისი' },
  { value: 'University Sakartvelo', ka: 'უნივერსიტეტი „საქართველო“', abbr: ['საქართველო'], hint: 'კერძო · თბილისი' },
];

export const LANGUAGES: { value: string; hint: string }[] = [
  { value: 'Georgian', hint: 'ქართული' },
  { value: 'English', hint: 'ინგლისური' },
  { value: 'Russian', hint: 'რუსული' },
  { value: 'German', hint: 'გერმანული' },
  { value: 'French', hint: 'ფრანგული' },
  { value: 'Turkish', hint: 'თურქული' },
  { value: 'Spanish', hint: 'ესპანური' },
  { value: 'Italian', hint: 'იტალიური' },
  { value: 'Ukrainian', hint: 'უკრაინული' },
  { value: 'Armenian', hint: 'სომხური' },
  { value: 'Azerbaijani', hint: 'აზერბაიჯანული' },
  { value: 'Chinese', hint: 'ჩინური' },
  { value: 'Arabic', hint: 'არაბული' },
  { value: 'Hebrew', hint: 'ებრაული' },
  { value: 'Persian', hint: 'სპარსული' },
  { value: 'Polish', hint: 'პოლონური' },
  { value: 'Greek', hint: 'ბერძნული' },
  { value: 'Portuguese', hint: 'პორტუგალიური' },
  { value: 'Japanese', hint: 'იაპონური' },
  { value: 'Korean', hint: 'კორეული' },
];
