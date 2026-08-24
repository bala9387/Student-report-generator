/* Multi-provider answer-sheet evaluator (Gemini + Kimi / Moonshot AI).
 * Load balances evaluations across available API keys and automatically fails over
 * if one API hits rate limits or errors.
 */

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_ENDPOINT = (model, key) =>
  'https://generativelanguage.googleapis.com/v1beta/models/' + model +
  ':generateContent?key=' + encodeURIComponent(key);

const MAX_FILE_BYTES = 20 * 1024 * 1024;      // ~20 MB per file
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i;

const SYSTEM_PROMPT =
  "You are a senior examiner for KSR Akshara Academy (CBSE Board), specializing in evaluating Class 12 student answer sheets.\n\n" +

  "SCHOOL: KSR Akshara Academy | BOARD: CBSE | ACADEMIC YEAR: 2026-27 | CLASS: XII\n\n" +

  "=== CLASS 12 COMPLETE SYLLABUS (Annual Plan 2026-27) ===\n\n" +

  "--- ECONOMICS (030) - XII Symphony ---\n" +
  "MACRO ECONOMICS:\n" +
  "April: National Income & Related Aggregates - What is economics, Microeconomics VS Macroeconomics, Capitalist economy, Circular flow of income, Basic concepts (consumption/capital/final/intermediate goods, stocks & flows, gross/net investment, depreciation), Aggregates (GNP, NNP, GDP, NDP - at market price, factor cost; Real & Nominal GDP, GDP & Welfare), Numericals.\n" +
  "May: Methods of calculating National Income (Value Added/Product method, Expenditure method, Income method, Precaution of each method, GDP welfare & deflator, Numericals); Money & Banking (Money meaning & supply, Currency held by public & net demand deposits, Money creation by commercial banking system, Central bank & its functions - Reserve Bank of India, Bank of issue, Govt. Bank, Banker's Bank, Control of Credit).\n" +
  "June: Determination of Income & Employment (Aggregate demand & its components, Propensity to consume & save - average & marginal, Meaning of full employment & involuntary unemployment, Problems of excess demand & deficient demand, Short-run equilibrium output, Investment multiplier & its effects, Measures to correct - changes in govt spending, taxes, money supply through Bank Rate, CRR, SLR, Repo Rate, Reverse Repo Rate, Open Market Operations, Margin requirement).\n" +
  "July: Government Budget & the Economy (Govt budget - meaning, objectives & components, Classification of receipts - revenue & capital receipts, Classification of expenditure - revenue & capital expenditure, Measures of govt deficit - revenue deficit, fiscal deficit, primary deficit); Balance of Payments (BOP account - meaning & components, Foreign exchange rate - meaning of fixed & flexible rates & managed floating).\n" +
  "INDIAN ECONOMIC DEVELOPMENT:\n" +
  "August: Development Experiences of India, China & Pakistan (Economic history of three countries, Economic indicator, Social indicators, Human development indicators, Critical analysis).\n" +
  "October-December: Revision, Revision Test, Full Portion Test.\n" +
  "January-March: VIVA, Project evaluation, Full Portion Test & Board Examinations.\n\n" +

  "--- COMPUTER SCIENCE - XII ---\n" +
  "Work Plan: KSR Akshara Academy, Subject: Computer Science, Class: XII, Year: 2026-2027\n" +
  "January: Functions - types of function (built-in, module, user-defined), creating user defined function, arguments & parameters, default parameters, positional parameters, function returning value(s), flow of execution, scope of a variable (global scope, local scope).\n" +
  "February: Introduction to files, types of files (Text file, Binary file, CSV file), relative & absolute paths; Text file operations (opening, text file open modes r/r+/w/w+/a/a+, closing, writing/appending using write() & writelines(), reading using read()/readline()/readlines(), seek & tell methods, manipulation); Binary file (basic operations, open modes rb/rb+/wb/wb+/ab/ab+, close).\n" +
  "March: Import pickle module, dump() & load() method, read/write/create/search/append & update operations in binary file; CSV file (import csv module, open/close csv file, write using csv.writer(), read using csv.reader()).\n" +
  "April: Data Structure - Stack, operations on stack (push & pop), Implementation of stack using list; Practical programs using Python; Revise Python Topic Fully; Slip Test-II.\n" +
  "June (Unit-II): Database concepts (introduction, Relational data model - relation, attribute, tuple, domain, degree, cardinality, keys - candidate, primary, alternate, foreign); SQL - DDL & DML (data type char(n)/varchar(n)/int/float/date, constraints not null/unique/primarykey), create/use/show/drop database, show/create/describe/alter/drop table, DML insert/delete/select, operators, aliasing, distinct clause, where clause, in/between/order by/null/like/update/delete, Aggregate functions (max/min/avg/sum/count), group by, having clause, joins (cartesian product, equi-join, natural join), Interface of Python with SQL (connecting SQL with Python, cursor, fetchone()/fetchall(), rowcount).\n" +
  "July (Unit-III): Evolution of networking (ARPANET, NSFNET, INTERNET), Data communication terminologies (sender, receiver, message, communication media, protocols), measuring capacity (bandwidth, data transfer rate), IP address, switching techniques (Circuit switching, Packet switching); Transmission media: Wired (Twisted pair cable, Co-axial cable, Fiber-optic cable), Wireless (Radio waves, Micro waves, Infrared waves); Network devices (Modem, Ethernet card, RJ45, Repeater, Hub, Switch, Router, Gateway, WiFi card); Network topologies & types (PAN, LAN, MAN, WAN, Bus/Star/Tree); Network protocol (HTTP, FTP, PPP, SMTP, TCP/IP, POP3, HTTPS, TELNET, VoIP); Introduction to web services (WWW, HTML, XML, domain names, URL, website, web browser, web servers, web hosting).\n\n" +

  "--- PHYSICS (CBSE) - XII (PHYSICS MICRO SCHEDULE KSR-CBSE 2026-2027) ---\n" +
  "Micro Schedule 2026-2027:\n" +
  "Jan 21 - Feb 7: Electric Fields & Charges (Electric charge introduction, methods of electrification, basic properties of charge & problems, Coulomb's inverse square law, vector form, force due to multiple charges & problems, electric field due to point charge & system of charges, electric field due to ring, disc & line charge, location of zero intensity point & problems, electric field lines, electric flux, electric dipole, electric dipole moment, electric field on axial & equatorial line & problems, electric dipole in uniform electric field - expression for torque & problems, work done in rotating electric dipole, potential energy of electric dipole & problems, applications of electric field, Gauss law, Gauss law applications, uniformly charged plane sheet & line charge, uniformly charged spherical shell).\n" +
  "Feb 9-28: Electric Potential & Capacitance (Electric potential, electric potential due to point charge & problems, electric potential due to system of charges, location of zero potential point, electric potential due to electric dipole, equipotential surface & E = -dV/dr, electrostatics potential energy of system of charge, self potential energy, dielectrics & polarisation, capacitance, principle of parallel plate capacitor, capacitance of parallel plate capacitor & problems, effect of dielectric on capacitance, series & parallel combination of capacitors & problems, applications of capacitors, energy stored in capacitor & application of capacitors).\n" +
  "Mar 2-21: Current Electricity (Electric current in conductors & applications, Ohm's law & limitations, expression for resistance, resistance concepts & problems, drift velocity - origin of resistivity, mobility, temperature dependence of resistivity, applications of resistors & problems, electrical energy & power, concepts on electric power, cells e.m.f.s internal resistance, difference between e.m.f & p.d, charging & discharging condition of a cell, series combination non-identical cells, parallel combination of cells, Kirchhoff's laws & problems, Wheatstone bridge & problems).\n" +
  "Mar 23 - Apr 11: Moving Charges & Magnetism (Biot-Savart's law, magnetic field on axis of circular loop, concepts on circular loop & problems, field due to straight conductor & application, Ampere's circuital law & applications, Lorentz force, helical path, force acting on current carrying conductor, force between two parallel current carrying conductors & definition of ampere, torque acting on current carrying loop, moving coil galvanometer, voltage sensitivity, current sensitivity, motion of charged particles in magnetic field, solenoid).\n" +
  "Apr 13-18: Magnetism & Matter (Bar magnet, magnetic moments & problems, cutting & bending of bar magnet, magnetic lines of force, field on axial line, couple acting on bar magnet & work done in rotating bar magnet, magnetic dipole in uniform magnetic field, classification of magnetic materials - dia/para/ferro).\n" +
  "Apr 20 - May 9: Electromagnetic Induction (Magnetic flux, Faraday's experiment, Faraday's laws of E.M.I., Lenz's law, applications, motional e.m.f., motional e.m.f. - rotation of rod/disc/frame, energy considerations & problems, self induction, concepts on self induction, energy stored in inductor & energy density, mutual induction, concepts on mutual induction, A.C generator, L-R circuits).\n" +
  "Jun 1-13: Alternating Currents (Introduction mean current & r.m.s. current, A.C. through pure resistor & power dissipated, A.C. through pure capacitor & power dissipated problems, L-C-R series circuit - phasor diagram method & analytical treatment, avg power dissipated & power factor, Q-factor, resonance & sharpness of resonance, transformer).\n" +
  "Jun 15-20: E.M. Waves (Introduction - Maxwell's equations, displacement current, sources of EM waves & nature of EM waves, electromagnetic spectrum).\n" +
  "Jun 22 - Jul 11: Ray Optics & Optical Instruments (Spherical mirror f = R/2, image formation by spherical mirrors, mirror equation - linear magnification, refraction & laws of refraction including Snell's law, competitive concepts on refraction of light, real depth/apparent depth & normal shift, lateral shift, critical angle & relation, refractive index, T.I.R applications - mirage/sparkling of diamond/optical fibre, optical fibre applications, refraction through spherical surface, lenses - sign convention, image formation, lens maker's formula - lens equation, applications of lens makers formula, magnification, power of lenses, combination of lenses, refraction through prism, T.I.R. prisms, simple & compound microscopes, astronomical telescope).\n" +
  "Jul 13-18: Wave Optics (Huygens principle, laws of reflection & refraction using Huygens principle, path difference, coherent & incoherent sources, superposition of waves, intensity derivation & competitive concepts, YDSE - fringe width & angular fringe width, diffraction - Huygens theory, diffraction at single slit).\n" +
  "Jul 20-25: Dual Nature of Radiation & Matter (Photon particle nature, types of electron emission, photoelectric effect, Einstein's photoelectric equation - work function/threshold frequency, experimental study of photoelectric effect, stopping potential, graphs related to photoelectric effect, laws of photoelectric effect, wave theory of light, De-Broglie matter waves).\n" +
  "Jul 27 - Aug 1: Atomic Physics (Thomson model & Rutherford model, alpha-scattering experiment, impact parameter, distance of closest approach, Bohr's model - Bohr postulates, radius of orbit, speed & time period, K.E./P.E. & total energy of orbiting electron & problems, line spectrum of H-atom, spectral series, De-Broglie explanation on second postulate, limitations of Bohr's model).\n" +
  "Aug 3-8: Nuclear Physics (Mass defect, binding energy, binding energy curve, relation between mass defect, properties of nuclear forces, nuclear stability, nuclear energy: nuclear fission & nuclear fusion).\n" +
  "Aug 10-15: Semiconductor Electronics (Introduction - band theory of solids, energy bands of conductors/semiconductors/insulators, intrinsic & extrinsic semiconductors, n-type & p-type semiconductors, p-n junction formation, semiconductor diode, p-n junction diode under forward & reverse bias, V-I characteristics of p-n junction diode, half wave & full wave rectifiers).\n\n" +

  "--- BIOLOGY (044) - XII (12M1 LESSON PLAN AY 2026-2027) ---\n" +
  "Jan 23 - Feb 10: Sexual Reproduction in Flowering Plants (Introduction & flower structure, floral whorls, pre-fertilization stamen/microsporangium/anther, T.S. of anther, microsporogenesis & pollen grain, male gametophyte development, ovule structure & megasporogenesis, monosporic Polygonum embryo sac development, pollination types & agents, outbreeding devices, pollen-pistil interaction, double fertilization - syngamy & triple fusion, post-fertilization events - endosperm & embryo development, seed & fruit formation in monocots & dicots, apomixis & polyembryony).\n" +
  "Feb 11 - Feb 22: Human Reproduction (Male reproductive system anatomy & functions, female reproductive system, gametogenesis - spermatogenesis vs oogenesis, menstrual cycle & hormonal regulation, fertilization & implantation, pregnancy & placenta functions, embryonic development, parturition childbirth & lactation).\n" +
  "Feb 23 - Feb 28: Reproductive Health (Need for reproductive health, WHO & govt initiatives, population explosion & birth control contraceptive methods, MTP - medical termination of pregnancy, infertility, STDs & prevention, ART - Assisted Reproductive Technologies: IVF, ICSI, GIFT, ZIFT).\n" +
  "Mar 2 - Mar 12: Human Health & Disease (Health & disease determinants, innate & acquired immunity, antibody structure 3D - humoral & cell-mediated immunity, vaccination & immunisation, allergy & autoimmune disorders, AIDS HIV lifecycle & transmission, cancer - causes/detection/treatment, drug & alcohol abuse).\n" +
  "Mar 13 - Mar 23: Microbes in Human Welfare (Beneficial microorganisms, household products - curd & fermentation, industrial products - antibiotics, enzymes & beverages, primary & secondary sewage treatment, biogas plant & methane production, biocontrol agents & biofertilisers).\n" +
  "Mar 24 - Apr 3: Organisms & Populations (Ecology & levels of organisation, habitat & niche, population attributes - density/natality/mortality/age structure, population growth - exponential & logistic growth curves, population interactions - mutualism/predation/parasitism/commensalism/competition, plant & animal adaptations).\n" +
  "Apr 4 - Apr 28: Ecosystem (Components & types, GPP/NPP & secondary productivity, decomposition process & factors, energy flow & food chains, ecological pyramids - number/biomass/energy, food web & succession, carbon & phosphorus nutrient cycles); Biodiversity & Conservation (Genetic/species/ecosystem diversity, latitudinal gradient & species-area relationship, importance & loss causes, in-situ & ex-situ conservation, Indian biodiversity hotspots & protected areas).\n" +
  "May 16 - May 29: Principles of Inheritance & Variation (Mendel's experiments, monohybrid cross & law of dominance, law of segregation, dihybrid cross & law of independent assortment, incomplete dominance & codominance, ABO blood groups & multiple alleles, pleiotropy & chromosomal theory, linkage & crossing over recombination, sex determination XX-XY/XO/ZW-ZZ, genetic disorders - haemophilia/colour blindness/sickle-cell anaemia/Down syndrome, pedigree analysis).\n" +
  "Jun 1 - Jun 10: Evolution (Origin of life - Oparin-Haldane & Miller-Urey experiment, Earth evolution & biological timeline, morphological/anatomical/embryological/molecular evidence, adaptive radiation - Darwin's finches, natural selection, Hardy-Weinberg principle & gene pool, speciation & human evolution timeline).\n\n" +

  "--- MATHEMATICS - XII (Classes M1, M2) ---\n" +
  "Day Plan 2026-27:\n" +
  "March: Continuity & Differentiability (EX:5.1 - Continuity, Algebra of continuous functions; EX:5.2 - Differentiability, Algebra of derivatives, Derivatives of composite functions; EX:5.3 - Derivatives of implicit functions, Derivatives of inverse trigonometric functions; EX:5.4 - Derivatives of functions in parametric forms; EX:5.5 - Second order derivative; EX:5.6, Miscellaneous Exercises).\n" +
  "April: Application of Derivatives (EX:6.1 - Rate of change of quantities; EX:6.2 - Increasing & decreasing functions; EX:6.3 - Maxima & Minima, First derivative test, Second derivative test, Maxima & minimum values of a function in a closed interval).\n" +
  "June: Application of Derivatives continued (EX:6.3-4 to Misc); Integrals - Introduction, Integration as inverse process of differentiation; EX:7.1 - 7.6 Methods of Integration (Integration by substitution, Integration using trigonometric identities, Integrals of some particular functions, Integration by partial fractions, Integration by parts).\n" +
  "July: EX:7.7-7.10 (Definite integrals, Fundamental theorem of calculus, Evaluation of definite integrals by substitution, Some properties of definite integrals); Application of Integration (EX:8.1 - Area under simple curves, Miscellaneous exercise).\n" +
  "August: Differential Equations (Introduction, Order & degree, General & particular solutions, Methods of solving first order first degree differential equations - EX:9.1-9.5, Homogenous differential equations, Miscellaneous exercises); Vector Algebra (EX:10.1-10.4 - Position vector, Direction cosines, Types of vectors, Addition of vectors, Multiplication of a vector by a scalar, Vector joining by two points, Section formula, Product of two vectors, Scalar/dot product of 2 vectors, Projection of a vector on a line, Vector/cross product of two vectors); 3D Geometry (EX:11.1-11.2 - Direction cosines & direction ratios of a line, Direction cosines of a line passing through two points, Equation of a line in space, Angle between two lines, Shortest distance between two lines, Distance between two skew lines & parallel lines); LPP (EX:12.1 - Mathematical formulation, Graphical method of solving linear programming problems); Probability (EX:13.1-13.3 - Conditional probability, Properties, Multiplication theorem, Independent events, Bayes Theorem, Miscellaneous exercise).\n\n" +

  "--- APPLIED MATHEMATICS - XII ---\n" +
  "Year Plan 2026-27:\n" +
  "February: Matrices (Definition of a matrix, Types of matrices, Addition/subtraction/scalar multiplication/multiplication of matrices, Transpose of a matrix, Symmetric & skew symmetric matrices); Determinants (Determinant, Minor & cofactor, Adjoint of a matrix, Inverse of a matrix, Solution of linear equations using matrix method & Cramer's rule, Properties of determinants).\n" +
  "March: Numbers, Quantification & Numerical Inequalities (Modulo Arithmetic, Properties of modulo operator, Application of modulo, Congruence Modulo, Equivalence Class, Alligation & Mixture, Boats & streams, Pipes & Cisterns, Races & Games); Numerical Inequalities (Numerical inequalities, Properties of inequalities, Solution of linear inequalities in one variable).\n" +
  "April: Differentiation (Implicit differentiation, Derivatives of function in parametric forms, Higher order derivatives, Differentiation of parametric & implicit functions upto 2nd order); Application of Derivative (Rate of change, Tangents & Normals, Marginal cost & Marginal revenue using derivatives, Increasing & decreasing function, Maxima & Minima).\n" +
  "June: Linear Programming (Mathematical formulation of LPP, Different types of LPP, Graphical method of solution for problems in 2 variables, Feasible & infeasible regions & solutions); Perpetuity, Sinking Fund & EMI.\n" +
  "July: Returns, Growth & Depreciation (Rate of return, Nominal rate of return & bond, Compound Annual growth rate, Annual growth rate, Linear method of depreciation); Integrals (Integration, Indefinite integrals, Indefinite integrals by substitution/partial functions/by parts, Definite integrals as area under the curve, Application of integration); Differential Equations (Order & degree, Formulation, Solution of differential equation).\n" +
  "August: Probability (Probability distribution, Mean/variance/SD of probability distribution, Binomial distribution, Poisson distribution, Normal distribution); Inferential Statistics (Population & Sample, Parameter & statistical inferences, t-test); Time Based Data (Time series, Components of time series, Method of moving average, Method of least squares).\n\n" +

  "--- CHEMISTRY (CBSE Board) - XII ---\n" +
  "Micro Schedule 2026-2027:\n" +
  "Jan 21 - Feb 12: Halo Alkanes & Haloarenes (Introduction, classification, nomenclature, Common & IUPAC names of Halides, Nature of C-X Bond, hydrocarbons By free radical halogenation & By electrophilic substitution & Sandmeyer's reaction, From alkenes, halogen exchange, Physical Properties, chemical properties - Nucleophilic substitution SN2 & SN1, Stereochemical aspects, racemic mixture/Retention/Inversion, Elimination reactions, Reaction with metals, reaction of halo arenes/Nucleophilic substitution, Replacement by hydroxyl group, Electrophilic substitution reactions, chloro methane, Freons, DDT).\n" +
  "Feb 15 - Mar 18: Alcohols, Phenols & Ethers (Classification, Nomenclature, Structures of functional groups, Alcohols preparations from alkenes/hydroboration-oxidation/carbonyl compounds/Grignard reagents, Physical Properties, chemical properties, PHENOLS PREPARATIONS, CHEMICAL PROPERTIES, Some commercially important alcohols, Ethers preparations & Chemical properties).\n" +
  "Mar 23 - Apr 11: Aldehydes, Ketones & Carboxylic Acids (Nomenclature - Aldehydes & Ketones, Structure of Carbonyl Group, Preparation of Aldehydes & Ketones, Physical Properties, reactions, Addition of Grignard reagents/alcohols, Reduction/Oxidation, Reactions due to α-hydrogen, Nomenclature & Structure of Carboxyl Group, reagents from acyl halides, physical properties, Reactions Involving Cleavage of O-H Bond/C-OH Bond/-COOH Group, Substitution Reactions).\n" +
  "Apr 13-25: Amines (Introduction, Structure, Classification, Nomenclature, Preparations, physical & chemical properties, Diazonium salts & preparations, physical & chemical properties of Diazonium salts).\n" +
  "Apr 27 - May 9: Bio Molecules (Introduction, Carbohydrates - Classification/preparations/Structure of glucose & fructose/Diasaccharides/Polysaccharides, Proteins - amino acids/classification of aminoacids/structure of proteins/denaturation of proteins, enzymes, classification of vitamins, nucleic acids).\n" +
  "Jun 6-18: Solutions (Introduction, types of solutions, Expressing Concentration - Mass percentage/Volume percentage/Mass by volume percentage/Parts per million, Molarity/molality/normality/Formality & mole fraction, Solubility of solid in a liquid & gas in a liquid, Ideal solutions & non-ideal solutions, Colligative properties & determination of molar mass - RLVP/EBP/DFP/Osmosis/Reverse osmosis, Abnormal molar masses).\n" +
  "Jun 19-30: Electro Chemistry (Electro chemical cells, Galvanic cells, measurement of electrode potential, Nernst equation, equilibrium constant from Nernst equations, electro chemical cell & Gibbs energy, conductance of electrolytic solutions, measurement of conductivity of ionic solutions, variation of conductivity & molar conductivity with concentration, electrolytic cells & electrolysis, products of electrolysis, batteries, fuel cells, corrosion).\n" +
  "Jul 1-16: Chemical Kinetics (Introduction, rate of chemical reactions, average rates, instantaneous rate, factors influencing rate of reaction, rate constant, order of reaction, molecularity of reactions, integrated rate equations, zero order reactions, first order reactions, half life of reactions, temperature dependence of rate of a reaction, effect of catalyst, collision theory of chemical reactions).\n" +
  "Jul 17-31: d and f Block Elements (position in periodic table, electronic configuration of d-block elements, general properties of transition elements, variation in atomic & ionic sizes of transition metals, ionisation enthalpy/oxidation states/SEP, chemical reactivity & E values, magnetic properties, formation of coloured ions, complex compounds, alloys formations, important compounds of transition elements, introduction of f-block elements, the lanthanoids, oxidation states, the actinoids, applications).\n" +
  "Aug 1-15: Coordination Compounds (introduction of coordination chemistry, Werner's theory, double salts & complex, important terms, nomenclature, isomerism, types of isomerism, bonding - VBT, Magnetic properties, CFT, colours in coordination compounds, limitations of CFT, BONDING metal carbonyls, applications of coordination compounds).\n" +
  "Aug 16-18: Practicals (lab experiments, titration, salt analysis & project work).\n\n" +

  "--- PHYSICAL EDUCATION (PE) - Grade 12 ---\n" +
  "Annual Academic Plan 2026-27:\n" +
  "March: Test & Measurement in Sports (Fitness Test - SAI Khelo India, BMI, Flamingo Balance Test, Plate Tapping Test, 50mt Speed test, 600mt Run/Walk, Sit & Reach flexibility test, Strength Test, Push-Ups, Computing BMR, Rikli & Jones Senior Citizen Fitness Test).\n" +
  "April: Management of Sporting Events (Functions of Sports Events Management - Planning/Organising/Staffing/Directing & Controlling, Various Committees & their Responsibilities, Fixtures & Procedures - Knock-Out & League).\n" +
  "May: Physical Education & Sports for CWSN - Children with Special Needs/Divyang (Organizations promoting Disability Sports, Special Olympics/Paralympics/Deaflympics, Advantages of Physical Activities for children with special needs, Strategies).\n" +
  "May: Children & Women in Sports (Common Postural Deformities - Knock Knee/Bow Legs/Flat Foot/Round Shoulders/Lordosis/Kyphosis/Scoliosis & corrective measures, Special consideration - Menarche & Menstrual Dysfunction, Female Athletes Triad).\n" +
  "June: Yoga as Preventive measure for Lifestyle Disease (Obesity - Vajrasana/Hastotansana/Trikonasana/Ardha Matsyendrasana; Diabetes - Bhujangasana/Paschimottanasana/Pavan muktasana; Asthma - Sukhasana/Chakrasana/Gomukhasana/Parvatasana/Bhujangasana; Hypertension - Chakrasana/Bhujangasana/Shavasana).\n" +
  "July: Sports & Nutrition (Concept of balance diet & nutrition, Macro & Micro Nutrients, Food sources & functions, Nutritive & Non-Nutritive Components of Diet).\n" +
  "August: Physiology & Injuries in Sports (Physiological factors, Effect of exercise on Muscular System & CardioRespiratory System, Sports injuries classification - Soft Tissue/Bone & Joint Injuries - Dislocation/Fractures).\n" +
  "October: Biomechanics & Sports (Newton's Law of Motion, Equilibrium, Centre of Gravity, Friction & Sports, Projectile in Sports); Psychology & Sports (Personality/Aggression/Psychological Attributes - Self Esteem/Mental Imagery/Self-Talk/Goal Setting).\n" +
  "November: Training in Sports (Talent identification & Development, Sports Training Cycle - Micro/Meso/Macro Cycle, Types & Method to Develop Strength/Endurance/Speed/Flexibility & Coordinative Ability).\n" +
  "November-December: Pre-Board Examination (85% syllabus), Pre-Board Examination.\n" +
  "January: Practice Tests & Board Practical Commence.\n" +
  "February: Board Practical (Physical Fitness Test SAI, Khelo India test, BPFT, Marks Yogic Practices, Record File, Viva Voce).\n\n" +

  "=== EVALUATION RULES ===\n" +
  "1. DYNAMIC DOCUMENT ANALYSIS: Perform complete visual OCR and reading of all pages of the question paper and answer sheet. Extract the EXACT Student Name, Grade/Class/Section, Subject Title & Code, Exam Title, Date, and Maximum Marks of the paper.\n" +
  "2. STRICT NAME EXTRACTION: Look closely at the cover page/header of the student's answer sheet. Extract the exact student name written by the student or teacher. If no student name is present on the paper, output 'Student'. NEVER invent or hallucinate fake names.\n" +
  "3. SYLLABUS-ALIGNED EVALUATION: Use the above Class 12 Annual Plan to identify the exact chapter, unit, and topic being tested for accurate evaluation.\n" +
  "4. NO BOILERPLATE PHRASES: DO NOT write phrases like 'As per KSR Akshara Academy', 'According to Class 12 syllabus', or 'As per school plan' anywhere in the generated feedback text or report content. Keep all student-facing text completely natural, clean, professional, and direct.\n" +
  "5. ACCURATE MARK EVALUATION: Read every question and student answer carefully. Evaluate each question against the Question Paper mark scheme. Calculate exact marks scored per section and total marks obtained. NEVER output 0 marks or 'Unable to Evaluate' unless the paper is literally blank.\n" +
  "6. COVER PAGE MARK GRID: If the cover page or header of the answer sheet contains an official teacher mark grid/table or overall recorded score (e.g. 45/50, 62/70, 88/100), transcribe those exact marks.\n" +
  "7. SECTION BREAKDOWN: Identify all sections/parts present in the paper (e.g. Section A, Section B, Part 1, Part 2). For each section, provide sectionName, questionType, totalMarks, obtainedMarks, and performanceLevel.\n" +
  "8. SUBJECT-SPECIFIC FEEDBACK: Provide detailed, highly specific Strengths, Areas for Improvement, Core Concepts, and Actionable Study Tips tailored to the subject and specific concepts tested. Mention specific question numbers and topic details naturally.\n\n" +
  "Instructions for output JSON fields:\n" +
  "- studentName: Exact student name found on cover page of answer sheet, or 'Student' if not present on paper.\n" +
  "- gradeSection: Class and section as stated on paper (e.g. 'Grade XII - Symphony', 'Grade XII - M1', 'Grade XII - M2'). If not specified, output 'Grade XII'.\n" +
  "- subject: Full subject name and code as stated on paper (e.g. 'Physics', 'Mathematics', 'Chemistry', 'Computer Science', 'Economics', 'Applied Mathematics', 'Physical Education').\n" +
  "- examTitle: Exam title as stated on paper (e.g. 'Unit Test 1', 'Slip Test', 'Cumulative I', 'Periodic Exam', 'Pre-Board Examination'). If not specified, output 'Examination'.\n" +
  "- dateOfExam: Date of examination as stated on paper or current date.\n" +
  "- totalMaxMarks: Maximum total marks of the paper (numeric, e.g. 100, 70, 50, 40).\n" +
  "- totalMarksObtained: Total marks obtained by the student (numeric).\n" +
  "- evaluatedTotalMarks: Sum of evaluated section marks (numeric).\n" +
  "- summaryPerformanceLevel: Overall evaluation summary (e.g. 'Excellent Performance', 'Good Performance', 'Needs Improvement').\n" +
  "- footnote: Discrepancy note or empty string ''.\n" +
  "- sections: Array of section objects { sectionName, questionType, totalMarks, obtainedMarks, performanceLevel } matching the paper structure.\n" +
  "- coreConcepts: Array of 3-5 objects { title, detail } highlighting key core subject concepts tested. Do NOT include boilerplate phrases.\n" +
  "- studyTips: Array of 4-6 objects { title, detail } providing actionable, subject-tailored study tips. Do NOT include boilerplate phrases.\n" +
  "- strengths: Array of 3-5 objects { title, detail } with subject-specific positive feedback.\n" +
  "- areasForImprovement: Array of 3-5 objects { title, detail } with subject-specific actionable improvement areas.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    studentName: { type: "string" },
    gradeSection: { type: "string" },
    subject: { type: "string" },
    examTitle: { type: "string" },
    dateOfExam: { type: "string" },
    totalMaxMarks: { type: "number" },
    totalMarksObtained: { type: "number" },
    evaluatedTotalMarks: { type: "number" },
    summaryPerformanceLevel: { type: "string" },
    footnote: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sectionName: { type: "string" },
          questionType: { type: "string" },
          totalMarks: { type: "number" },
          obtainedMarks: { type: "number" },
          performanceLevel: { type: "string" }
        },
        required: ["sectionName", "questionType", "totalMarks", "obtainedMarks", "performanceLevel"]
      }
    },
    strengths: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    },
    areasForImprovement: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    },
    coreConcepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    },
    studyTips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" }
        },
        required: ["title", "detail"]
      }
    }
  },
  required: [
    "studentName",
    "gradeSection",
    "subject",
    "examTitle",
    "dateOfExam",
    "totalMaxMarks",
    "totalMarksObtained",
    "sections",
    "strengths",
    "areasForImprovement",
    "coreConcepts",
    "studyTips"
  ]
};

