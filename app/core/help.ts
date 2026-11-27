/**
 * Help (approved design, 27 Nov 2026): the articles, questions and words that explain the app, the one-line
 * explanations shown on top of each page for new users, and the words you can tap. Plain data only (no store,
 * no Firebase): the website's public Help page (help.html) is built from this same file.
 *
 * Text may hold <b> only: it's markup written here, never anything typed by a user.
 */

/** A paragraph, a list, the three-box picture, an example, or a small heading. */
export type Block = string | { list: string[] } | { flow: [string, string][] } | { eg: string } | { h: string };
export interface Article { id: string; area: string; title: string; sub: string; body: Block[] }
export interface Faq { id: string; q: string; a: string; more?: string }
export interface Word { word: string; text: string; eg?: string; more?: string }
export interface Tip { text: string; more: string }

export const AREAS: { id: string; title: string; sub: string }[] = [
  { id: "start", title: "Start here", sub: "" },
  { id: "money", title: "Money", sub: "Overview, Activity, Plan, Accounts, Insights" },
  { id: "days", title: "Dashboard and Calendar", sub: "What's due, family days, bills by date" },
  { id: "things", title: "Documents and Household", sub: "Papers, homes, vehicles, appliances" },
  { id: "body", title: "Health and Habits", sub: "Readings, medicines, streaks" },
  { id: "family", title: "Family", sub: "Invite, what's shared, leaving" },
];

