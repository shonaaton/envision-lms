import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ACADEMY_LOGO_URL } from "@/lib/branding";
import { coursePages, courseSessionTotal } from "@/lib/coursePages";
import { curriculumLevels } from "@/lib/demoCurriculum";
import { LEGAL_LINKS } from "@/lib/publicLinks";
import { faqSchema, publicMetadata } from "@/lib/seo";
import CurriculumJourney, { type JourneyStage } from "./CurriculumJourney";
import LandingMotion from "./LandingMotion";
import ScreenTimePlanner from "./ScreenTimePlanner";
import "./landing.css";

/**
 * The "replace screen time with chess" campaign page, at the URL the old Wix
 * site used for its demo-booking page. It used to 301 to /register; now it is a
 * page of its own that ends in that same form.
 *
 * It deliberately has its own slim header (logo + one button) rather than the
 * site nav: it is where ad traffic lands, and every exit that is not the demo
 * form is a lost booking. The styles live in landing.css under `.bfd`, so
 * nothing here leaks into the rest of the site after a client-side navigation.
 *
 * Every animation is progressive: the hero animates with CSS alone, and the
 * scroll reveals only hide content once LandingMotion has run, so a crawler or
 * a visitor without JavaScript sees the whole page.
 */

const PATH = "/book-free-demo-class";
const demoHref = "/register";

export const metadata = publicMetadata({
  path: PATH,
  title: "Replace Screen Time With Chess | Book a Free Demo | Envision Chess Academy",
  description:
    "Too much scrolling? Replace passive screen time with structured live chess coaching at Envision Chess Academy. Book a free demo class with a coach.",
  keywords: [
    "book free demo chess class",
    "free chess demo class",
    "free trial chess class for kids",
    "replace screen time with chess",
    "screen time alternatives for kids",
  ],
  imageAlt: "Envision Chess Academy student concentrating on a chess tournament game",
});

const students = [
  {
    name: "Anish Bijibilla",
    level: "International achievement",
    detail: "Qualified for the FIDE World Cadets Cup in Batumi, representing England. England's No. 1 Under-7 across formats.",
    image: "/images/achievements/682626726_122217430778279433_7786835792267057544_n.jpg",
  },
  {
    name: "Anumega Kundu",
    level: "International tournament",
    detail: "8th position in U-12 Girls at the 1st Rangamati International Rapid and Blitz Tournament, 2026.",
    image: "/images/achievements/732018737_122223099770279433_9055084044092369505_n.jpg",
  },
  {
    name: "Nilasha Konwar",
    level: "District champion",
    detail: "1st place in U-7 Girls at the Purba Bardhaman District Chess Championship 2025.",
    image: "/images/achievements/500411390_122179989356279433_6003444726920825586_n.jpg",
  },
  {
    name: "Urvil Maurya",
    level: "District tournament",
    detail: "3rd place in Under-13 Open at the Kota District Under-15 Open Chess Tournament 2025.",
    image: "/images/achievements/517604773_122185349084279433_6977536861914066886_n.jpg",
  },
];

const features = [
  { icon: "◎", title: "Stay focused in class", detail: "Practise giving one problem their attention, noticing details and staying with a task before moving on." },
  { icon: "⌖", title: "Work through difficult questions", detail: "Break a challenge into smaller steps, examine the information and consider different ways to solve it." },
  { icon: "♟\uFE0E", title: "Think before answering", detail: "Pause, weigh the options and choose a response instead of rushing into the first answer." },
  { icon: "↗", title: "Plan homework and tasks", detail: "Think about what needs to happen first, what comes next and how each step affects the result." },
  { icon: "↻", title: "Learn from mistakes", detail: "Review an incorrect answer, understand where the thinking went off track and try a better approach." },
  { icon: "✦", title: "Build independent thinking", detail: "Practise explaining why a choice makes sense and taking responsibility for the next move." },
];

