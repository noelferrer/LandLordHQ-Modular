const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  LevelFormat, ExternalHyperlink
} = require('docx');
const fs = require('fs');

// ── colours ──────────────────────────────────────────────
const NAVY       = '0B1D3A';
const ELECTRIC   = '2B7AFF';
const GOLD       = 'F5A623';
const LIGHT_GREY = 'F7F8FA';
const MID_GREY   = 'E2E8F0';
const WHITE      = 'FFFFFF';
const SLATE      = '64748B';
const GREEN      = '22C55E';
const RED        = 'EF4444';

const border = { style: BorderStyle.SINGLE, size: 1, color: MID_GREY };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const cellPad = { top: 120, bottom: 120, left: 160, right: 160 };

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, font: 'Arial', size: 36, bold: true, color: NAVY })]
  });
}

function heading2(text, color = NAVY) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color })]
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 22, bold: true, color: ELECTRIC })]
  });
}

function body(runs, spacingBefore = 80, spacingAfter = 80) {
  return new Paragraph({
    spacing: { before: spacingBefore, after: spacingAfter },
    children: runs
  });
}

function run(text, opts = {}) {
  return new TextRun({ text, font: 'Arial', size: 22, color: SLATE, ...opts });
}

function bold(text, color = NAVY) {
  return new TextRun({ text, font: 'Arial', size: 22, bold: true, color });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: SLATE })]
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MID_GREY } },
    children: []
  });
}

function cell(text, opts = {}) {
  const {
    shade = null, bold: isBold = false, color = NAVY,
    align = AlignmentType.LEFT, size = 20, italic = false
  } = opts;
  return new TableCell({
    borders,
    margins: cellPad,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, font: 'Arial', size, bold: isBold, italic, color })]
    })]
  });
}

// ── Tier comparison table ─────────────────────────────────
function tierTable() {
  const COL = [2200, 2380, 2380, 2400]; // sum = 9360
  const headerRow = new TableRow({ children: [
    new TableCell({ borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: 'Feature', font: 'Arial', size: 20, bold: true, color: WHITE })] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[1], type: WidthType.DXA },
      shading: { fill: ELECTRIC, type: ShadingType.CLEAR },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'Starter', font: 'Arial', size: 20, bold: true, color: WHITE, break: 1 }),
        new TextRun({ text: '', font: 'Arial', size: 16, color: 'BDD5FF' })
      ] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[2], type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'Pro', font: 'Arial', size: 20, bold: true, color: WHITE }),
      ] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[3], type: WidthType.DXA },
      shading: { fill: GOLD, type: ShadingType.CLEAR },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'Business', font: 'Arial', size: 20, bold: true, color: WHITE }),
      ] })] }),
  ]});

  const rows = [
    ['Monthly base fee',        'none',         'none',          'none'],
    ['Per-tenant fee/month',     '\u20B175/tenant', '\u20B175/tenant', '\u20B175/tenant'],
    ['Monthly cap (max bill)',   '\u20B11,500',  '\u20B12,499',   'Custom'],
    ['Approx. tenants at cap',  '~20',           '~33',           'Unlimited'],
    ['Properties',               'Unlimited',    'Unlimited',     'Unlimited'],
    ['Tenant Telegram bot',      '\u2714',       '\u2714',        '\u2714'],
    ['Payment tracking',         '\u2714',       '\u2714',        '\u2714'],
    ['Maintenance tickets',      '\u2714',       '\u2714',        '\u2714'],
    ['Finance dashboard',        '\u2714',       '\u2714',        '\u2714'],
    ['Broadcast messages',       '\u2714',       '\u2714',        '\u2714'],
    ['Priority support',         '\u2718',       '\u2714',        '\u2714'],
    ['Team members',             '\u2718',       '\u2718',        '\u2714'],
    ['Custom subdomain',         '\u2718',       '\u2718',        'Optional'],
    ['SLA guarantee',            '\u2718',       '\u2718',        '\u2714'],
  ];

  const dataRows = rows.map(([feat, s, p, b], i) => {
    const shade = i % 2 === 0 ? LIGHT_GREY : WHITE;
    const colorFor = (v) => v === '\u2714' ? GREEN : v === '\u2718' ? RED : NAVY;
    return new TableRow({ children: [
      new TableCell({ borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: feat, font: 'Arial', size: 20, color: NAVY })] })] }),
      new TableCell({ borders, margins: cellPad, width: { size: COL[1], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s, font: 'Arial', size: 20, bold: ['\u2714','\u2718'].includes(s), color: colorFor(s) })] })] }),
      new TableCell({ borders, margins: cellPad, width: { size: COL[2], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p, font: 'Arial', size: 20, bold: ['\u2714','\u2718'].includes(p), color: colorFor(p) })] })] }),
      new TableCell({ borders, margins: cellPad, width: { size: COL[3], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b, font: 'Arial', size: 20, bold: ['\u2714','\u2718'].includes(b), color: colorFor(b) })] })] }),
    ]});
  });

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: COL,
    rows: [headerRow, ...dataRows]
  });
}