export const ARTICLES: Article[] = [
  /* ---------- start here ---------- */
  { id: "how", area: "start", title: "How Akhila Vrutta works", sub: "Your data, the areas, the + button", body: [
    "Akhila Vrutta keeps the running of a household in one place: money, bills, papers, the home, health, habits and family days. <b>Dashboard</b> gathers what needs you from every area, so most days you only open the Dashboard.",
    { h: "The areas" },
    { list: [
      "<b>Dashboard</b>: what's due today, your money at a glance, today's habits, your to-do list, and what's next.",
      "<b>Money</b>: your accounts, what you spend, and a plan for what's coming.",
      "<b>Calendar</b>: birthdays, anniversaries and other family days, with reminders, and the bills due in the next 30 days.",
      "<b>Household</b>: home maintenance, appliances, vehicles, and your to-do and grocery lists.",
      "<b>Documents</b>: every paper, linked to what it belongs to, with expiry reminders.",
      "<b>Health</b> and <b>Habits</b>: readings, lab reports, medicines, and the things you do every day.",
    ] },
    { h: "Getting around" },
    "On a phone, each area's own pages are at the bottom; <b>Menu</b> (always last) opens every area. The <b>+</b> button adds the usual thing for the page you're on: a transaction on the Dashboard and in Money, a document in Documents.",
    { h: "Your data" },
    "Everything is encrypted on your device before it's saved, with a key only your passphrase (and Secret Key) can open. Files go to your own Google Drive, also encrypted. See <b>Your passphrase and Secret Key</b>.",
  ] },
  { id: "keys", area: "start", title: "Your passphrase and Secret Key", sub: "Why they can't be reset, and what to keep safe", body: [
    "Your data is encrypted with a key that's made from your <b>passphrase</b> and your <b>Secret Key</b>. Nobody else has them: not Google, and not the people who make this app. That's what keeps your data private, and it's also why <b>neither can be reset</b>. If both are lost, the data can't be opened by anyone.",
    { h: "Keep these safe" },
    { list: [
      "<b>Passphrase</b>: the one you type. Save it in your password manager.",
      "<b>Secret Key</b>: made for you when you set up, starting with A1-. It's in your <b>Emergency Kit</b> PDF. Print the kit and keep it at home.",
    ] },
    { h: "On a new phone or computer" },
    "Sign in with the same Google account, then type your passphrase and Secret Key once. After that, the device can unlock with your fingerprint or screen lock.",
    { h: "Changing them" },
    "Settings › Security: change the passphrase, or choose how this device unlocks. The Secret Key card in Settings shows your key and makes the Emergency Kit again.",
  ] },
  { id: "devices", area: "start", title: "Phone, website and unlocking", sub: "Using it on more than one device", body: [
    "The Android app and the website show the same data: a change on one appears on the other in a few seconds.",
    "Each device remembers how it unlocks: <b>fingerprint or screen lock</b>, <b>passphrase every time</b>, or <b>stays unlocked</b> (only on a device nobody else uses). Change it in Settings.",
    "The app locks itself when it's been in the background for a while. Bill and medicine reminders come as notifications on the Android phone even when the app is closed.",
  ] },
  { id: "backups", area: "start", title: "Backups and your data", sub: "Weekly backups, downloads, deleting", body: [
    "Once a week the app saves an encrypted backup to your Google Drive by itself, and keeps the last 8. Settings › Backup also lets you make one now, download one, or restore from one.",
    "Settings › Your data › <b>Download my data</b> gives you everything in Money as a file you can keep; <b>Excel</b> gives a spreadsheet.",
    "Settings › Account › <b>Delete my account and data</b> removes everything for good, including the backups and files in your Drive that the app made.",
  ] },

  /* ---------- money ---------- */
  { id: "money", area: "money", title: "Money, in one page", sub: "What each tab is for", body: [
    "Money has four tabs at the bottom, and Settings in the menu.",
    { list: [
      "<b>Overview</b>: your balance, what to pay this week (<b>Pay by Tuesday</b>), what needs you, and recent spends.",
      "<b>Activity</b>: every transaction, with filters, and <b>Insights</b> (where the money went) at the top.",
      "<b>Plan</b>: what repeats, this month's checklist, and whether you'll have enough later.",
      "<b>Accounts</b>: banks, cards, investments, loans and property, and your net worth.",
    ] },
    { h: "Where to start" },
    { list: [
      "Your main bank account, where the salary lands (you did this when you set up).",
      "What repeats, in <b>Plan › Regular</b>: salary, rent, EMIs, SIPs, bills. This is what makes the planning work.",
      "Your credit cards and loans, in <b>Accounts</b>.",
      "Then record spends with <b>+</b> as they happen.",
    ] },
  ] },
  { id: "add", area: "money", title: "Adding transactions", sub: "Spends, income, transfers, investments", body: [
    "Tap <b>+</b> (on the Dashboard or in Money). Choose the kind: <b>Expense</b> (money out), <b>Income</b> (money in), <b>Transfer</b> (between your own accounts, like paying a card bill), or <b>Investment</b>.",
    "Pick the account it came from and a category. Tags are optional words that group spends across categories, like <b>Home</b> or <b>Trip to Goa</b>.",
    { h: "Paying a bill from the plan" },
    "You don't need + for things in your plan: tap <b>Paid</b> in Plan › Month or <b>Pay</b> on the Overview, and the transaction is recorded for you.",
    { h: "Adding old spends" },
    "Not sure what an option means? Tap the <b>i</b> beside it. The calculator key beside the amount adds up a bill for you.",
    "When you add a past spend that your bank balance already includes, tick <b>Already in my balances</b>. It counts in Insights but won't take the money off your balance a second time.",
  ] },
  { id: "plan", area: "money", title: "Plan, explained", sub: "Month, Regular, Cash flow, Goals", body: [
    "Plan answers two questions: <b>what do I have to pay this month</b>, and <b>will I have enough later</b>. It's all built from one list you set up once.",
    { flow: [["Regular", "the things that repeat: salary, rent, EMIs, SIPs"], ["Month", "this month's checklist: tick Paid as each goes"], ["Cash flow", "enough in each account? what to put aside?"]] },
    { h: "The four tabs" },
    { list: [
      "<b>Month</b>: this month's to-do of bills and income. Tap Paid and the spend is recorded for you.",
      "<b>Regular</b>: the repeating items. Set them once; change one when it changes (a new rent, a SIP that ends).",
      "<b>Cash flow</b>: readiness, the big-bills reserve, the emergency fund, renewals, and the months ahead.",
      "<b>Goals</b>: things you're saving for, and how much a month gets you there.",
    ] },
    { eg: "Rent ₹25,000 on the 5th, monthly. Add it once in Regular. Every month it shows in Month, a reminder comes before the 5th, and Cash flow checks your account has ₹25,000 by then." },
    { h: "Bills, budgets and auto-debits" },
    "A regular item can be a fixed <b>bill</b> (rent, EMI), a <b>budget</b> (₹8,000 for groceries, which your tagged spends use up), <b>income</b>, a <b>transfer</b> or an <b>investment</b> (a SIP). Tick <b>Auto-debit</b> for things the bank pays by itself, so they aren't on your Pay list but are still checked for enough money.",
  ] },
  { id: "cashflow", area: "money", title: "Cash flow: will there be enough?", sub: "Readiness, the reserve, the emergency fund", body: [
    "Cash flow looks ahead at everything in your plan.",
    { list: [
      "<b>Readiness</b>: for the next 45 days, whether each account has enough on the day each bill is due. If one runs short, it says which account can cover it and when to move the money.",
      "<b>Big-bills reserve</b>: bills that come once a quarter or a year (insurance, school fees, property tax) are spread over the months before they're due, so you put a small amount aside each month instead of finding it all at once.",
      "<b>Emergency fund</b>: some months of your usual spending kept aside for surprises. You choose how many months.",
      "<b>Renewals</b> and <b>Big months</b>: what renews in the year ahead, and which months will be heavy.",
    ] },
    "To use the reserve, choose the account that holds it: edit the account (a separate savings account works well) and tick that it holds the big-bills reserve.",
    { h: "Paying a big bill" },
    "When a big bill goes out, tick <b>Paid from the big-bills reserve</b> on the spend. If you paid it by card or from another account, the money is still in the reserve's account. In the week that card bill is due, <b>Pay by Tuesday</b> shows a <b>Move money</b> line next to it, to bring the money back to the account that pays the card bill. Several bills on several cards due that week add up into one line; tap its ⓘ to see them by card bill.",
    "Cash flow starts with Readiness and the reserve open; tap any line to open or minimise it.",
  ] },
  { id: "paytue", area: "money", title: "Pay by Tuesday", sub: "One day a week for bills", body: [
    "Instead of paying bills on many different days, the Overview gathers everything due before next Tuesday into one list: <b>pay</b> these, <b>move money</b> between accounts if one will run short, and <b>set aside</b> this month's share for big bills.",
    "Tap <b>Pay</b> or <b>Done</b> on each line when you've done it, and it's recorded. Bills the bank pays by itself are listed under <b>Auto</b> with a ✓ when the account has enough.",
  ] },
  { id: "accounts", area: "money", title: "Accounts, cards and loans", sub: "Balances, card bills, EMIs, net worth", body: [
    "<b>Banks & cards</b>: your bank accounts with their balances, and credit cards with what you owe, the bill date and the due date. Card bills come into your plan by themselves.",
    "<b>Investments</b>: mutual funds, stocks, PPF, EPF, NPS, FDs and more, with what they're worth now. Prices of listed funds and shares update by themselves.",
    "<b>Loans</b>: each loan's EMI, what's left and when it ends. EMIs come into your plan by themselves. The payoff plan shows which loan to clear first.",
    "<b>Property</b>: homes and land, with payments and what you own.",
    "<b>Net worth</b> is everything you have minus everything you owe; the Accounts overview shows how it changes month by month.",
  ] },
  { id: "insights", area: "money", title: "Insights", sub: "Where the money went", body: [
    "Activity › <b>Insights</b> shows a month's spending by category, how it compares with earlier months (<b>Trends</b>), and the whole year (<b>Year</b>) including the reserve and tax.",
    "Categories can have <b>limits</b>: set one and Insights shows how much of it is used this month.",
  ] },

  /* ---------- today and calendar ---------- */
  { id: "today", area: "days", title: "Dashboard", sub: "Everything that needs you, on one page", body: [
    "The Dashboard collects what's due from every area: bills and EMIs, medicines and check-ups, habits to tick, home jobs, warranties and vehicle renewals, and papers that are expiring.",
    { list: [
      "<b>Today</b>: what's due today. Medicines can be ticked right here; anything else opens in its own area.",
      "<b>Money</b>: your main account today and at month-end, what to pay by Tuesday, and what you've spent this month.",
      "<b>Habits</b>: today's habits, ticked here, with their streaks.",
      "<b>To do</b>: your to-do list from Household › Lists. Tick one when it's done.",
      "<b>Next up</b>: the next things coming, each with its day, up to two months ahead.",
    ] },
    "The <b>+</b> button adds a transaction.",
  ] },
  { id: "calendar", area: "days", title: "Calendar and family days", sub: "Birthdays, anniversaries, shraddha, bills by date", body: [
    "Add the days that matter: birthdays, anniversaries and any other yearly day, each by its date. You choose how many days before to be reminded.",
    "A <b>shraddha</b> can follow the Telugu calendar instead: give the date it happened, and the app works out the tithi each year.",
    "Below the family days, <b>Bills and payments</b> lists what's due in Money in the next 30 days, each on its day. Give a regular item a due day (Plan › Regular) to place it.",
  ] },

  /* ---------- documents and household ---------- */
  { id: "documents", area: "things", title: "Documents", sub: "Every paper, where you'll look for it", body: [
    "Add a document with <b>+</b> and choose what it belongs to: a property, a vehicle, an appliance, a person, an account or loan, or a category like Tax or Medical. Its files are encrypted and kept in your Google Drive.",
    "Give a document an expiry date (a passport, an insurance policy) and it reminds you before it runs out. Each property has a checklist of the usual papers, so you can see what's missing.",
  ] },
  { id: "household", area: "things", title: "Household", sub: "Maintenance, appliances, vehicles, lists", body: [
    { list: [
      "<b>Due</b>: home jobs that repeat (servicing the water purifier, pest control), with when each is next due.",
      "<b>Appliances</b>: what you own, warranties, and their bills and manuals.",
      "<b>Vehicles</b>: insurance and pollution renewals, services, and fuel.",
      "<b>Lists</b>: your to-do and grocery lists.",
    ] },
  ] },

  /* ---------- health and habits ---------- */
  { id: "health", area: "body", title: "Health", sub: "Readings, lab reports, medicines, check-ups", body: [
    "For each person in the family: readings like weight and blood pressure with their trend, lab reports with each value checked against its normal range, medicines with reminders and stock, check-ups that repeat, and doctor visits.",
    "It's a record to keep things organised, not medical advice. Always go by your doctor.",
  ] },
  { id: "habits", area: "body", title: "Habits", sub: "Every day, some days, or towards a target", body: [
    "A habit can be something to do (every day, some days, or a few times a week), an amount towards a daily target (glasses of water), something to avoid, or a practice for a set number of days.",
    "Tick them on the Dashboard or in Habits. Each habit shows its streak and a 6-month calendar.",
  ] },

  /* ---------- family ---------- */
  { id: "family", area: "family", title: "Family", sub: "Sharing with your spouse or family", body: [
    "A family space lets people in your family see and change what you choose to share, end-to-end encrypted like the rest.",
    { h: "Starting and joining" },
    "Profile › Family › start a family space, then <b>Invite</b>: you get 6 words, good for a day. The other person opens Profile › Family on their phone and types them.",
    { h: "What's shared" },
    { list: [
      "Transactions with a shared tag (Home, unless you change it). Your other transactions stay yours.",
      "Any document, vehicle or appliance you switch to shared, with its files.",
      "If you switch them on: family days, and your to-do and grocery lists.",
    ] },
    { h: "Leaving" },
    "Anyone can leave from Profile › Family. What they shared stays with the family; their own data stays theirs.",
  ] },
];

