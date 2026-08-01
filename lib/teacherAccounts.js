/* Staff / Teacher Accounts Registry with Stream & Subject Access Control */
const ACCOUNTS = {
  "jayganesan@ksrakshara.org": {
    "name": "Mr. Jay ganesan",
    "password": "Aks@cuqw",
    "subjects": "English (XII -Harmony), English (XII -Melody 2)",
    "allowedCodes": ["ENG", "Eng", "English"],
    "allowedStreams": ["Bio - Maths", "Maths - CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "anthony@ksrakshara.org": {
    "name": "Mr. Anthony Polanki",
    "password": "Aks@ZJbR",
    "subjects": "Physics (XII -Harmony), Physics (XII -Melody 1)",
    "allowedCodes": ["PHY", "Physics"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "bhavaji@ksrakshara.org": {
    "name": "Mr. Shaik Bhavaji",
    "password": "Aks@vcnH",
    "subjects": "Chemistry (XII -Harmony), Chemistry (XII -Melody 1)",
    "allowedCodes": ["CHE", "Chemistry"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "anilkumar@ksrakshara.org": {
    "name": "Mr.Anil Kumar",
    "password": "Aks@jz9E",
    "subjects": "Math (XII -Harmony), Math (XII -Melody 1), Math (Class 10)",
    "allowedCodes": ["MAT", "MATH", "Math", "Mathematics"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "X Harmony", "X Melody", "X Symphony"]
  },
  "akhila@ksrakshara.org": {
    "name": "Ms. Akhila",
    "password": "Aks@PipY",
    "subjects": "Biology (XII -Harmony), Biology (XII -Melody 1)",
    "allowedCodes": ["BIO", "Biology"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "dhisounprabu@ksrakshara.org": {
    "name": "Mr. Dhisoun Prabu. D",
    "password": "Aks@Z8qq",
    "subjects": "CS (XII -Harmony)",
    "allowedCodes": ["CS", "Cs", "Computer Science"],
    "allowedStreams": ["Bio - Maths", "Full Portion Exam (FPE)", "Periodic Exam (PE)", "X Harmony"]
  },
  "deepaeng@ksrakshara.org": {
    "name": "Ms. Deepa B",
    "password": "Aks@FDuD",
    "subjects": "Phy. Edu (XII -Harmony), English (XII -Melody 1), Phy. Edu (XII -Melody 1), English (XII - Symphony)",
    "allowedCodes": ["ENG", "Eng", "English", "PED", "PE", "Phy. Edu", "Physical Education"],
    "allowedStreams": ["Bio - Maths", "Bio - CS", "Applied Math", "CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "sivakami@ksrakshara.org": {
    "name": "Ms. Sivakami.V",
    "password": "Aks@6Bht",
    "subjects": "CS (XII -Melody 1), CS (XII -Melody 2), CS (XII - Symphony)",
    "allowedCodes": ["CS", "Cs", "Computer Science"],
    "allowedStreams": ["Bio - CS", "Maths - CS", "CS", "Applied Math", "Full Portion Exam (FPE)", "Periodic Exam (PE)", "X Melody", "X Symphony"]
  },
  "nareshg@ksrakshara.org": {
    "name": "Mr. Naresh G",
    "password": "Aks@t7nT",
    "subjects": "Physics (XII -Melody 2)",
    "allowedCodes": ["PHY", "Physics"],
    "allowedStreams": ["Maths - CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "rajendrareddy@ksrakshara.org": {
    "name": "Mr. Rajendra Reddy",
    "password": "Aks@CULM",
    "subjects": "Chemistry (XII -Melody 2)",
    "allowedCodes": ["CHE", "Chemistry"],
    "allowedStreams": ["Maths - CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "girikumar@ksrakshara.org": {
    "name": "Mr. Giri Kumar",
    "password": "Aks@QKLu",
    "subjects": "Math (XII -Melody 2), Math (Class 10)",
    "allowedCodes": ["MAT", "MATH", "Math", "Mathematics"],
    "allowedStreams": ["Maths - CS", "X Harmony", "X Melody", "X Symphony"]
  },
  "saranyasped@ksrakshara.org": {
    "name": "Ms. Saranya S",
    "password": "Aks@pYMs",
    "subjects": "Phy. Edu (XII -Melody 2), Phy. Edu (XII - Symphony)",
    "allowedCodes": ["PED", "PE", "Phy. Edu", "Physical Education"],
    "allowedStreams": ["Maths - CS", "Applied Math", "CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "sakthisundaravadivel@ksrakshara.org": {
    "name": "Mr. Sakthisundaravadivel.A",
    "password": "Aks@A2Qg",
    "subjects": "App. Math (XII - Symphony)",
    "allowedCodes": ["A.Math", "Applied Mathematics", "App. Math"],
    "allowedStreams": ["Applied Math", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "dhaneshkumarm@ksrakshara.org": {
    "name": "Mr. Dhanesh Kumar M",
    "password": "Aks@MKw7",
    "subjects": "Accountancy (XII - Symphony), Business (XII - Symphony)",
    "allowedCodes": ["Acc", "Accountancy", "Bs", "Business", "Business Studies"],
    "allowedStreams": ["Applied Math", "CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "shareefa@ksrakshara.org": {
    "name": "Mr. Shareef A",
    "password": "Aks@RDi3",
    "subjects": "Economics (XII - Symphony)",
    "allowedCodes": ["Eco", "Economics"],
    "allowedStreams": ["Applied Math", "CS", "Full Portion Exam (FPE)", "Periodic Exam (PE)"]
  },
  "aksharaacademy": {
    "name": "Master Administrator",
    "password": "aksharaacademy@98?",
    "isAdmin": true,
    "allowedCodes": null,
    "allowedStreams": null
  }
};

function verifyTeacherLogin(userInput, passInput) {
  const user = (userInput || '').trim().toLowerCase();
  const pass = (passInput || '').trim();
  if (!user || !pass) return false;

  const expectedUser = (process.env.ADMIN_USER || 'aksharaacademy').toLowerCase();
  const expectedPass = process.env.ADMIN_PASS || 'aksharaacademy@98?';
  if (user === expectedUser && pass === expectedPass) {
    return { ok: true, name: 'Master Administrator', user: expectedUser, allowedCodes: null, allowedStreams: null, isAdmin: true };
  }

  const acc = ACCOUNTS[user];
  if (acc && acc.password === pass) {
    return { ok: true, name: acc.name, user: user, subjects: acc.subjects, allowedCodes: acc.allowedCodes || null, allowedStreams: acc.allowedStreams || null, isAdmin: false };
  }
  return false;
}

module.exports = { ACCOUNTS, verifyTeacherLogin };
