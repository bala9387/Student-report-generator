/* Staff / Teacher Accounts Registry with Stream & Subject Access Control */
const ACCOUNTS = {
  "jayganesan@ksrakshara.org": {
    "name": "Mr. Jay ganesan",
    "password": "Akshara@123",
    "subjects": "English (XII -Harmony), English (XII -Melody 2)",
    "allowedCodes": ["ENG", "Eng", "English"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"]
  },
  "anthony@ksrakshara.org": {
    "name": "Mr. Anthony Polanki",
    "password": "Akshara@123",
    "subjects": "Physics (XII -Harmony), Physics (XII -Melody 1)",
    "allowedCodes": ["PHY", "Physics"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS"]
  },
  "bhavaji@ksrakshara.org": {
    "name": "Mr. Shaik Bhavaji",
    "password": "Akshara@123",
    "subjects": "Chemistry (XII -Harmony), Chemistry (XII -Melody 1)",
    "allowedCodes": ["CHE", "Chemistry"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS"]
  },
  "anilkumar@ksrakshara.org": {
    "name": "Mr.Anil Kumar",
    "password": "Akshara@123",
    "subjects": "Math (XII -Harmony), Math (XII -Melody 1), Math (Class 10)",
    "allowedCodes": ["MAT", "MATH", "Math", "Mathematics"],
    "allowedStreams": ["Bio - Maths", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "akhila@ksrakshara.org": {
    "name": "Ms. Akhila",
    "password": "Akshara@123",
    "subjects": "Biology (XII -Harmony), Biology (XII -Melody 1)",
    "allowedCodes": ["BIO", "Biology"],
    "allowedStreams": ["Bio - Maths", "Bio - CS"]
  },
  "dhisounprabu@ksrakshara.org": {
    "name": "Mr. Dhisoun Prabu. D",
    "password": "Akshara@123",
    "subjects": "CS (XII -Harmony), AI (Class 10)",
    "allowedCodes": ["CS", "Cs", "Computer Science", "AI", "Ai", "Artificial Intelligence"],
    "allowedStreams": ["Bio - CS", "Maths - CS", "CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "deepaeng@ksrakshara.org": {
    "name": "Ms. Deepa B",
    "password": "Akshara@123",
    "subjects": "Phy. Edu (XII -Harmony), English (XII -Melody 1), Phy. Edu (XII -Melody 1), English (XII - Symphony), English (Class 10)",
    "allowedCodes": ["ENG", "Eng", "English", "PED", "PE", "Phy. Edu", "Physical Education"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "sivakami@ksrakshara.org": {
    "name": "Ms. Sivakami.V",
    "password": "Akshara@123",
    "subjects": "CS (XII -Melody 1), CS (XII -Melody 2), CS (XII - Symphony)",
    "allowedCodes": ["CS", "Cs", "Computer Science"],
    "allowedStreams": ["Bio - CS", "Maths - CS", "CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "nareshg@ksrakshara.org": {
    "name": "Mr. Naresh G",
    "password": "Akshara@123",
    "subjects": "Physics (XII -Melody 2), Physics (Class 10)",
    "allowedCodes": ["PHY", "Physics", "SCI", "Sci", "Science"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "rajendrareddy@ksrakshara.org": {
    "name": "Mr. Rajendra Reddy",
    "password": "Akshara@123",
    "subjects": "Chemistry (XII -Melody 2), Chemistry (Class 10)",
    "allowedCodes": ["CHE", "Chemistry", "SCI", "Sci", "Science"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "girikumar@ksrakshara.org": {
    "name": "Mr. Giri Kumar",
    "password": "Akshara@123",
    "subjects": "Math (XII -Melody 2), Math (Class 10)",
    "allowedCodes": ["MAT", "MATH", "Math", "Mathematics"],
    "allowedStreams": ["Bio - Maths", "Maths - CS", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "saranyasped@ksrakshara.org": {
    "name": "Ms. Saranya S",
    "password": "Akshara@123",
    "subjects": "Phy. Edu (XII -Melody 2), Phy. Edu (XII - Symphony)",
    "allowedCodes": ["PED", "PE", "Phy. Edu", "Physical Education"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Maths - CS", "Applied Math", "CS"]
  },
  "sakthisundaravadivel@ksrakshara.org": {
    "name": "Mr. Sakthisundaravadivel.A",
    "password": "Akshara@123",
    "subjects": "App. Math (XII - Symphony), Math (Class 10)",
    "allowedCodes": ["A.Math", "Applied Mathematics", "App. Math", "MAT", "MATH", "Math", "Mathematics"],
    "allowedStreams": ["Applied Math", "X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "dhaneshkumarm@ksrakshara.org": {
    "name": "Mr. Dhanesh Kumar M",
    "password": "Akshara@123",
    "subjects": "Accountancy (XII - Symphony), Business (XII - Symphony)",
    "allowedCodes": ["Acc", "Accountancy", "Bs", "Business", "Business Studies"],
    "allowedStreams": ["Applied Math", "CS"]
  },
  "shareefa@ksrakshara.org": {
    "name": "Mr. Shareef A",
    "password": "Akshara@123",
    "subjects": "Economics (XII - Symphony)",
    "allowedCodes": ["Eco", "Economics"],
    "allowedStreams": ["Applied Math", "CS"]
  },

  /* ── Class 10 Handling Staff ── */
  "mythily@ksrakshara.org": {
    "name": "Ms. Mythily.M",
    "password": "Akshara@123",
    "subjects": "English (Class 10)",
    "allowedCodes": ["ENG", "Eng", "English"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "ramaladevi@ksrakshara.org": {
    "name": "Ms. Ramaladevi",
    "password": "Akshara@123",
    "subjects": "Tamil (Class 10)",
    "allowedCodes": ["TAM", "Tam", "Tamil", "L2"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "rathatamil@ksrakshara.org": {
    "name": "Ms. Ratha R",
    "password": "Akshara@123",
    "subjects": "Tamil (Class 10)",
    "allowedCodes": ["TAM", "Tam", "Tamil", "L2"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "suganthi@ksrakshara.org": {
    "name": "Ms. Suganthi. D",
    "password": "Akshara@123",
    "subjects": "Hindi (Class 10)",
    "allowedCodes": ["HIN", "Hin", "Hindi", "L2"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "sudhamath@ksrakshara.org": {
    "name": "Ms. Sudha.S",
    "password": "Akshara@123",
    "subjects": "Math (Class 10)",
    "allowedCodes": ["MAT", "MATH", "Math", "Mathematics"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "sudhabio@ksrakshara.org": {
    "name": "Ms. Sudha.G",
    "password": "Akshara@123",
    "subjects": "Science (Class 10)",
    "allowedCodes": ["SCI", "Sci", "Science", "PHY", "CHE", "BIO"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "umascience@ksrakshara.org": {
    "name": "Ms. Uma Maheswari.D",
    "password": "Akshara@123",
    "subjects": "Phy. Sci (Class 10)",
    "allowedCodes": ["SCI", "Sci", "Science", "PHY", "CHE", "BIO"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "subathra@ksrakshara.org": {
    "name": "Ms. Subathra.S",
    "password": "Akshara@123",
    "subjects": "Bio sci (Class 10)",
    "allowedCodes": ["SCI", "Sci", "Science", "PHY", "CHE", "BIO"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "yamini@ksrakshara.org": {
    "name": "Ms. Yamini.S",
    "password": "Akshara@123",
    "subjects": "Social (Class 10)",
    "allowedCodes": ["SOC", "Soc", "Social", "Social Science", "SST"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "abirami@ksrakshara.org": {
    "name": "Ms. Abirami.R",
    "password": "Akshara@123",
    "subjects": "AI (Class 10)",
    "allowedCodes": ["AI", "Ai", "Artificial Intelligence", "CS"],
    "allowedStreams": ["X Harmony", "X Melody", "X Symphony", "10 H", "10 M", "10 S"]
  },
  "pratheeshab@ksrakshara.org": {
    "name": "Ms. Pratheesha B",
    "password": "Akshara@123",
    "subjects": "Biology (Class 10)",
    "allowedCodes": ["SCI", "Sci", "Science", "BIO", "Biology"],
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

const DYNAMIC_PASSWORDS = {};

function verifyTeacherLogin(userInput, passInput) {
  const rawUser = (userInput || '').trim().toLowerCase();
  const pass = (passInput || '').trim();
  if (!rawUser || !pass) return false;

  const expectedUser = (process.env.ADMIN_USER || 'aksharaacademy').toLowerCase();
  const expectedPass = DYNAMIC_PASSWORDS['aksharaacademy'] || process.env.ADMIN_PASS || 'aksharaacademy@98?';
  if ((rawUser === expectedUser || rawUser === expectedUser + '@ksrakshara.org') && pass === expectedPass) {
    return { ok: true, name: 'Master Administrator', user: expectedUser, allowedCodes: null, allowedStreams: null, isAdmin: true };
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
    return { ok: true, name: acc.name, user: key, subjects: acc.subjects, allowedCodes: acc.allowedCodes || null, allowedStreams: acc.allowedStreams || null, isAdmin: false };
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

module.exports = { ACCOUNTS, verifyTeacherLogin, updateTeacherPassword, getTeacherAccount };