// ── Billing example table ─────────────────────────────────
function billingExampleTable() {
  const COL = [2340, 2340, 2340, 2340];
  const hRow = new TableRow({ children: [
    ['Tenants', NAVY], ['Monthly Bill', NAVY], ['Approx. Rent Collected*', NAVY], ['Your Cost %', NAVY]
  ].map(([t, bg]) => new TableCell({
    borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
    shading: { fill: bg, type: ShadingType.CLEAR },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, font: 'Arial', size: 20, bold: true, color: WHITE })] })]
  }))});

  const data = [
    ['3',  '\u20B1225',                    '\u20B115,000',  '1.5%'],
    ['5',  '\u20B1375',                    '\u20B125,000',  '1.5%'],
    ['10', '\u20B1750',                    '\u20B150,000',  '1.5%'],
    ['20', '\u20B11,500 (Starter cap)',    '\u20B1100,000', '1.5%'],
    ['33', '\u20B12,499 (Pro cap)',        '\u20B1165,000', '1.5%'],
    ['50', '\u20B12,499 (still capped)',   '\u20B1250,000', '< 1%'],
  ];

  const dRows = data.map(([a, b, c, d], i) => {
    const shade = i % 2 === 0 ? LIGHT_GREY : WHITE;
    return new TableRow({ children: [a, b, c, d].map(t => new TableCell({
      borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
      shading: { fill: shade, type: ShadingType.CLEAR },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, font: 'Arial', size: 20, color: NAVY })] })]
    }))});
  });

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: COL,
    rows: [hRow, ...dRows]
  });
}

// ── Pros / Cons tables ────────────────────────────────────
function prosConsTable(pros, cons) {
  const COL = [4680, 4680];
  const hRow = new TableRow({ children: [
    new TableCell({ borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
      shading: { fill: GREEN, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: '\u2714  Pros', font: 'Arial', size: 22, bold: true, color: WHITE })] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[1], type: WidthType.DXA },
      shading: { fill: RED, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: '\u2718  Cons / Risks', font: 'Arial', size: 22, bold: true, color: WHITE })] })] }),
  ]});

  const maxLen = Math.max(pros.length, cons.length);
  const dRows = Array.from({ length: maxLen }, (_, i) => new TableRow({ children: [
    new TableCell({ borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
      shading: { fill: i % 2 === 0 ? 'F0FFF4' : WHITE, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: pros[i] || '', font: 'Arial', size: 20, color: NAVY })] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[1], type: WidthType.DXA },
      shading: { fill: i % 2 === 0 ? 'FFF5F5' : WHITE, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: cons[i] || '', font: 'Arial', size: 20, color: NAVY })] })] }),
  ]}));

  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: COL, rows: [hRow, ...dRows] });
}