export const FAQS: Faq[] = [
  { id: "forgot", q: "I forgot my passphrase. What now?", a: "If this device still unlocks with your fingerprint or screen lock, go to Settings and change the passphrase now. If no device unlocks any more, the data can't be opened by anyone, including us; that's what keeps it private. You can delete the account and start again.", more: "keys" },
  { id: "sk", q: "What's the Secret Key, and where is it?", a: "A second key mixed into your passphrase, so a stolen passphrase alone opens nothing. It's in your Emergency Kit PDF and on your devices. The Secret Key card in Settings can show it or make the kit again.", more: "keys" },
  { id: "newphone", q: "How do I move to a new phone?", a: "Install the app, sign in with the same Google account, and type your passphrase and Secret Key. Everything comes back.", more: "keys" },
  { id: "read", q: "Who can read my data? Can you?", a: "Only you, on your devices. It's encrypted before it leaves your device, with a key made from your passphrase and Secret Key. The people who run the app see only scrambled data: how many records there are and when they changed, never what they say.", more: "how" },
  { id: "where", q: "Where is my data kept?", a: "Records are kept encrypted in Google's cloud (Firebase), so your devices stay in step. Files and weekly backups go to your own Google Drive, also encrypted.", more: "backups" },
  { id: "regvstx", q: "Regular or a transaction: which do I add?", a: "Regular is for what repeats (salary, rent, EMIs, SIPs): add it once in Plan › Regular. A transaction is one thing that happened (₹450 on groceries today): add it with +. When a regular item is paid, tap Paid and the transaction is made for you.", more: "plan" },
  { id: "balance", q: "Why doesn't my balance match the bank?", a: "Usually a spend that wasn't recorded, or one recorded twice. Compare the account's transactions with your statement. If you started with a balance on a date, everything since that date must be in the app. You can also correct the balance by editing the account.", more: "accounts" },
  { id: "hist", q: "What does \"Already in my balances\" mean?", a: "Use it for an old spend you're adding late, when the bank balance you typed in already includes it. It shows in Insights and reports but doesn't change any balance, card bill or loan again.", more: "add" },
  { id: "rescard", q: "I paid a reserve bill by credit card. What do I do?", a: "Tick “Paid from the big-bills reserve” on the card spend. In the week that card bill is due, Pay by Tuesday asks you to move that amount from the reserve's account to the account you pay the card bill from (its ⓘ lists the bills). Pay the full card bill from there as usual.", more: "cashflow" },
  { id: "calc", q: "Can I add up a bill while entering it?", a: "Yes. In Add transaction, tap the calculator key beside the amount, work it out (450 + 120, say), then tap Use it.", more: "add" },
  { id: "reserve", q: "What is the big-bills reserve?", a: "A way to pay yearly and quarterly bills without a shock: each one is spread over the months before it's due, so you put a small amount aside every month into an account you choose.", more: "cashflow" },
  { id: "tuesday", q: "Why Tuesday?", a: "One fixed day a week for paying bills means nothing is forgotten and you don't have to think about due dates every day. Anything due before next Tuesday is on this week's list.", more: "paytue" },
  { id: "card", q: "How do I record a credit card spend and paying the card bill?", a: "A spend on the card is an Expense from the card account. Paying the card bill is a Transfer from your bank account to the card. That way the spend is counted once, when it happened.", more: "add" },
  { id: "budget", q: "How do budgets work?", a: "Make a regular item a budget (for example ₹8,000 a month for groceries). Spends you tag to it use it up, and the plan counts only what's left. What's unused at the end of the month is dropped.", more: "plan" },
  { id: "cats", q: "Can I change the categories?", a: "Yes. Money settings › Expense categories and Income categories: add new ones or change the ones there. Each person's categories are their own.", more: "money" },
  { id: "remind", q: "Why didn't a reminder come?", a: "On the Android app, check that notifications are allowed for Akhila Vrutta and battery saving doesn't stop it. The website can only remind you while it's open; for reminders on a computer, add your bills to Google Calendar from Money settings › Reminders.", more: "devices" },
  { id: "family", q: "Can my family see my money?", a: "Only what you share. In a family space, transactions with a shared tag (Home, unless you change it) are visible to both of you; everything else stays yours.", more: "family" },
  { id: "invite", q: "The invite words don't work.", a: "Invites last a day and work once. Make a new one in Profile › Family and type the 6 words exactly, in order.", more: "family" },
  { id: "files", q: "Where do my document files go?", a: "Into a folder called Akhila Vrutta in your own Google Drive, encrypted. They can only be opened through the app.", more: "documents" },
  { id: "drive", q: "Why does it ask for Google Drive?", a: "To keep your files and weekly backups in your own Drive. It can see only the files it made, nothing else in your Drive.", more: "backups" },
  { id: "offline", q: "Does it work without the internet?", a: "Mostly. Once a device is set up you can look at and add things offline; they're saved to the cloud when you're back online. Setting up a new device needs the internet.", more: "devices" },
  { id: "export", q: "Can I get my data out?", a: "Yes. Settings › Your data › Download my data, or Excel for a spreadsheet. Backups can be downloaded from Settings › Backup.", more: "backups" },
  { id: "delete", q: "How do I delete everything?", a: "Settings › Account › Delete my account and data. It removes your data from the cloud and the files and backups the app made in your Drive. It can't be undone.", more: "backups" },
  { id: "medical", q: "Is Health medical advice?", a: "No. It keeps your readings, reports and medicines organised. Always go by your doctor.", more: "health" },
  { id: "tips", q: "How do I see the page explanations again?", a: "Help › Show page explanations. They're the short notes at the top of each page.", more: "how" },
];

