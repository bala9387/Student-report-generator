/* Staff / Teacher Accounts Registry with Stream & Subject Access Control */

function toCanonicalSubject(subj) {
  if (!subj) return '';
  const s = String(subj).trim();
  const u = s.toUpperCase().replace(/[^A-Z0-9.]/g, '');

  if (u === 'ENG' || u === 'ENGLISH') return 'ENG';
  if (u === 'PED' || u === 'PE' || /^PHY.*ED/i.test(s) || s.toLowerCase() === 'phy. edu') return 'PED';
  if (u === 'PHY' || u === 'PHYSICS') return 'PHY';
  if (u === 'CHE' || u === 'CHEMISTRY') return 'CHE';
  if (u === 'A.MATH' || u === 'AMATH' || /^APP.*MAT/i.test(s) || s.toLowerCase() === 'applied math' || s.toLowerCase() === 'applied mathematics') return 'A.Math';
  if (u === 'MAT' || u === 'MATH' || u === 'MATHS' || u === 'MATHEMATICS') return 'MAT';
  if (u === 'BIO' || u === 'BIOLOGY' || /^BIO.*SCI/i.test(s)) return 'BIO';
  if (u === 'CS' || u === 'COMP' || u === 'COMPUTERSCIENCE' || s.toLowerCase() === 'computer science') return 'CS';
  if (u === 'AI' || s.toLowerCase() === 'artificial intelligence') return 'AI';
  if (u === 'ACC' || u === 'ACCOUNTANCY') return 'Acc';
  if (u === 'BS' || u === 'BST' || u === 'BUSINESS' || s.toLowerCase() === 'business studies') return 'Bs';
  if (u === 'ECO' || u === 'ECONOMICS') return 'Eco';
  if (u === 'TAM' || u === 'TAMIL' || u === 'L2') return 'TAM';
  if (u === 'HIN' || u === 'HINDI') return 'TAM'; // In Class 10 sheet, Hindi is entered under Language 2 (TAM) column
  if (u === 'SOC' || u === 'SCO' || u === 'SST' || /^SOC.*SCI/i.test(s) || s.toLowerCase() === 'social science' || s.toLowerCase() === 'social') return 'SOC';
  if (u === 'SCI' || u === 'SCIENCE' || /^PHY.*SCI/i.test(s) || s.toLowerCase() === 'physical science' || s.toLowerCase() === 'biological science') return 'SCI';

  return s;
}