// ── Roadmap table ─────────────────────────────────────────
function roadmapTable() {
  const COL = [800, 3880, 4680];
  const hRow = new TableRow({ children: [
    new TableCell({ borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: '#', font: 'Arial', size: 20, bold: true, color: WHITE })] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[1], type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: 'What to Build', font: 'Arial', size: 20, bold: true, color: WHITE })] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[2], type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: 'Why', font: 'Arial', size: 20, bold: true, color: WHITE })] })] }),
  ]});

  const steps = [
    ['1', 'Add plan column to admins table (free/starter/pro/business)', 'Foundation for all tier enforcement — one column, all gating hangs off it'],
    ['2', 'Open self-serve signup (remove invite requirement)', 'Anyone can try it — no bottleneck through Super Admin; 14-day trial auto-starts'],
    ['3', 'Enforce tenant count limit per plan in the API', 'Prevents tenants from being added beyond plan cap; returns a clear upgrade prompt'],
    ['4', 'Integrate GCash / PayMongo / Stripe billing', 'Monthly auto-charge based on active tenant count, capped per plan'],
    ['5', 'Billing dashboard in Super Admin', 'Track MRR, which landlords are on which plan, overdue accounts'],
    ['6', 'Upgrade/downgrade flow in landlord settings', 'Self-serve plan changes; landlord never needs to contact you'],
    ['7', 'Add email as fallback login (magic link)', 'Removes Telegram dependency for landlords who don\'t want to use it'],
    ['8', 'Team members (Business tier only)', 'Property managers + owners sharing one portfolio'],
    ['9', 'Revisit white-label / Super Landlord tier', 'Only after steps 1-6 are live and generating revenue'],
  ];

  const dRows = steps.map(([n, what, why], i) => new TableRow({ children: [
    new TableCell({ borders, margins: cellPad, width: { size: COL[0], type: WidthType.DXA },
      shading: { fill: i % 2 === 0 ? LIGHT_GREY : WHITE, type: ShadingType.CLEAR },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: n, font: 'Arial', size: 20, bold: true, color: ELECTRIC })] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[1], type: WidthType.DXA },
      shading: { fill: i % 2 === 0 ? LIGHT_GREY : WHITE, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: what, font: 'Arial', size: 20, bold: true, color: NAVY })] })] }),
    new TableCell({ borders, margins: cellPad, width: { size: COL[2], type: WidthType.DXA },
      shading: { fill: i % 2 === 0 ? LIGHT_GREY : WHITE, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: why, font: 'Arial', size: 20, color: SLATE })] })] }),
  ]}));

  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: COL, rows: [hRow, ...dRows] });
}