function normalizeMime(mime) {
  if (!mime || mime.includes('pdf') || mime.includes('octet-stream')) return 'application/pdf';
  return mime;
}

function partsFor(label, input) {
  if (!input) return [];
  const out = [{ text: "\n===== " + label + " =====" }];
  if (input.text && input.text.trim()) {
    out.push({ text: input.text.trim() });
  } else if (Array.isArray(input.images) && input.images.length > 0) {
    input.images.forEach(function (img) {
      if (img && img.data && img.mimeType) {
        out.push({ inlineData: { mimeType: normalizeMime(img.mimeType), data: img.data } });
      }
    });
  } else if (input.data && input.mimeType) {
    out.push({ inlineData: { mimeType: normalizeMime(input.mimeType), data: input.data } });
  } else {
    return [];
  }
  return out;
}

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }

function validateFile(input, label) {
  if (!input) return;
  if (Array.isArray(input.images)) {
    input.images.forEach(function (img) {
      if (!ALLOWED_MIME.test(img.mimeType || '')) {
        throw badRequest(label + ': unsupported file type');
      }
    });
    return;
  }
  if (!input.data) return;
  if (!ALLOWED_MIME.test(input.mimeType || '')) {
    throw badRequest(label + ': unsupported file type (use PDF, JPG, PNG or WebP)');
  }
  const bytes = Math.floor(String(input.data).length * 0.75);
  if (bytes > MAX_FILE_BYTES) throw badRequest(label + ': file too large (max 20 MB)');
}