const pillars = [
  { num: "01 / LEARN", title: "Live, coach-led classes", detail: "Two structured live classes every week, matched to the child's current ability." },
  { num: "02 / PRACTISE", title: "Homework and feedback", detail: "Assignments, practice tools and coach-reviewed work keep learning active between sessions." },
  { num: "03 / COMPETE", title: "Weekly tournaments", detail: "Regular games, pairings, leaderboards and results help students apply what they learn." },
  { num: "04 / TRACK", title: "Parent-visible progress", detail: "Attendance, assignment scores, tournament results and progress reports in one portal." },
  { num: "05 / PROGRESS", title: "A clear learning pathway", detail: "Five stages and fifteen levels take students from beginner foundations towards advanced play." },
  { num: "06 / SUPPORT", title: "Ask the coach", detail: "Students can share positions and questions with their coach between scheduled sessions." },
];

type PriceRow = [duration: string, listPrice: string, offerPrice: string, classes: string];

const plans = {
  group: {
    symbol: "●●●",
    title: "Group Classes",
    tagline: "Learn together, grow together",
    duration: "60 minutes per class",
    rows: [
      ["1 month", "₹3,600", "₹3,000", "8"],
      ["3 months", "₹9,000", "₹8,000", "24"],
      ["6 months", "₹16,000", "₹14,000", "48"],
    ] as PriceRow[],
    features: [
      "2 classes per week",
      "Live online classes",
      "Structured curriculum and small batch size",
      "Practice tournaments (4 per week)",
      "Worksheets and study material",
      "Class recordings, subject to availability",
      "Certificate of completion",
    ],
  },
  individual: {
    symbol: "♛",
    title: "Individual Classes",
    tagline: "Personalized attention, faster progress",
    duration: "45 minutes per class",
    rows: [
      ["1 month", "₹4,500", "₹4,000", "4"],
      ["3 months", "₹12,000", "₹11,000", "12"],
      ["6 months", "₹24,000", "₹20,500", "24"],
    ] as PriceRow[],
    features: [
      "1 class per week",
      "One-to-one live online classes",
      "Fully customized learning plan",
      "Flexible scheduling, subject to availability",
      "Practice tournaments (4 per week)",
      "Personalized worksheets and study material",
      "Class recordings, subject to availability",
      "Certificate and direct mentor support",
    ],
  },
};

const pricedStages = [
  { id: "beginner", stage: "Stage 01 · Foundation", name: "Beginner", detail: "Build strong foundations with guided lessons, practical exercises and a structured learning path." },
  { id: "intermediate", stage: "Stage 02 · Tactics", name: "Intermediate", detail: "Develop tactical awareness, calculation and confidence in handling complex positions." },
];

/**
 * The road from first move to a FIDE rating. The goals are the academy's own
 * framing of each stage; the levels and topics underneath are read from the
 * taught syllabus, so the page cannot advertise a session nobody teaches.
 * (U+FE0E keeps the pawn a text glyph; iOS otherwise draws it as an emoji.)
 */
const journeyCopy = [
  {
    tier: "beginner",
    icon: "♟︎",
    goal: "Learn the game the right way",
    square: "e2",
    milestone: "For starters",
    outcome: "Plays a complete game by every rule, and checkmates with queen and rooks.",
  },
  {
    tier: "intermediate",
    icon: "♞",
    goal: "Sharpen tactics and calculation",
    square: "e4",
    milestone: "For starters",
    outcome: "Spots forks, pins and skewers, and finds mates in two and three.",
  },
  {
    tier: "semi_pro",
    icon: "♝",
    goal: "Start playing tournaments",
    square: "e5",
    milestone: "Tournament debut",
    outcome: "Tournament-ready: sound endgame technique and an opening repertoire.",
  },
  {
    tier: "pro",
    icon: "♜",
    goal: "Push for a FIDE rating",
    square: "e6",
    milestone: "FIDE rating push",
    outcome: "Calculates deep combinations and sacrifices that win rated games.",
  },
  {
    tier: "masters",
    icon: "♛",
    goal: "Achieve a FIDE rating and fight to improve it",
    square: "e7",
    milestone: "FIDE rated & climbing",
    outcome: "Plays positional, strategic chess built to keep the rating climbing.",
  },
];