// ═══════════════════════════════════════════════════════════
//  BUILD DOCUMENT
// ═══════════════════════════════════════════════════════════
const doc = new Document({
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: NAVY },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: NAVY },
        paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: ELECTRIC },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [

      // ── TITLE PAGE ─────────────────────────────────────
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 480, after: 80 },
        children: [new TextRun({ text: 'LandlordHQ', font: 'Arial', size: 56, bold: true, color: NAVY })]
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'Pricing Strategy — Internal Document', font: 'Arial', size: 28, color: ELECTRIC })]
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: 'Version 1.0  \u2022  March 2026  \u2022  Confidential', font: 'Arial', size: 20, italic: true, color: SLATE })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 320 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ELECTRIC } },
        children: []
      }),

      // ── CONTEXT ────────────────────────────────────────
      heading1('1. Context'),
      body([run('LandlordHQ is a Telegram-powered property management platform built for Filipino landlords. The system automates rent collection, tenant communications, maintenance ticketing, and financial reporting through a web dashboard and a Telegram bot.')], 80, 120),
      body([run('This document summarises the pricing model agreed upon during a brainstorming session — the decisions made, the options considered, and the recommended path forward for launching as a SaaS product.')], 80, 160),

      divider(),

      // ── SECTION 2 ──────────────────────────────────────
      heading1('2. Pricing Model Decision'),
      heading2('2.1 Model Chosen: Per-Tenant + Monthly Cap'),
      body([
        run('After evaluating flat tiers, per-tenant, and hybrid options, the recommended model is: '),
        bold('per-tenant billing with a monthly cap per plan tier.'),
      ], 80, 120),
      body([run('This means landlords pay for what they use. As they grow (more tenants), the bill grows proportionally. But beyond a certain point, the bill is capped — so large landlords are not penalised and have no reason to look elsewhere.')], 80, 160),

      heading3('Core Formula'),
      body([
        bold('\u20B175 per active tenant per month'),
        run(' \u2014 subject to the plan\'s monthly cap.'),
      ], 80, 80),
      body([run('Billing is based on active tenants only. A tenant is considered active if they exist in the system on the billing snapshot date (end of billing cycle). Removed tenants are not billed.')], 80, 160),

      heading2('2.2 Why No Free Tier'),
      body([run('A permanent free tier was considered and rejected for the following reasons:')], 80, 80),
      bullet('Carrying free users indefinitely increases server and support costs with no return'),
      bullet('A new, unproven product cannot afford subsidising users who will never convert'),
      bullet('Filipino landlords who are serious will pay; those who will not are not the target user'),
      body([run('')], 80, 80),
      body([
        bold('Alternative: '),
        run('A 14-day free trial (no credit card required) gives prospective users full access to their chosen plan. This removes hesitation without carrying permanent free load.')
      ], 80, 160),

      heading2('2.3 Why Not Flat Tiers'),
      body([run('Flat tiers (e.g. \u20B1299/month for up to 10 tenants) were considered but rejected because:')], 80, 80),
      bullet('Landlords pay full price even if they only have 2 tenants — feels unfair at low volumes'),
      bullet('Upgrading feels like a big jump rather than a natural growth step'),
      bullet('Hard limits (e.g. "you have reached your 10-tenant limit") create frustration at the ceiling'),
      body([run('')], 80, 80),
      body([run('Per-tenant pricing eliminates all three problems. There is no ceiling to frustrate against — the cost simply scales with usage.')], 80, 160),

      heading2('2.4 Why Not Sell "Super Landlord" Yet'),
      body([run('A white-label "Super Landlord" tier (where a buyer manages their own network of landlords) was discussed and deferred. Reasons:')], 80, 80),
      bullet('The current Super Admin is a singleton tied to the owner\'s Telegram ID — not portable'),
      bullet('Each Super Landlord buyer would need their own bot token, subdomain, and isolated data namespace'),
      bullet('That architecture requires 2\u20133 months of additional engineering'),
      bullet('Revenue validation from basic landlord tiers should come first'),
      body([run('')], 80, 80),
      body([bold('Decision: '), run('Revisit white-label Super Landlord only after the base product has paying users and validated MRR.')], 80, 160),

      divider(),

      // ── SECTION 3: PLAN TABLE ──────────────────────────
      heading1('3. Plan Tiers'),
      body([run('Three tiers. No free tier. 14-day trial applies to all. Pricing is in Philippine Peso (PHP).')], 80, 160),
      tierTable(),
      new Paragraph({ spacing: { before: 80, after: 160 }, children: [new TextRun({ text: '* Prices are indicative and subject to change before launch. Tenant count limits and caps should be re-evaluated after 3 months of live data.', font: 'Arial', size: 18, italic: true, color: SLATE })] }),

      divider(),

      // ── SECTION 4: BILLING EXAMPLES ────────────────────
      heading1('4. Billing Examples'),
      body([run('The table below illustrates what landlords would actually pay at different tenant counts, assuming \u20B175/tenant/month and the Starter cap of \u20B11,500 or Pro cap of \u20B12,499.')], 80, 160),
      billingExampleTable(),
      new Paragraph({ spacing: { before: 80, after: 160 }, children: [new TextRun({ text: '* Approximate rent collected assumes \u20B15,000/tenant/month average, which is conservative for Metro Manila. Actual rent will vary.', font: 'Arial', size: 18, italic: true, color: SLATE })] }),

      body([
        bold('Key insight: '),
        run('At \u20B175/tenant, the cost to a landlord is roughly 1.5% of the rent they collect (\u20B15K/month per unit). This is an easy sell \u2014 they keep 98.5 cents of every peso they collect.')
      ], 80, 160),

      divider(),

      // ── SECTION 5: PROS/CONS ───────────────────────────
      heading1('5. Pros & Cons of Per-Tenant Pricing'),
      prosConsTable(
        [
          'Scales with the landlord\'s success — cost feels proportional and fair',
          'Simplest pricing to explain: "one number to remember"',
          'Small landlords start cheap (\u20B1225 for 3 tenants)',
          'Revenue grows automatically as landlords add tenants',
          'No hard ceiling frustration \u2014 no sudden "upgrade required" wall',
          'Easier to implement: just count active tenants at billing time',
          'Monthly cap removes the "punished for success" problem at scale',
        ],
        [
          'Monthly bill changes \u2014 billing system must count tenants dynamically each cycle',
          'Manipulation risk: landlords could remove tenants before billing date',
          'Requires clear rule: billing based on peak count or snapshot date',
          'More complex to explain than a flat fee (though still simple)',
          'Inactive tenant ambiguity: must define what "active" means precisely',
          '',
          '',
        ]
      ),
      new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),

      heading3('Mitigations for Manipulation Risk'),
      bullet('Bill based on the highest tenant count recorded during the billing cycle (peak billing)'),
      bullet('Or take a fixed snapshot on the 1st of each month regardless of add/remove timing'),
      bullet('Either approach is simple to implement and industry-standard'),

      divider(),

      // ── SECTION 6: SUPER LANDLORD ─────────────────────
      heading1('6. Super Landlord Tier \u2014 Future Consideration'),
      body([run('The concept of a "Super Landlord" tier \u2014 a white-label platform license sold to property management companies or real estate groups \u2014 was explored during the brainstorm.')], 80, 120),

      heading3('What it would look like'),
      bullet('Each buyer gets their own bot token, subdomain, and fully isolated data namespace'),
      bullet('The buyer manages their own network of landlords, billing them directly'),
      bullet('Platform owner (you) charges a monthly platform fee per Super Landlord buyer'),
      bullet('Pricing: \u20B15,000\u2013\u20B120,000+/month per buyer at this tier'),

      heading3('Why it is deferred'),
      bullet('Requires provisioning system: spin up new tenant per Super Landlord buyer at signup'),
      bullet('Bot architecture is currently a singleton (one TELEGRAM_BOT_TOKEN) \u2014 not multi-instance'),
      bullet('Role system does not exist: Super Admin is currently an env-var check, not a DB role'),
      bullet('Support burden is significantly higher for B2B buyers managing other landlords'),

      body([run('')], 80, 80),
      body([
        bold('Recommendation: '),
        run('Do not build this yet. Revisit after the base product reaches \u20B150,000 MRR or 200 active landlords, whichever comes first.')
      ], 80, 160),

      divider(),

      // ── SECTION 7: ROADMAP ─────────────────────────────
      heading1('7. Implementation Roadmap'),
      body([run('Ordered by priority. Do not proceed to a later step before the earlier one is validated with real users.')], 80, 160),
      roadmapTable(),

      new Paragraph({ spacing: { before: 160, after: 80 }, children: [] }),
      body([
        bold('Note: '),
        run('Numbers in this document (per-tenant rate, cap amounts, trial length) are starting points, not final decisions. Validate with real landlords before locking them in. Talk to at least 5 landlords and ask how many tenants they manage and what they currently spend on property management tools.')
      ], 80, 160),

      divider(),

      // ── SECTION 8: OPEN QUESTIONS ─────────────────────
      heading1('8. Open Questions'),
      body([run('These items were flagged as needing further decision or research before launch:')], 80, 100),
      bullet('What is the exact snapshot / peak-billing rule for counting active tenants?'),
      bullet('What payment gateway to use: GCash (PayMongo), Stripe, or both?'),
      bullet('Should the 14-day trial require a credit card, or be card-free?'),
      bullet('What is the grace period if a landlord\'s bill fails? (e.g. 3-day grace before lockout)'),
      bullet('Do we enforce limits softly (warning) or hard (block adding tenants)?'),
      bullet('When is the right time to open self-serve signup and remove the invite gate?'),
      bullet('Should Business tier pricing be public, or quote-on-request only?'),

      divider(),

      // ── FOOTER NOTE ────────────────────────────────────
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 0 },
        children: [new TextRun({ text: 'LandlordHQ  \u2022  Internal Use Only  \u2022  March 2026', font: 'Arial', size: 18, italic: true, color: SLATE })]
      }),
    ]
  }]
});

const OUTPUT = '/Users/user/Desktop/Aintigravity Workflows/LandlordHQ-Modular/LandlordHQ-Pricing-Strategy.docx';
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log('Written:', OUTPUT);
});
