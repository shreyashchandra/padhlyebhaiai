"""Built-in catalog of popular exams with their syllabi.

Syllabi follow the official published outlines (unit/chapter level) for the
2025-26 cycle. Boards and agencies revise these periodically, so students can
edit everything after adding an exam. Topics are written as "a; b; c" strings
to keep the data readable.
"""

from dataclasses import dataclass, field

SYLLABUS_NOTE = "Based on the official syllabus for the 2025-26 cycle. Check your board/agency's latest notice for changes."


@dataclass
class CatalogSubject:
    key: str
    name: str
    color: str
    est_minutes: int  # default study time per topic
    units: dict[str, str]

    def outline(self) -> list[dict]:
        return [
            {"name": unit, "topics": [t.strip() for t in topics.split(";") if t.strip()]}
            for unit, topics in self.units.items()
        ]

    @property
    def topic_count(self) -> int:
        return sum(len(u["topics"]) for u in self.outline())


@dataclass
class CatalogExam:
    id: str
    name: str
    full_name: str
    region: str  # "India" | "Global"
    category: str
    conducted_by: str
    held: str
    description: str
    subjects: list[CatalogSubject] = field(default_factory=list)


# ---------------------------------------------------------------- shared syllabi
JEE_PHYSICS = {
    "Mechanics": "Units and Measurements; Kinematics; Laws of Motion; Work, Energy and Power; Rotational Motion; Gravitation; Properties of Solids and Liquids",
    "Thermal Physics": "Thermodynamics; Kinetic Theory of Gases",
    "Oscillations and Waves": "Oscillations (SHM, spring, pendulum); Waves (wave motion, superposition, standing waves, beats)",
    "Electricity and Magnetism": "Electrostatics; Capacitance; Current Electricity; Magnetic Effects of Current; Magnetism and Matter; Electromagnetic Induction; Alternating Currents; Electromagnetic Waves",
    "Optics": "Ray Optics and Optical Instruments; Wave Optics (interference, diffraction, polarisation)",
    "Modern Physics": "Dual Nature of Matter and Radiation; Atoms; Nuclei; Semiconductor Electronics (diodes, logic gates)",
    "Experimental Skills": "Measuring instruments (vernier, screw gauge); Mechanics and properties-of-matter experiments; Heat and sound experiments; Electricity experiments (metre bridge, Ohm's law, galvanometer); Optics experiments (mirrors, lenses, prism); Diode and Zener characteristics",
}

JEE_CHEMISTRY = {
    "Physical Chemistry": "Some Basic Concepts in Chemistry (mole concept); Atomic Structure; Chemical Bonding and Molecular Structure; Chemical Thermodynamics; Solutions; Equilibrium (chemical and ionic); Redox Reactions and Electrochemistry; Chemical Kinetics",
    "Inorganic Chemistry": "Classification of Elements and Periodicity in Properties; p-Block Elements (Groups 13-18); d- and f-Block Elements; Coordination Compounds",
    "Organic Chemistry": "Purification and Characterisation of Organic Compounds; Some Basic Principles of Organic Chemistry (GOC, isomerism, reaction mechanisms); Hydrocarbons; Organic Compounds Containing Halogens; Alcohols, Phenols and Ethers; Aldehydes, Ketones and Carboxylic Acids; Organic Compounds Containing Nitrogen (amines, diazonium salts); Biomolecules; Principles Related to Practical Chemistry",
}

JEE_MATHS = {
    "Algebra": "Sets, Relations and Functions; Complex Numbers; Quadratic Equations; Matrices and Determinants; Permutations and Combinations; Binomial Theorem; Sequences and Series",
    "Calculus": "Limits, Continuity and Differentiability; Applications of Derivatives; Indefinite Integrals; Definite Integrals and Area Under Curves; Differential Equations",
    "Coordinate Geometry": "Straight Lines; Circles; Parabola; Ellipse; Hyperbola",
    "Vectors and 3D Geometry": "Vector Algebra; Three-Dimensional Geometry",
    "Trigonometry, Statistics and Probability": "Trigonometric Functions and Identities; Inverse Trigonometric Functions; Statistics (mean, variance, standard deviation); Probability (conditional probability, Bayes' theorem, distributions)",
}

