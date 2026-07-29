/* Staff / Teacher Accounts Registry */
const ACCOUNTS = {
  "jayganesan@ksrakshara.org": {
    "name": "Mr. Jay ganesan",
    "password": "Aks@cuqw",
    "subjects": "English (XII -Harmony), English (XII -Melody 2)"
  },
  "anthony@ksrakshara.org": {
    "name": "Mr. Anthony Polanki",
    "password": "Aks@ZJbR",
    "subjects": "Physics (XII -Harmony), Physics (XII -Melody 1)"
  },
  "bhavaji@ksrakshara.org": {
    "name": "Mr. Shaik Bhavaji",
    "password": "Aks@vcnH",
    "subjects": "Chemistry (XII -Harmony), Chemistry (XII -Melody 1)"
  },
  "anilkumar@ksrakshara.org": {
    "name": "Mr.Anil Kumar",
    "password": "Aks@jz9E",
    "subjects": "Math (XII -Harmony), Math (XII -Melody 1)"
  },
  "akhila@ksrakshara.org": {
    "name": "Ms. Akhila",
    "password": "Aks@PipY",
    "subjects": "Biology (XII -Harmony), Biology (XII -Melody 1)"
  },
  "dhisounprabu@ksrakshara.org": {
    "name": "Mr. Dhisoun Prabu. D",
    "password": "Aks@Z8qq",
    "subjects": "CS (XII -Harmony)"
  },
  "deepaeng@ksrakshara.org": {
    "name": "Ms. Deepa B",
    "password": "Aks@FDuD",
    "subjects": "Phy. Edu (XII -Harmony), English (XII -Melody 1), Phy. Edu (XII -Melody 1), English (XII - Symphony)"
  },
  "sivakami@ksrakshara.org": {
    "name": "Ms. Sivakami.V",
    "password": "Aks@6Bht",
    "subjects": "CS (XII -Melody 1), CS (XII -Melody 2), CS (XII - Symphony)"
  },
  "nareshg@ksrakshara.org": {
    "name": "Mr. Naresh G",
    "password": "Aks@t7nT",
    "subjects": "Physics (XII -Melody 2)"
  },
  "rajendrareddy@ksrakshara.org": {
    "name": "Mr. Rajendra Reddy",
    "password": "Aks@CULM",
    "subjects": "Chemistry (XII -Melody 2)"
  },
  "girikumar@ksrakshara.org": {
    "name": "Mr. Giri Kumar",
    "password": "Aks@QKLu",
    "subjects": "Math (XII -Melody 2)"
  },
  "saranyasped@ksrakshara.org": {
    "name": "Ms. Saranya S",
    "password": "Aks@pYMs",
    "subjects": "Phy. Edu (XII -Melody 2), Phy. Edu (XII - Symphony)"
  },
  "sakthisundaravadivel@ksrakshara.org": {
    "name": "Mr. Sakthisundaravadivel.A",
    "password": "Aks@A2Qg",
    "subjects": "App. Math (XII - Symphony)"
  },
  "dhaneshkumarm@ksrakshara.org": {
    "name": "Mr. Dhanesh Kumar M",
    "password": "Aks@MKw7",
    "subjects": "Accountancy (XII - Symphony), Business (XII - Symphony)"
  },
  "shareefa@ksrakshara.org": {
    "name": "Mr. Shareef A",
    "password": "Aks@RDi3",
    "subjects": "Economics (XII - Symphony)"
  },
  "aksharaacademy": {
    "name": "Master Administrator",
    "password": "aksharaacademy@98?",
    "isAdmin": true
  }
};

function verifyTeacherLogin(userInput, passInput) {
  const user = (userInput || '').trim().toLowerCase();
  const pass = (passInput || '').trim();
  if (!user || !pass) return false;

  const expectedUser = (process.env.ADMIN_USER || 'aksharaacademy').toLowerCase();
  const expectedPass = process.env.ADMIN_PASS || 'aksharaacademy@98?';
  if (user === expectedUser && pass === expectedPass) {
    return { ok: true, name: 'Master Administrator', user: expectedUser };
  }

  const acc = ACCOUNTS[user];
  if (acc && acc.password === pass) {
    return { ok: true, name: acc.name, user: user, subjects: acc.subjects };
  }
  return false;
}

module.exports = { ACCOUNTS, verifyTeacherLogin };