/** Words with a dotted underline: tap one for what it means. */
export const WORDS: Record<string, Word> = {
  regular: { word: "Regular item", text: "Something that repeats: salary, rent, an EMI, a SIP, a subscription. Add it once in Plan › Regular and it appears in Month, Cash flow and reminders by itself.", more: "plan" },
  budget: { word: "Budget", text: "An amount set aside each month for spending that varies, like groceries. Spends you tag to it use it up; the plan counts only what's left.", eg: "Groceries ₹8,000 a month; ₹5,200 spent so far, so ₹2,800 is still counted as going out.", more: "plan" },
  readiness: { word: "Readiness", text: "For the next 45 days: will each account have enough on the day each bill is due? If one runs short, it says how much to move, from where, and by when.", more: "cashflow" },
  reserve: { word: "Big-bills reserve", text: "Bills that come once a quarter or once a year (insurance, school fees, property tax) are spread over the months before they're due, so you put a small amount aside every month instead of finding it all at once.", eg: "Car insurance ₹18,000 in March, 6 months away: ₹3,000 a month.", more: "cashflow" },
  emergency: { word: "Emergency fund", text: "A few months of your usual spending, kept aside for surprises like a job change or a hospital bill. You choose how many months; Cash flow shows how far you are.", more: "cashflow" },
  hist: { word: "Already in my balances", text: "For an old spend you're adding late, when the balance you typed in already includes it. It counts in Insights and reports but doesn't change any balance again.", more: "add" },
  auto: { word: "Auto-debit", text: "Paid for you by the bank, a standing instruction or a card. It isn't on your Pay list, but Cash flow still checks there's enough money on the day.", more: "plan" },
  paytue: { word: "Pay by Tuesday", text: "One day a week for bills: everything due before next Tuesday, in one list to pay, move or set aside.", more: "paytue" },
  reserveback: { word: "Moving reserve money back", text: "A big bill was paid from the reserve, but with a card or another account, so the money for it is still sitting in the reserve's account. Move it to the account that pays: for a card, the one you pay the card bill from. Then the reserve and your balances both stay right.", eg: "Hotstar ₹2,199 charged to the ICICI card and ticked “Paid from the big-bills reserve”: move ₹2,199 from the reserve account to HDFC before you pay the card bill from HDFC.", more: "cashflow" },
  networth: { word: "Net worth", text: "Everything you have (bank balances, investments, property) minus everything you owe (loans, card dues).", more: "accounts" },
  credit: { word: "Credit used", text: "How much of your cards' total limit you're using now. Keeping it under about 30% is better for your credit score.", more: "accounts" },
  tag: { word: "Tag", text: "A word that groups transactions across categories, like Home or Trip to Goa. In a family space, transactions with a shared tag are seen by both of you.", more: "add" },
};