NEET_BIOLOGY = {
    "Diversity in the Living World": "The Living World; Biological Classification; Plant Kingdom; Animal Kingdom",
    "Structural Organisation in Plants and Animals": "Morphology of Flowering Plants; Anatomy of Flowering Plants; Structural Organisation in Animals (frog)",
    "Cell Structure and Function": "Cell: The Unit of Life; Biomolecules; Cell Cycle and Cell Division",
    "Plant Physiology": "Photosynthesis in Higher Plants; Respiration in Plants; Plant Growth and Development",
    "Human Physiology": "Breathing and Exchange of Gases; Body Fluids and Circulation; Excretory Products and their Elimination; Locomotion and Movement; Neural Control and Coordination; Chemical Coordination and Integration",
    "Reproduction": "Sexual Reproduction in Flowering Plants; Human Reproduction; Reproductive Health",
    "Genetics and Evolution": "Principles of Inheritance and Variation; Molecular Basis of Inheritance; Evolution",
    "Biology and Human Welfare": "Human Health and Disease; Microbes in Human Welfare",
    "Biotechnology": "Biotechnology: Principles and Processes; Biotechnology and its Applications",
    "Ecology and Environment": "Organisms and Populations; Ecosystem; Biodiversity and its Conservation",
}

# ---------------------------------------------------------------- catalog
EXAMS: list[CatalogExam] = [
    # ============================== INDIA ==============================
    CatalogExam(
        "jee-main", "JEE Main", "Joint Entrance Examination (Main)", "India", "Engineering", "NTA", "January & April",
        "Entrance to NITs, IIITs and other engineering colleges; qualifier for JEE Advanced.",
        [
            CatalogSubject("physics", "Physics", "indigo", 180, JEE_PHYSICS),
            CatalogSubject("chemistry", "Chemistry", "emerald", 180, JEE_CHEMISTRY),
            CatalogSubject("maths", "Mathematics", "orange", 180, JEE_MATHS),
        ],
    ),
    CatalogExam(
        "jee-advanced", "JEE Advanced", "Joint Entrance Examination (Advanced)", "India", "Engineering", "IITs (organising IIT rotates)", "May / June",
        "Entrance to the IITs. Syllabus broadly matches JEE Main with greater depth; customise topics for Advanced-level practice.",
        [
            CatalogSubject("physics", "Physics", "indigo", 210, JEE_PHYSICS),
            CatalogSubject("chemistry", "Chemistry", "emerald", 210, JEE_CHEMISTRY),
            CatalogSubject("maths", "Mathematics", "orange", 210, JEE_MATHS),
        ],
    ),
    CatalogExam(
        "neet-ug", "NEET-UG", "National Eligibility cum Entrance Test (UG)", "India", "Medical", "NTA", "May",
        "Entrance to MBBS, BDS, AYUSH and nursing courses across India.",
        [
            CatalogSubject("physics", "Physics", "indigo", 180, JEE_PHYSICS),
            CatalogSubject("chemistry", "Chemistry", "emerald", 180, JEE_CHEMISTRY),
            CatalogSubject("biology", "Biology", "pink", 180, NEET_BIOLOGY),
        ],
    ),
    CatalogExam(
        "cbse-12-science", "CBSE Class 12 (Science)", "CBSE Senior Secondary Board Exam, Class XII", "India", "School Boards", "CBSE", "February – April",
        "Class 12 board exams for the Science stream (PCM/PCB).",
        [
            CatalogSubject("physics", "Physics", "indigo", 240, {
                "Electrostatics": "Electric Charges and Fields; Electrostatic Potential and Capacitance",
                "Current Electricity": "Current Electricity",
                "Magnetic Effects of Current and Magnetism": "Moving Charges and Magnetism; Magnetism and Matter",
                "Electromagnetic Induction and Alternating Currents": "Electromagnetic Induction; Alternating Current",
                "Electromagnetic Waves": "Electromagnetic Waves",
                "Optics": "Ray Optics and Optical Instruments; Wave Optics",
                "Dual Nature of Radiation and Matter": "Dual Nature of Radiation and Matter",
                "Atoms and Nuclei": "Atoms; Nuclei",
                "Electronic Devices": "Semiconductor Electronics: Materials, Devices and Simple Circuits",
            }),
            CatalogSubject("chemistry", "Chemistry", "emerald", 240, {
                "Physical Chemistry": "Solutions; Electrochemistry; Chemical Kinetics",
                "Inorganic Chemistry": "d- and f-Block Elements; Coordination Compounds",
                "Organic Chemistry": "Haloalkanes and Haloarenes; Alcohols, Phenols and Ethers; Aldehydes, Ketones and Carboxylic Acids; Amines; Biomolecules",
            }),
            CatalogSubject("maths", "Mathematics", "orange", 240, {
                "Relations and Functions": "Relations and Functions; Inverse Trigonometric Functions",
                "Algebra": "Matrices; Determinants",
                "Calculus": "Continuity and Differentiability; Application of Derivatives; Integrals; Application of Integrals; Differential Equations",
                "Vectors and Three-Dimensional Geometry": "Vectors; Three-Dimensional Geometry",
                "Linear Programming": "Linear Programming",
                "Probability": "Probability",
            }),
            CatalogSubject("biology", "Biology", "pink", 240, {
                "Reproduction": "Sexual Reproduction in Flowering Plants; Human Reproduction; Reproductive Health",
                "Genetics and Evolution": "Principles of Inheritance and Variation; Molecular Basis of Inheritance; Evolution",
                "Biology and Human Welfare": "Human Health and Disease; Microbes in Human Welfare",
                "Biotechnology and its Applications": "Biotechnology: Principles and Processes; Biotechnology and its Applications",
                "Ecology and Environment": "Organisms and Populations; Ecosystem; Biodiversity and its Conservation",
            }),
            CatalogSubject("english", "English Core", "sky", 150, {
                "Reading Skills": "Unseen passage comprehension; Note making and summarisation",
                "Creative Writing Skills": "Notice writing; Invitations and replies; Letter to the editor; Article writing; Report writing",
                "Flamingo (Prose)": "The Last Lesson; Lost Spring; Deep Water; The Rattrap; Indigo; Poets and Pancakes; The Interview; Going Places",
                "Flamingo (Poetry)": "My Mother at Sixty-Six; Keeping Quiet; A Thing of Beauty; A Roadside Stand; Aunt Jennifer's Tigers",
                "Vistas": "The Third Level; The Tiger King; Journey to the End of the Earth; The Enemy; On the Face of It; Memories of Childhood",
            }),
        ],
    ),
    CatalogExam(
        "cbse-10", "CBSE Class 10", "CBSE Secondary School Board Exam, Class X", "India", "School Boards", "CBSE", "February – March",
        "Class 10 board exams: Mathematics, Science, Social Science and English.",
        [
            CatalogSubject("maths", "Mathematics", "orange", 180, {
                "Number Systems": "Real Numbers",
                "Algebra": "Polynomials; Pair of Linear Equations in Two Variables; Quadratic Equations; Arithmetic Progressions",
                "Coordinate Geometry": "Coordinate Geometry",
                "Geometry": "Triangles; Circles",
                "Trigonometry": "Introduction to Trigonometry; Some Applications of Trigonometry",
                "Mensuration": "Areas Related to Circles; Surface Areas and Volumes",
                "Statistics and Probability": "Statistics; Probability",
            }),
            CatalogSubject("science", "Science", "emerald", 180, {
                "Chemical Substances": "Chemical Reactions and Equations; Acids, Bases and Salts; Metals and Non-metals; Carbon and its Compounds",
                "World of Living": "Life Processes; Control and Coordination; How do Organisms Reproduce?; Heredity",
                "Natural Phenomena": "Light – Reflection and Refraction; The Human Eye and the Colourful World",
                "Effects of Current": "Electricity; Magnetic Effects of Electric Current",
                "Natural Resources": "Our Environment",
            }),
            CatalogSubject("social-science", "Social Science", "amber", 150, {
                "History – India and the Contemporary World II": "The Rise of Nationalism in Europe; Nationalism in India; The Making of a Global World; The Age of Industrialisation; Print Culture and the Modern World",
                "Geography – Contemporary India II": "Resources and Development; Forest and Wildlife Resources; Water Resources; Agriculture; Minerals and Energy Resources; Manufacturing Industries; Lifelines of National Economy",
                "Political Science – Democratic Politics II": "Power Sharing; Federalism; Gender, Religion and Caste; Political Parties; Outcomes of Democracy",
                "Economics – Understanding Economic Development": "Development; Sectors of the Indian Economy; Money and Credit; Globalisation and the Indian Economy",
            }),
            CatalogSubject("english", "English (Language and Literature)", "sky", 120, {
                "Reading": "Discursive passage; Case-based factual passage",
                "Writing and Grammar": "Formal letter (complaint/enquiry/order); Analytical paragraph; Grammar (tenses, modals, subject-verb agreement, reported speech, determiners)",
                "First Flight (Prose)": "A Letter to God; Nelson Mandela: Long Walk to Freedom; Two Stories about Flying; From the Diary of Anne Frank; Glimpses of India; Mijbil the Otter; Madam Rides the Bus; The Sermon at Benares; The Proposal",
                "First Flight (Poetry)": "Dust of Snow; Fire and Ice; A Tiger in the Zoo; How to Tell Wild Animals; The Ball Poem; Amanda!; The Trees; Fog; The Tale of Custard the Dragon; For Anne Gregory",
                "Footprints without Feet": "A Triumph of Surgery; The Thief's Story; The Midnight Visitor; A Question of Trust; Footprints without Feet; The Making of a Scientist; The Necklace; Bholi; The Book That Saved the Earth",
            }),
        ],
    ),
    CatalogExam(
        "gate-cse", "GATE CSE", "Graduate Aptitude Test in Engineering – Computer Science", "India", "Engineering", "IISc / IITs (rotating)", "February",
        "For M.Tech/PhD admissions and PSU recruitment in Computer Science and IT.",
        [
            CatalogSubject("ga", "General Aptitude", "slate", 90, {
                "General Aptitude": "Verbal aptitude (grammar, vocabulary, reading comprehension); Quantitative aptitude (data interpretation, arithmetic, mensuration, statistics); Analytical aptitude (logic, deduction, induction); Spatial aptitude (transformations, patterns)",
            }),
            CatalogSubject("cse", "Computer Science & IT", "indigo", 150, {
                "Engineering Mathematics": "Discrete Mathematics (logic, sets, relations, functions, graphs, combinatorics, recurrences); Linear Algebra (matrices, determinants, eigenvalues, LU decomposition); Calculus (limits, continuity, maxima/minima, integration); Probability and Statistics (random variables, distributions, conditional probability, Bayes)",
                "Digital Logic": "Boolean algebra and minimisation; Combinational circuits; Sequential circuits; Number representation and computer arithmetic",
                "Computer Organization and Architecture": "Machine instructions and addressing modes; ALU, datapath and control unit; Instruction pipelining and hazards; Memory hierarchy and cache; I/O interface (interrupts, DMA)",
                "Programming and Data Structures": "Programming in C and recursion; Arrays, stacks and queues; Linked lists; Trees and binary search trees; Binary heaps; Graphs",
                "Algorithms": "Searching, sorting and hashing; Asymptotic complexity; Greedy algorithms; Dynamic programming; Divide and conquer; Graph traversals, MST and shortest paths",
                "Theory of Computation": "Regular expressions and finite automata; Context-free grammars and pushdown automata; Regular and context-free languages, pumping lemma; Turing machines and undecidability",
                "Compiler Design": "Lexical analysis, parsing and syntax-directed translation; Runtime environments; Intermediate code generation; Local optimisation; Data-flow analyses",
                "Operating System": "System calls, processes and threads; Inter-process communication and synchronisation; Deadlock; CPU and I/O scheduling; Memory management and virtual memory; File systems",
                "Databases": "ER model; Relational model and relational algebra; Tuple calculus and SQL; Integrity constraints and normal forms; File organisation and indexing (B/B+ trees); Transactions and concurrency control",
                "Computer Networks": "OSI and TCP/IP layering; Packet and circuit switching; Data link layer (framing, error detection, MAC, Ethernet bridging); Routing protocols; IP addressing, subnetting, CIDR, ARP, DHCP, ICMP, NAT; Transport layer (flow control, congestion control, UDP, TCP, sockets); Application layer protocols (DNS, SMTP, HTTP, FTP, email)",
            }),
        ],
    ),
    CatalogExam(
        "upsc-cse-prelims", "UPSC CSE Prelims", "UPSC Civil Services (Preliminary) Examination", "India", "Government Jobs", "UPSC", "May / June",
        "Stage 1 of the Civil Services Examination (IAS, IPS, IFS and more).",
        [
            CatalogSubject("gs1", "General Studies Paper I", "amber", 240, {
                "Current Events": "Current events of national and international importance",
                "History": "Ancient Indian history; Medieval Indian history; Modern Indian history; Indian National Movement; Art and culture",
                "Geography": "Physical geography; Indian geography; World geography; Social and economic geography of India and the world",
                "Indian Polity and Governance": "Constitution and its features; Political system; Panchayati Raj; Public policy; Rights issues",
                "Economic and Social Development": "Sustainable development; Poverty and inclusion; Demographics; Social sector initiatives; Indian economy basics and budgeting",
                "Environment and Ecology": "Environmental ecology; Biodiversity; Climate change",
                "General Science": "Physics and chemistry basics; Biology and health; Science and technology developments",
            }),
            CatalogSubject("csat", "CSAT (Paper II)", "violet", 150, {
                "Comprehension and Communication": "Reading comprehension; Interpersonal skills including communication skills",
                "Reasoning": "Logical reasoning and analytical ability; Decision-making and problem-solving; General mental ability",
                "Numeracy": "Basic numeracy (Class X level); Data interpretation (charts, graphs, tables)",
            }),
        ],
    ),
    CatalogExam(
        "cat", "CAT", "Common Admission Test", "India", "Management", "IIMs (rotating)", "November",
        "Entrance to IIMs and top MBA programmes in India.",
        [
            CatalogSubject("varc", "Verbal Ability & Reading Comprehension", "sky", 120, {
                "Reading Comprehension": "RC passages: inference and main idea; RC: tone, style and author's purpose; Speed reading practice",
                "Verbal Ability": "Para summary; Para jumbles; Odd sentence out",
            }),
            CatalogSubject("dilr", "Data Interpretation & Logical Reasoning", "violet", 120, {
                "Data Interpretation": "Tables and caselets; Bar, line and pie charts; Mixed graphs and data sufficiency",
                "Logical Reasoning": "Arrangements (linear, circular, distribution); Games and tournaments; Venn diagrams and set-based sets; Puzzles, scheduling and routes; Quant-based logic sets",
            }),
            CatalogSubject("qa", "Quantitative Ability", "orange", 120, {
                "Arithmetic": "Percentages; Profit, loss and discount; Simple and compound interest; Ratio, proportion and variation; Averages, mixtures and alligations; Time, speed and distance; Time and work",
                "Algebra": "Linear and quadratic equations; Inequalities and modulus; Functions and graphs; Logarithms; Progressions and series",
                "Number System": "Divisibility, factors and remainders; HCF, LCM and base systems",
                "Geometry and Mensuration": "Lines, triangles and polygons; Circles; Coordinate geometry; Mensuration (2D and 3D)",
                "Modern Mathematics": "Permutations and combinations; Probability; Set theory",
            }),
        ],
    ),
    CatalogExam(
        "clat-ug", "CLAT UG", "Common Law Admission Test (UG)", "India", "Law", "Consortium of NLUs", "December",
        "Entrance to the five-year integrated LLB programmes at National Law Universities.",
        [
            CatalogSubject("english", "English Language", "sky", 90, {"English Language": "Passage comprehension; Inference and conclusions; Vocabulary in context; Summary and main idea"}),
            CatalogSubject("gk", "Current Affairs & General Knowledge", "amber", 90, {"Current Affairs": "National news and events; International affairs; Arts and culture; Important awards, reports and appointments; Historical events of continuing significance"}),
            CatalogSubject("legal", "Legal Reasoning", "rose", 120, {"Legal Reasoning": "Applying legal principles to facts; Constitutional law basics; Law of torts; Law of contracts; Criminal law basics; Legal current affairs"}),
            CatalogSubject("logical", "Logical Reasoning", "violet", 90, {"Logical Reasoning": "Arguments: premises and conclusions; Assumptions, strengthen and weaken; Inference and analogies; Contradictions and relationships"}),
            CatalogSubject("quant", "Quantitative Techniques", "orange", 90, {"Quantitative Techniques": "Data interpretation from passages, graphs and tables; Ratios and proportions; Percentages and averages; Basic algebra; Mensuration and statistics"}),
        ],
    ),
    CatalogExam(
        "nda", "NDA", "National Defence Academy & Naval Academy Exam", "India", "Defence", "UPSC", "April & September",
        "Entry to the Army, Navy and Air Force wings of NDA and the Indian Naval Academy.",
        [
            CatalogSubject("maths", "Mathematics", "orange", 150, {
                "Algebra": "Sets, relations and functions; Complex numbers; Quadratic equations and inequalities; Binary number system; AP, GP and HP; Permutations, combinations and binomial theorem; Logarithms",
                "Matrices and Determinants": "Matrices and Determinants",
                "Trigonometry": "Trigonometric ratios and identities; Heights and distances; Inverse trigonometric functions; Properties of triangles",
                "Analytical Geometry": "Analytical geometry of two dimensions (lines, circles, conics); Analytical geometry of three dimensions",
                "Calculus": "Limits, continuity and differentiability; Applications of derivatives; Integral calculus and areas; Differential equations",
                "Vector Algebra": "Vector Algebra",
                "Statistics and Probability": "Statistics; Probability",
            }),
            CatalogSubject("gat", "General Ability Test", "emerald", 120, {
                "English": "Grammar and usage; Vocabulary; Comprehension and cohesion",
                "General Knowledge": "Physics; Chemistry; General Science; History, freedom movement and Indian culture; Geography; Current events",
            }),
        ],
    ),
    CatalogExam(
        "ssc-cgl", "SSC CGL", "Staff Selection Commission – Combined Graduate Level (Tier 1)", "India", "Government Jobs", "SSC", "Varies (usually mid-year)",
        "Recruitment to Group B and C posts in central government ministries and departments.",
        [
            CatalogSubject("reasoning", "General Intelligence & Reasoning", "violet", 90, {"Reasoning": "Analogies and classification; Series (number, letter, figure); Coding-decoding; Blood relations and directions; Syllogism and statements; Venn diagrams; Non-verbal reasoning (mirror, paper folding, embedded figures); Matrix and puzzles"}),
            CatalogSubject("ga", "General Awareness", "amber", 90, {"General Awareness": "Current affairs; History; Geography; Indian polity; Economy; General science; Static GK (sports, awards, books, days)"}),
            CatalogSubject("quant", "Quantitative Aptitude", "orange", 120, {
                "Arithmetic": "Number system and simplification; Percentages; Ratio and proportion; Averages; Profit and loss, discount; Simple and compound interest; Time and work, pipes; Time, speed and distance; Mixtures and alligation",
                "Advanced Maths": "Algebra; Geometry; Mensuration; Trigonometry and heights and distances; Data interpretation",
            }),
            CatalogSubject("english", "English Comprehension", "sky", 90, {"English": "Reading comprehension; Cloze test; Error spotting and sentence improvement; Synonyms and antonyms; Idioms and one-word substitution; Active-passive and narration; Spelling"}),
        ],
    ),
    # ============================== GLOBAL ==============================
    CatalogExam(
        "sat", "SAT", "SAT (Digital)", "Global", "Undergraduate Admissions", "College Board", "Several dates a year (Mar, May, Jun, Aug, Oct, Nov, Dec)",
        "Standardised test for undergraduate admissions in the US and many other countries.",
        [
            CatalogSubject("rw", "Reading and Writing", "sky", 90, {
                "Information and Ideas": "Central ideas and details; Command of evidence (textual); Command of evidence (quantitative); Inferences",
                "Craft and Structure": "Words in context; Text structure and purpose; Cross-text connections",
                "Expression of Ideas": "Rhetorical synthesis; Transitions",
                "Standard English Conventions": "Boundaries (punctuation between clauses); Form, structure and sense (agreement, verb forms)",
            }),
            CatalogSubject("math", "Math", "orange", 90, {
                "Algebra": "Linear equations in one variable; Linear functions; Linear equations in two variables; Systems of two linear equations; Linear inequalities",
                "Advanced Math": "Equivalent expressions; Nonlinear equations and systems; Nonlinear functions (quadratic, exponential, polynomial)",
                "Problem-Solving and Data Analysis": "Ratios, rates, proportions and units; Percentages; One-variable data; Two-variable data and models; Probability and conditional probability; Inference from samples and margin of error; Evaluating statistical claims",
                "Geometry and Trigonometry": "Area and volume; Lines, angles and triangles; Right triangles and trigonometry; Circles",
            }),
        ],
    ),
    CatalogExam(
        "act", "ACT", "ACT", "Global", "Undergraduate Admissions", "ACT, Inc.", "Several dates a year",
        "US college admissions test. Science is optional in the enhanced ACT.",
        [
            CatalogSubject("english", "English", "sky", 75, {"English": "Production of writing (topic development, organisation); Knowledge of language (style, tone, concision); Conventions of standard English (sentence structure, punctuation, usage)"}),
            CatalogSubject("math", "Math", "orange", 90, {
                "Preparing for Higher Math": "Number and quantity; Algebra; Functions; Geometry; Statistics and probability",
                "Integrating Essential Skills": "Rates, percentages and proportions; Area, surface area and volume; Averages and medians; Expressing numbers in different ways",
                "Modeling": "Building and interpreting mathematical models",
            }),
            CatalogSubject("reading", "Reading", "violet", 75, {"Reading": "Key ideas and details; Craft and structure; Integration of knowledge and ideas (including paired passages)"}),
            CatalogSubject("science", "Science (optional)", "emerald", 75, {"Science": "Interpretation of data; Scientific investigation; Evaluation of models, inferences and experimental results"}),
        ],
    ),
    CatalogExam(
        "gre", "GRE General", "GRE General Test", "Global", "Graduate Admissions", "ETS", "Year-round",
        "Graduate school admissions test accepted worldwide (MS, MA, PhD and many MBA programmes).",
        [
            CatalogSubject("verbal", "Verbal Reasoning", "sky", 90, {"Verbal Reasoning": "Reading comprehension; Text completion; Sentence equivalence; High-frequency vocabulary"}),
            CatalogSubject("quant", "Quantitative Reasoning", "orange", 90, {"Quantitative Reasoning": "Arithmetic (integers, fractions, exponents, percentages); Algebra (equations, inequalities, functions, coordinate geometry); Geometry (lines, triangles, circles, polygons, 3D figures); Data analysis (statistics, probability, data interpretation); Quantitative comparison strategy"}),
            CatalogSubject("awa", "Analytical Writing", "violet", 60, {"Analytical Writing": "Analyze an Issue task: structure and argument; Timed practice essays"}),
        ],
    ),
    CatalogExam(
        "gmat", "GMAT Focus", "GMAT Focus Edition", "Global", "Management", "GMAC", "Year-round",
        "Business school admissions test for MBA and business master's programmes.",
        [
            CatalogSubject("quant", "Quantitative Reasoning", "orange", 90, {"Quantitative Reasoning": "Arithmetic (number properties, percentages, ratios); Algebra (equations, inequalities, functions); Word problems (rates, work, mixtures, interest); Statistics, sets and counting"}),
            CatalogSubject("verbal", "Verbal Reasoning", "sky", 90, {"Verbal Reasoning": "Reading comprehension; Critical reasoning (assumptions, strengthen/weaken, evaluate, inference)"}),
            CatalogSubject("di", "Data Insights", "violet", 90, {"Data Insights": "Data sufficiency; Multi-source reasoning; Table analysis; Graphics interpretation; Two-part analysis"}),
        ],
    ),
    CatalogExam(
        "ielts-academic", "IELTS Academic", "International English Language Testing System (Academic)", "Global", "English Proficiency", "British Council / IDP / Cambridge", "Year-round",
        "English test for study abroad, professional registration and migration.",
        [
            CatalogSubject("listening", "Listening", "sky", 60, {"Listening": "Part 1: everyday conversation; Part 2: everyday monologue; Part 3: academic discussion; Part 4: academic lecture; Question types: form/note completion, MCQ, matching, map/plan labelling"}),
            CatalogSubject("reading", "Reading", "violet", 60, {"Reading": "Skimming and scanning strategies; True/False/Not Given and Yes/No/Not Given; Matching headings and information; Sentence and summary completion; Multiple choice and short answers"}),
            CatalogSubject("writing", "Writing", "rose", 75, {"Writing": "Task 1: describing graphs, charts and tables; Task 1: processes and maps; Task 2: opinion and discussion essays; Task 2: problem-solution and two-part essays; Coherence, lexical resource and grammar"}),
            CatalogSubject("speaking", "Speaking", "emerald", 60, {"Speaking": "Part 1: introduction and familiar topics; Part 2: cue card long turn; Part 3: abstract discussion; Fluency, pronunciation and vocabulary"}),
        ],
    ),
    CatalogExam(
        "toefl-ibt", "TOEFL iBT", "Test of English as a Foreign Language (iBT, 2026 format)", "Global", "English Proficiency", "ETS", "Year-round",
        "English test for university admissions, mainly in the US and Canada. Reflects the updated format introduced in January 2026.",
        [
            CatalogSubject("reading", "Reading", "violet", 60, {"Reading": "Complete the Words; Read in Daily Life; Read an Academic Passage"}),
            CatalogSubject("listening", "Listening", "sky", 60, {"Listening": "Listen and Choose a Response; Listen to a Conversation; Listen to an Announcement; Listen to an Academic Talk"}),
            CatalogSubject("writing", "Writing", "rose", 60, {"Writing": "Build a Sentence; Write an Email; Writing for an Academic Discussion"}),
            CatalogSubject("speaking", "Speaking", "emerald", 60, {"Speaking": "Listen and Repeat; Take an Interview"}),
        ],
    ),
    CatalogExam(
        "mcat", "MCAT", "Medical College Admission Test", "Global", "Medical", "AAMC", "January – September",
        "Admissions test for medical schools in the US and Canada.",
        [
            CatalogSubject("chem-phys", "Chemical & Physical Foundations", "emerald", 150, {"Chem/Phys": "Translational motion, forces, work, energy and equilibrium; Fluids, gas movement and circulation; Electrochemistry and electrical circuits; Light, sound and optics; Atoms, nuclear decay and electronic structure; Atomic and chemical behaviour, periodic table; Unique nature of water and solutions; Molecular structure, separations and purification; Thermodynamics and kinetics; Organic reactions and functional groups"}),
            CatalogSubject("cars", "Critical Analysis & Reasoning Skills", "sky", 90, {"CARS": "Foundations of comprehension; Reasoning within the text; Reasoning beyond the text"}),
            CatalogSubject("bio-biochem", "Biological & Biochemical Foundations", "pink", 150, {"Bio/Biochem": "Amino acids, proteins and enzymes; Genetics and molecular biology; Bioenergetics and metabolism; Cell biology and organelles; Prokaryotes and viruses; Cell division, differentiation and specialisation; Nervous and endocrine systems; Organ systems (respiratory, circulatory, immune, digestive, renal, reproductive, musculoskeletal)"}),
            CatalogSubject("psych-soc", "Psychological & Social Foundations", "violet", 120, {"Psych/Soc": "Sensation and perception; Learning, memory and cognition; Emotion and stress; Identity and personality; Social processes and behaviour; Social structure and demographics; Social inequality"}),
        ],
    ),
    CatalogExam(
        "ap-calc-ab", "AP Calculus AB", "Advanced Placement Calculus AB", "Global", "School Boards", "College Board", "May",
        "College-level calculus course and exam for high-school students.",
        [
            CatalogSubject("calc-ab", "Calculus AB", "orange", 150, {
                "Limits and Derivatives": "Unit 1: Limits and Continuity; Unit 2: Differentiation – Definition and Fundamental Properties; Unit 3: Differentiation – Composite, Implicit and Inverse Functions",
                "Applications of Derivatives": "Unit 4: Contextual Applications of Differentiation; Unit 5: Analytical Applications of Differentiation",
                "Integrals": "Unit 6: Integration and Accumulation of Change; Unit 7: Differential Equations; Unit 8: Applications of Integration",
            }),
        ],
    ),
]

EXAMS_BY_ID = {e.id: e for e in EXAMS}


def exam_summary(exam: CatalogExam) -> dict:
    return {
        "id": exam.id,
        "name": exam.name,
        "full_name": exam.full_name,
        "region": exam.region,
        "category": exam.category,
        "conducted_by": exam.conducted_by,
        "held": exam.held,
        "description": exam.description,
        "note": SYLLABUS_NOTE,
        "subjects": [
            {"key": s.key, "name": s.name, "color": s.color, "unit_count": len(s.units), "topic_count": s.topic_count}
            for s in exam.subjects
        ],
    }


def exam_detail(exam: CatalogExam) -> dict:
    data = exam_summary(exam)
    by_key = {s.key: s for s in exam.subjects}
    for s in data["subjects"]:
        s["units"] = by_key[s["key"]].outline()
    return data