const TOPIC_LIMIT = 6;

/** The first distinct teaching topics of a level, without revision days or difficulty tiers. */
function keyTopics(topics: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of topics) {
    if (/revision|practice|model game/i.test(raw)) continue;
    const short = raw
      .split(",")[0]
      .replace(/\s(Easy|Medium|Hard|Mixed)\b/g, "")
      .replace(/\s(Day|Part) \d+$/i, "")
      .trim();
    if (seen.has(short.toLowerCase())) continue;
    seen.add(short.toLowerCase());
    out.push(short);
  }
  return { topics: out.slice(0, TOPIC_LIMIT), more: Math.max(0, out.length - TOPIC_LIMIT) };
}

const journeyStages: JourneyStage[] = journeyCopy.flatMap((copy) => {
  const page = coursePages.find((course) => course.tier === copy.tier);
  if (!page) return [];
  return [
    {
      id: copy.tier,
      icon: copy.icon,
      name: page.navLabel.replace(/ Course$/, ""),
      goal: copy.goal,
      square: copy.square,
      milestone: copy.milestone,
      outcome: copy.outcome,
      syllabusHref: `/${page.slug}`,
      levels: curriculumLevels(copy.tier).map((level) => ({
        name: level.name,
        sessions: level.sessions.length,
        ...keyTopics(level.sessions.map((session) => session.topic)),
      })),
    },
  ];
});

const totalSessions = coursePages.reduce((total, page) => total + courseSessionTotal(page.tier), 0);
const totalLevels = coursePages.reduce((total, page) => total + curriculumLevels(page.tier).length, 0);

const steps = [
  { title: "Book a free demo", detail: "Book a free online demo and meet an Envision coach." },
  { title: "Meet the coach", detail: "The coach explores a few positions and understands what your child knows." },
  { title: "Get the right level", detail: "Receive a recommendation for the stage that fits your child." },
  { title: "Learn and practise", detail: "Attend live classes, complete assignments and take part in tournaments." },
  { title: "Follow their progress", detail: "Use the parent portal to see attendance, feedback, results and milestones." },
];

const faqs = [
  {
    q: "Does my child need to know chess already?",
    a: "No. Complete beginners are welcome. The coach assesses the child's current understanding and recommends the right starting session.",
  },
  { q: "Are classes online or offline?", a: "Both. Live online classes are available across India and internationally." },
  {
    q: "How often do students attend classes?",
    a: "The standard learning rhythm is two live classes per week. Each level contains 16 sessions and takes approximately two months.",
  },
  {
    q: "Can parents track their child's progress?",
    a: "Yes. The academy portal gives parents access to attendance, assignment scores, tournament results, progress reports and other learning updates.",
  },
  {
    q: "Is the assessment free?",
    a: "Yes. The demo is a no-obligation assessment with a coach. Your child gets to experience the class and you receive a level recommendation.",
  },
  {
    q: "Will chess automatically improve school marks or memory?",
    a: "No academy should promise that. Chess gives children structured practice in planning, calculation, evaluating options and reviewing mistakes. Whether those skills transfer to school performance varies, and research does not justify guaranteed academic outcomes.",
  },
];

/** One word per mask, so the headline rises in word by word. `start` offsets the stagger across fragments. */
function Words({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {text.split(" ").map((word, index) => (
        // The space sits outside the mask: trailing whitespace inside an inline-block collapses.
        <Fragment key={index}>
          <span className="wm">
            <span className="w" style={{ "--i": start + index } as CSSProperties}>
              {word}
            </span>
          </span>{" "}
        </Fragment>
      ))}
    </>
  );
}