/** The note on top of a page, for new users: "<area>:<page>[:<tab>]". */
export const TIPS: Record<string, Tip> = {
  "money:home": { text: "<b>Overview</b> is your money at a glance: the balance, what to pay this week, and what needs you.", more: "money" },
  "money:activity": { text: "<b>Activity</b> is every transaction. Filter by account, category, tag or dates; <b>Insights</b> at the top shows where it went.", more: "add" },
  "money:insights": { text: "<b>Insights</b> shows where your money went: by category, compared with earlier months, and over the year.", more: "insights" },
  "money:plan:month": { text: "<b>Month</b> is this month's checklist of bills and income, made from your regular items. Tap <b>Paid</b> as each one goes.", more: "plan" },
  "money:plan:regular": { text: "<b>Regular</b> is everything that repeats: salary, rent, EMIs, SIPs, subscriptions. Add each one once; the app then builds your month's checklist, reminders and forecast from it.", more: "plan" },
  "money:plan:cashflow": { text: "<b>Cash flow</b> looks ahead: will each account have enough when bills are due, and how much to put aside each month for the big yearly ones.", more: "cashflow" },
  "money:plan:goals": { text: "<b>Goals</b> are things you're saving for, like a car or a child's education, with how much a month gets you there.", more: "plan" },
  "money:accounts": { text: "<b>Accounts</b> holds your banks, cards, investments, loans and property, and adds them up into your net worth.", more: "accounts" },
  today: { text: "<b>Dashboard</b> gathers what needs you from every area, your money at a glance, today's habits, your to-do list and what's next.", more: "today" },
  calendar: { text: "<b>Calendar</b> keeps birthdays, anniversaries and other family days, reminds you before each one, and lists the bills due in the next 30 days.", more: "calendar" },
  household: { text: "<b>Household</b> keeps home jobs that repeat, appliances and warranties, vehicles, and your lists.", more: "household" },
  documents: { text: "<b>Documents</b> keeps every paper with what it belongs to. Tap <b>+</b> and choose what it's for.", more: "documents" },
  health: { text: "<b>Health</b> keeps readings, lab reports, medicines and check-ups for each person. It's a record, not medical advice.", more: "health" },
  habits: { text: "<b>Habits</b> are the things you want to do every day or some days. Tick them here or on the Dashboard.", more: "habits" },
  family: { text: "<b>Family</b> lets you share chosen things with your spouse or family, end-to-end encrypted.", more: "family" },
};
/** The tip for a page: the most specific one that exists ("money:plan:regular", else "money:plan", else "money"). */
export function tipFor(key: string): { key: string; tip: Tip } | null {
  for (let k = key; k; k = k.includes(":") ? k.slice(0, k.lastIndexOf(":")) : "") { const t = TIPS[k]; if (t) return { key: k, tip: t }; }
  return null;
}

export const articleById = (id: string): Article | undefined => ARTICLES.find((a) => a.id === id);
const plain = (s: string): string => s.replace(/<[^>]+>/g, "");
const blockText = (b: Block): string => (typeof b === "string" ? b : "list" in b ? b.list.join(" ") : "flow" in b ? b.flow.flat().join(" ") : "eg" in b ? b.eg : b.h);
/** Search: articles, questions and words whose text has every word typed. */
export function searchHelp(q: string): { articles: Article[]; faqs: Faq[]; words: [string, Word][] } {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (t: string): boolean => { const s = plain(t).toLowerCase(); return terms.every((w) => s.includes(w)); };
  if (!terms.length) return { articles: [], faqs: [], words: [] };
  return {
    articles: ARTICLES.filter((a) => has([a.title, a.sub, ...a.body.map(blockText)].join(" "))),
    faqs: FAQS.filter((f) => has(`${f.q} ${f.a}`)),
    words: Object.entries(WORDS).filter(([, w]) => has(`${w.word} ${w.text}`)),
  };
}