// ---------- Gemini Provider ----------
async function generateWithGemini(inputs, key, modelName) {
  const model = modelName || GEMINI_MODEL();
  const parts = [{ text: SYSTEM_PROMPT }];
  Array.prototype.push.apply(parts, partsFor("SYLLABUS", inputs.syllabus));
  Array.prototype.push.apply(parts, partsFor("QUESTION PAPER", inputs.questionPaper));
  Array.prototype.push.apply(parts, partsFor("STUDENT WRITTEN ANSWER SHEET", inputs.answerPaper));
  if (inputs.notes && inputs.notes.trim()) {
    parts.push({ text: "\n===== ADDITIONAL INSTRUCTIONS =====\n" + inputs.notes.trim() });
  }
  parts.push({ text: "\nNow produce the structured evaluation report matching the schema." });

  const body = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };

  const MAX_RETRIES = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(GEMINI_ENDPOINT(model, key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const raw = await res.text();
      if (!res.ok) {
        let msg = "Gemini API error (HTTP " + res.status + ")";
        try {
          const j = JSON.parse(raw);
          if (j.error && j.error.message) msg = j.error.message;
        } catch (e) {}

        const err = new Error(msg);
        err.status = res.status;
        
        // If 503 (high demand) or 429 (rate limit), retry with backoff
        if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES) {
          console.warn(`[Gemini API] Got ${res.status} on attempt ${attempt}. Retrying in ${attempt * 1.5}s...`);
          await new Promise(r => setTimeout(r, attempt * 1500));
          continue;
        }
        throw err;
      }

      let data = JSON.parse(raw);
      const cand = data.candidates && data.candidates[0];
      const textOut = cand && cand.content && cand.content.parts &&
        cand.content.parts.map(function (p) { return p.text || ""; }).join("");
      if (!textOut) {
        const blocked = data.promptFeedback && data.promptFeedback.blockReason;
        throw new Error(blocked ? ("Request blocked: " + blocked) : "Gemini returned no content.");
      }

      return { report: JSON.parse(textOut), model: "Gemini (" + model + ")" };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && (err.status === 503 || err.status === 429)) {
        await new Promise(r => setTimeout(r, attempt * 1500));
      } else {
        throw err;
      }
    }
  }

  throw lastErr || new Error("Gemini API failed after retries.");
}

function getApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY.split(',').forEach(function (k) {
      if (k.trim() && !keys.includes(k.trim())) keys.push(k.trim());
    });
  }
  for (let i = 2; i <= 10; i++) {
    const envName = 'GEMINI_API_KEY_' + i;
    if (process.env[envName] && process.env[envName].trim()) {
      const val = process.env[envName].trim();
      if (!keys.includes(val)) keys.push(val);
    }
  }

  return keys;
}

// ---------- Evaluation Router ----------
async function generateReport(inputs) {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey || !geminiKey.trim()) {
    throw new Error('No GEMINI_API_KEY found. Please set it in .env');
  }

  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-3.5-flash'
  ];

  let lastErr = null;
  for (const model of candidateModels) {
    try {
      console.log(`[Report Engine] Using Gemini API (${model})...`);
      return await generateWithGemini(inputs, geminiKey.trim(), model);
    } catch (err) {
      console.error(`[Report Engine] Gemini model ${model} failed: ${err.message}`);
      lastErr = err;
    }
  }

  throw lastErr || new Error('Gemini API failed for all models.');
}

module.exports = { generateReport };