const ACCOUNTS = {
  "jayganesan@ksrakshara.org": {
    "name": "Mr. Jay Ganesan",
    "password": "Akshara@123",
    "subjects": "English (XII Harmony, XII Melody 2, Class XI)",
    "allowedCodes": ["ENG", "English"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"]
  },
  "anthony@ksrakshara.org": {
    "name": "Mr. Anthony Polanki",
    "password": "Akshara@123",
    "subjects": "Physics (XII Harmony, XII Melody 1, Class XI)",
    "allowedCodes": ["PHY", "Physics"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS"]
  },
  "bhavaji@ksrakshara.org": {
    "name": "Mr. Shaik Bhavaji",
    "password": "Akshara@123",
    "subjects": "Chemistry (XII Harmony, XII Melody 1, Class XI)",
    "allowedCodes": ["CHE", "Chemistry"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS"]
  },
  "anilkumar@ksrakshara.org": {
    "name": "Mr. Anil Kumar",
    "password": "Akshara@123",
    "subjects": "Math (XII Harmony, XII Melody 1, Class 10, Class XI)",
    "allowedCodes": ["MAT", "Math", "Mathematics"],
    "allowedStreams": ["Bio - Maths", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "akhila@ksrakshara.org": {
    "name": "Ms. Akhila",
    "password": "Akshara@123",
    "subjects": "Biology (XII Harmony, XII Melody 1, Class XI)",
    "allowedCodes": ["BIO", "Biology"],
    "allowedStreams": ["Bio - Maths", "Bio - CS"]
  },
  "dhisounprabu@ksrakshara.org": {
    "name": "Mr. Dhisoun Prabu. D",
    "password": "Akshara@123",
    "subjects": "CS (XII Harmony, Class XI), AI (Class 10)",
    "allowedCodes": ["CS", "AI"],
    "gradeCodes": {
      "10": ["AI", "Artificial Intelligence"],
      "11": ["CS", "Computer Science"],
      "12": ["CS", "Computer Science"]
    },
    "allowedStreams": ["Bio - CS", "Maths - CS", "CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "deepaeng@ksrakshara.org": {
    "name": "Ms. Deepa B",
    "password": "Akshara@123",
    "subjects": "Phy. Edu & English (XII Melody 1, XII Symphony, Class XI), English (Class 10)",
    "allowedCodes": ["ENG", "PED"],
    "gradeCodes": {
      "10": ["ENG", "English"],
      "11": ["ENG", "PED", "Physical Education"],
      "12": ["ENG", "PED", "Physical Education"]
    },
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "sivakami@ksrakshara.org": {
    "name": "Ms. Sivakami.V",
    "password": "Akshara@123",
    "subjects": "CS (XII Melody 1, XII Melody 2, XII Symphony, Class XI)",
    "allowedCodes": ["CS", "Computer Science"],
    "allowedStreams": ["Bio - CS", "Maths - CS", "CS"]
  },
  "nareshg@ksrakshara.org": {
    "name": "Mr. Naresh G",
    "password": "Akshara@123",
    "subjects": "Physics (XII Melody 2, Class XI), Science / Physics (Class 10)",
    "allowedCodes": ["PHY", "SCI"],
    "gradeCodes": {
      "10": ["SCI", "Science"],
      "11": ["PHY", "Physics"],
      "12": ["PHY", "Physics"]
    },
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "rajendrareddy@ksrakshara.org": {
    "name": "Mr. Rajendra Reddy",
    "password": "Akshara@123",
    "subjects": "Chemistry (XII Melody 2, Class XI), Science / Chemistry (Class 10)",
    "allowedCodes": ["CHE", "SCI"],
    "gradeCodes": {
      "10": ["SCI", "Science"],
      "11": ["CHE", "Chemistry"],
      "12": ["CHE", "Chemistry"]
    },
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "girikumar@ksrakshara.org": {
    "name": "Mr. Giri Kumar",
    "password": "Akshara@123",
    "subjects": "Math (XII Melody 2, Class 10, Class XI)",
    "allowedCodes": ["MAT", "Math", "Mathematics"],
    "allowedStreams": ["Bio - Maths", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "saranyasped@ksrakshara.org": {
    "name": "Ms. Saranya S",
    "password": "Akshara@123",
    "subjects": "Phy. Edu (XII Melody 2, XII Symphony, Class XI)",
    "allowedCodes": ["PED", "PE", "Physical Education"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"]
  },
  "sakthisundaravadivel@ksrakshara.org": {
    "name": "Mr. Sakthisundaravadivel.A",
    "password": "Akshara@123",
    "subjects": "App. Math (XII Symphony, Class XI), Math (Class 10)",
    "allowedCodes": ["A.Math", "MAT"],
    "gradeCodes": {
      "10": ["MAT", "Math"],
      "11": ["A.Math", "Applied Mathematics"],
      "12": ["A.Math", "Applied Mathematics"]
    },
    "allowedStreams": ["Applied Math", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "dhaneshkumarm@ksrakshara.org": {
    "name": "Mr. Dhanesh Kumar M",
    "password": "Akshara@123",
    "subjects": "Accountancy & Business (XII Symphony, Class XI)",
    "allowedCodes": ["Acc", "Accountancy", "Bs", "Business", "Business Studies"],
    "allowedStreams": ["Applied Math", "CS"]
  },
  "shareefa@ksrakshara.org": {
    "name": "Mr. Shareef A",
    "password": "Akshara@123",
    "subjects": "Economics (XII Symphony, Class XI)",
    "allowedCodes": ["Eco", "Economics"],
    "allowedStreams": ["Applied Math", "CS"]
  },

  /* ── Class 10 Handling Staff ── */
  "mythily@ksrakshara.org": {
    "name": "Ms. Mythily.M",
    "password": "Akshara@123",
    "subjects": "English (Class 10)",
    "allowedCodes": ["ENG", "English"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "ramaladevi@ksrakshara.org": {
    "name": "Ms. Ramaladevi",
    "password": "Akshara@123",
    "subjects": "Tamil (Class 10)",
    "allowedCodes": ["TAM", "Tamil"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "rathatamil@ksrakshara.org": {
    "name": "Ms. Ratha R",
    "password": "Akshara@123",
    "subjects": "Tamil (Class 10)",
    "allowedCodes": ["TAM", "Tamil"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "suganthi@ksrakshara.org": {
    "name": "Ms. Suganthi. D",
    "password": "Akshara@123",
    "subjects": "Hindi (Class 10)",
    "allowedCodes": ["TAM", "HIN", "Hindi", "L2"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "sudhamath@ksrakshara.org": {
    "name": "Ms. Sudha.S",
    "password": "Akshara@123",
    "subjects": "Math (Class 10)",
    "allowedCodes": ["MAT", "Math", "Mathematics"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "sudhabio@ksrakshara.org": {
    "name": "Ms. Sudha.G",
    "password": "Akshara@123",
    "subjects": "Science (Class 10)",
    "allowedCodes": ["SCI", "Science"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "umascience@ksrakshara.org": {
    "name": "Ms. Uma Maheswari.D",
    "password": "Akshara@123",
    "subjects": "Physical Science (Class 10)",
    "allowedCodes": ["SCI", "Science"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "subathra@ksrakshara.org": {
    "name": "Ms. Subathra.S",
    "password": "Akshara@123",
    "subjects": "Biological Science (Class 10)",
    "allowedCodes": ["SCI", "Science"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "yamini@ksrakshara.org": {
    "name": "Ms. Yamini.S",
    "password": "Akshara@123",
    "subjects": "Social Science (Class 10)",
    "allowedCodes": ["SOC", "Social Science"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "abirami@ksrakshara.org": {
    "name": "Ms. Abirami.R",
    "password": "Akshara@123",
    "subjects": "Artificial Intelligence (Class 10)",
    "allowedCodes": ["AI", "Artificial Intelligence"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "pratheeshab@ksrakshara.org": {
    "name": "Ms. Pratheesha B",
    "password": "Akshara@123",
    "subjects": "Biology / Science (Class 10)",
    "allowedCodes": ["SCI", "Science"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },

  "aksharaacademy": {
    "name": "Master Administrator",
    "password": "aksharaacademy@98?",
    "isAdmin": true,
    "allowedCodes": null,
    "allowedStreams": null
  }
};

function getTeacherAllowedCodes(acc, grade) {
  if (!acc) return null;
  const g = String(grade || "12").trim();
  if (acc.gradeCodes) {
    if ((g === "10" || g === "X") && acc.gradeCodes["10"]) return acc.gradeCodes["10"];
    if ((g === "11" || g === "XI") && acc.gradeCodes["11"]) return acc.gradeCodes["11"];
    if (acc.gradeCodes["12"]) return acc.gradeCodes["12"];
  }
  return acc.allowedCodes || null;
}

const DYNAMIC_PASSWORDS = {};

function verifyTeacherLogin(userInput, passInput) {
  const rawUser = (userInput || '').trim().toLowerCase();
  const pass = (passInput || '').trim();
  if (!rawUser || !pass) return false;

  const expectedUser = (process.env.ADMIN_USER || 'aksharaacademy').toLowerCase();
  const expectedPass = DYNAMIC_PASSWORDS['aksharaacademy'] || process.env.ADMIN_PASS || 'aksharaacademy@98?';
  if ((rawUser === expectedUser || rawUser === expectedUser + '@ksrakshara.org') && pass === expectedPass) {
    return { ok: true, name: 'Master Administrator', user: expectedUser, allowedCodes: null, allowedStreams: null, gradeCodes: null, isAdmin: true };
  }

  let key = rawUser;
  if (!ACCOUNTS[key]) {
    if (!key.includes('@')) {
      key = rawUser + '@ksrakshara.org';
    } else {
      const handle = rawUser.split('@')[0];
      key = handle + '@ksrakshara.org';
    }
  }

  const acc = ACCOUNTS[key] || ACCOUNTS[rawUser];
  const activePass = DYNAMIC_PASSWORDS[key] || DYNAMIC_PASSWORDS[rawUser] || (acc && acc.password);
  if (acc && activePass === pass) {
    return {
      ok: true,
      name: acc.name,
      user: key,
      subjects: acc.subjects,
      allowedCodes: acc.allowedCodes || null,
      allowedStreams: acc.allowedStreams || null,
      gradeCodes: acc.gradeCodes || null,
      isAdmin: false
    };
  }
  return false;
}

function updateTeacherPassword(userInput, newPass) {
  const user = (userInput || '').trim().toLowerCase();
  const pass = (newPass || '').trim();
  if (!user || !pass) return false;

  let key = user;
  if (!ACCOUNTS[key] && !key.includes('@')) {
    key = user + '@ksrakshara.org';
  }

  if (key === 'aksharaacademy' || key === 'aksharaacademy@ksrakshara.org') {
    DYNAMIC_PASSWORDS['aksharaacademy'] = pass;
    DYNAMIC_PASSWORDS['aksharaacademy@ksrakshara.org'] = pass;
    return true;
  }

  if (ACCOUNTS[key]) {
    ACCOUNTS[key].password = pass;
    DYNAMIC_PASSWORDS[key] = pass;
    return true;
  }
  return false;
}

function getTeacherAccount(userInput) {
  const user = (userInput || '').trim().toLowerCase();
  if (!user) return null;

  let key = user;
  if (!ACCOUNTS[key] && !key.includes('@')) {
    key = user + '@ksrakshara.org';
  }

  if (key === 'aksharaacademy' || key === 'aksharaacademy@ksrakshara.org') {
    return { name: 'Master Administrator', user: 'aksharaacademy', email: 'aksharaacademy@ksrakshara.org', isAdmin: true };
  }

  const acc = ACCOUNTS[key];
  if (acc) {
    return { name: acc.name, user: key, email: key, subjects: acc.subjects, isAdmin: false };
  }
  return null;
}

module.exports = {
  ACCOUNTS,
  toCanonicalSubject,
  getTeacherAllowedCodes,
  verifyTeacherLogin,
  updateTeacherPassword,
  getTeacherAccount
};