function SectionHead({ eyebrow, title, children, id }: { eyebrow: string; title?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="section-head" data-reveal>
      <div className="eyebrow">{eyebrow}</div>
      {title ? <h2 id={id}>{title}</h2> : null}
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function PlanCard({ plan, kind }: { plan: (typeof plans)["group"]; kind: "group" | "individual" }) {
  return (
    <div className={`pricing-option ${kind}-plan`}>
      <div className="plan-heading">
        <span className="plan-symbol" aria-hidden="true">
          {plan.symbol}
        </span>
        <div>
          <h4>{plan.title}</h4>
          <p>{plan.tagline}</p>
        </div>
      </div>
      <div className="duration">{plan.duration}</div>
      <div className="price-table" role="table" aria-label={`${plan.title} fees`}>
        <div className="price-row price-head" role="row">
          <span role="columnheader">Duration</span>
          <span role="columnheader">Total amount</span>
          <span role="columnheader">Offer price</span>
          <span role="columnheader">Classes</span>
        </div>
        {plan.rows.map(([duration, listPrice, offerPrice, classes]) => (
          <div className="price-row" role="row" key={duration}>
            <b role="cell">{duration}</b>
            <span role="cell">
              <del>{listPrice}</del>
            </span>
            <strong role="cell">{offerPrice}</strong>
            <span role="cell">{classes}</span>
          </div>
        ))}
      </div>
      <ul className="plan-features">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </div>
  );
}

export default function BookFreeDemoClassPage() {
  return (
    <div className="bfd" id="top">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- this campaign page alone uses these faces; next/font/google fetches at build time, which has failed the VPS deploy before. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }} />

      <header className="bfd-top" data-topbar>
        <div className="wrap bfd-nav">
          <Link href="/" className="bfd-logo" aria-label="Envision Chess Academy home">
            <Image src={ACADEMY_LOGO_URL} alt="Envision Chess Academy" width={190} height={64} priority unoptimized />
          </Link>
          <nav className="navlinks" aria-label="Page sections">
            <a href="#approach">Our approach</a>
            <a href="#curriculum">Curriculum</a>
            <a href="#pricing">Fees</a>
            <a href="#students">Student achievements</a>
            <Link className="btn small" href={demoHref}>
              Book free demo <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-pieces" aria-hidden="true">
            <span>♞</span>
            <span>♛</span>
            <span>♜</span>
            <span>♝</span>
            <span>♟&#xFE0E;</span>
          </div>
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <div className="eyebrow hero-in" style={{ "--d": 0 } as CSSProperties}>
                <span className="live-dot" aria-hidden="true" />A smarter use of screen time starts here
              </div>
              <h1>
                <Words text="Too much scrolling?" />
                <em>
                  <Words text="Replace screen time" start={3} />
                  <span className="hl">
                    <Words text="with chess." start={6} />
                  </span>
                </em>
              </h1>
              <p className="hero-in" style={{ "--d": 6 } as CSSProperties}>
                Instead of another hour of passive scrolling, give your child an hour of thinking, planning and problem-solving.
                Envision&apos;s live chess classes turn screen time into a guided learning experience that challenges young minds.
              </p>
              <div className="hero-actions hero-in" style={{ "--d": 7 } as CSSProperties} data-hero-cta>
                <Link className="btn shine" href={demoHref}>
                  Book a free demo <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <ul className="hero-proof hero-in" style={{ "--d": 8 } as CSSProperties}>
                <li>Free demo class</li>
                <li>Level recommendation</li>
                <li>No obligation</li>
              </ul>
            </div>
            <div className="hero-photo">
              <div className="hero-ring" aria-hidden="true" />
              <Image
                src="/images/students/tournament-play.webp"
                alt="Envision Chess Academy student concentrating on a chess tournament game"
                fill
                priority
                sizes="(max-width: 900px) 92vw, 540px"
              />
              <div className="photo-note">Make their screen time count.</div>
            </div>
          </div>
        </section>

        <section className="student-section" id="students">
          <div className="wrap">
            <SectionHead eyebrow="Real students. Real achievements." title="This could be your child's next move.">
              Every achievement begins with a first move. Meet Envision students who started their own chess journey and went
              on to earn recognition on bigger stages. Your child&apos;s journey could start here.
            </SectionHead>
            <div className="student-track" data-carousel aria-label="Student achievement carousel" tabIndex={0}>
              {students.map((student, index) => (
                <article className="student-card" key={student.name} data-reveal style={{ "--d": index } as CSSProperties}>
                  <div className="student-photo">
                    <Image src={student.image} alt={`Envision student ${student.name}`} fill sizes="(max-width: 600px) 80vw, 300px" />
                  </div>
                  <div className="student-copy">
                    <div className="level">{student.level}</div>
                    <h3>{student.name}</h3>
                    <p>{student.detail}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="carousel-dots" data-carousel-dots aria-hidden="true">
              {students.map((student) => (
                <span key={student.name} />
              ))}
            </div>
            <div className="carousel-hint">
              <span className="swipe" aria-hidden="true">
                ←→
              </span>{" "}
              Swipe to explore more student achievements.
            </div>
          </div>
        </section>

        <section className="section soft">
          <div className="wrap">
            <SectionHead eyebrow="What excessive screen time can cost" />
            <div className="concern-card" data-reveal>
              <div className="concern-title">
                The bigger concern may be what excessive screen time means for a <span className="mark">developing brain.</span>
              </div>
              <p>
                Excessive screen time can disrupt sleep and encourage sedentary habits associated with weight gain. But one of the
                most serious concerns raised in child-health and neuroscience research is its potential relationship with altered
                brain development, including structural changes in the prefrontal cortex, which plays a vital role in attention,
                impulse control and decision-making.
              </p>
              <div className="stat-source">
                Research context: longitudinal and neuroimaging research on screen use and brain development.{" "}
                <a href="https://pubmed.ncbi.nlm.nih.gov/41173869/" target="_blank" rel="noopener noreferrer">
                  Read the study ↗
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <SectionHead eyebrow="Skills they use every school day" title="Help them become more thoughtful learners, one move at a time.">
              From understanding a maths problem to preparing for a test, children are constantly asked to pay attention, think
              clearly and work through challenges. Chess gives them a structured way to practise these habits.
            </SectionHead>
            <div className="feature-grid">
              {features.map((feature, index) => (
                <article className="feature" key={feature.title} data-reveal style={{ "--d": index % 3 } as CSSProperties}>
                  <div className="feature-icon" aria-hidden="true">
                    {feature.icon}
                  </div>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section dark-section" id="approach">
          <div className="wrap">
            <SectionHead eyebrow="The Envision approach" title="Not just online chess lessons. A complete learning system." />
            <div className="pillars">
              {pillars.map((pillar, index) => (
                <article className="pillar" key={pillar.num} data-reveal style={{ "--d": index % 3 } as CSSProperties}>
                  <div className="num">{pillar.num}</div>
                  <div>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section soft">
          <div className="wrap">
            <SectionHead eyebrow="Make the time intentional" title="See what a small weekly commitment can look like.">
              Choose a daily time block and see how it adds up over a week. This is a family planning tool, not a claim that all
              screen time should be replaced.
            </SectionHead>
            <div data-reveal>
              <ScreenTimePlanner />
            </div>
          </div>
        </section>

        <section className="section journey-section" id="curriculum">
          <div className="wrap">
            <SectionHead eyebrow="The Envision pathway" title={<>Every champion starts as a <span className="pawn-word">pawn.</span></>}>
              Five stages walk your child up the board, from the very first move to a FIDE rating. Reach the last rank and
              the pawn becomes a queen.
            </SectionHead>
            <div data-reveal>
              <CurriculumJourney stages={journeyStages} demoHref={demoHref} />
            </div>
            <div className="structure-line" data-reveal>
              <strong data-count={coursePages.length}>{coursePages.length}</strong> stages ·{" "}
              <strong data-count={totalLevels}>{totalLevels}</strong> levels ·{" "}
              <strong data-count={totalSessions}>{totalSessions}</strong> taught sessions · 2 live classes each week
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <div className="wrap">
            <SectionHead eyebrow="Fees" title="Start the journey. Pick how you learn.">
              Beginner and Intermediate fees below. For Semi-Pro, Pro and Masters, ask us during your free demo.
            </SectionHead>

            {/* On a phone only one stage and one plan show at a time; these
                radios pick which, with CSS alone. Wider screens show all four. */}
            <div className="pricing" data-reveal>
              <input type="radio" name="bfd-stage" id="bfd-stage-beginner" defaultChecked />
              <input type="radio" name="bfd-stage" id="bfd-stage-intermediate" />
              <input type="radio" name="bfd-plan" id="bfd-plan-group" defaultChecked />
              <input type="radio" name="bfd-plan" id="bfd-plan-individual" />
              <div className="toggles">
                <div className="seg seg-stage" role="group" aria-label="Stage">
                  <label htmlFor="bfd-stage-beginner">Beginner</label>
                  <label htmlFor="bfd-stage-intermediate">Intermediate</label>
                </div>
                <div className="seg seg-plan" role="group" aria-label="Class type">
                  <label htmlFor="bfd-plan-group">Group</label>
                  <label htmlFor="bfd-plan-individual">Individual</label>
                </div>
              </div>
              <div className="pricing-levels">
                {pricedStages.map((stage) => (
                  <article className={`pricing-level stage-${stage.id}`} key={stage.id}>
                    <div className="stage-no">{stage.stage}</div>
                    <h3>{stage.name}</h3>
                    <p>{stage.detail}</p>
                    <div className="pricing-options">
                      <PlanCard plan={plans.group} kind="group" />
                      <PlanCard plan={plans.individual} kind="individual" />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section soft">
          <div className="wrap">
            <SectionHead eyebrow="Simple to get started" title="Five steps from curiosity to a clear learning plan." />
            <ol className="how-grid" data-reveal data-steps>
              {steps.map((step, index) => (
                <li className="step" key={step.title} style={{ "--d": index } as CSSProperties}>
                  <div className="step-no">{String(index + 1).padStart(2, "0")}</div>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <SectionHead eyebrow="Questions parents ask" title="A few things worth knowing before you begin." />
            <div className="faq" data-reveal>
              {faqs.map((faq, index) => (
                <details className="faq-item" key={faq.q} open={index === 0}>
                  <summary className="faq-q">
                    <span>{faq.q}</span>
                    <span className="faq-icon" aria-hidden="true" />
                  </summary>
                  <div className="faq-a">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="wrap">
            <div className="cta-panel" data-reveal data-final-cta>
              <span className="cta-knight" aria-hidden="true">
                ♞
              </span>
              <div>
                <div className="eyebrow">Make their next screen session count</div>
                <h2>Replace passive scrolling with a challenge that makes them think.</h2>
                <p>
                  Book a free demo. Meet an Envision coach, understand your child&apos;s current level and get a clear
                  recommendation. No obligation to enrol.
                </p>
              </div>
              <Link className="btn shine" href={demoHref}>
                Book a free demo <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-row">
          <span>© Envision Chess Academy · Live online chess coaching for growing minds.</span>
          <span>Across India and internationally</span>
          <nav className="footer-links" aria-label="Legal">
            <Link href={LEGAL_LINKS.privacy}>Privacy</Link>
            <Link href={LEGAL_LINKS.terms}>Terms</Link>
            <Link href={LEGAL_LINKS.refund}>Refund policy</Link>
          </nav>
        </div>
      </footer>

      <div className="mobile-cta" data-mobile-cta>
        <Link className="btn" href={demoHref}>
          Book a free demo <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <LandingMotion />
    </div>
  );
}
