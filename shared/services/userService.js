// FROZEN classic copy — still loaded by index.html (HQ portal). The canonical
// module version lives beside this file (.ts); delete this one when HQ converts.
async function fetchUsers() {
  const { data, error } = await sb.from('intern_users').select('*');
  if (error) { handleServiceError('fetchUsers', error); return []; }
  return data;
}

function getUserById(users, id) {
  return users.find(u => u.id === id) || {};
}

function getInterns(users) {
  return users.filter(u => u.role === ROLES.INTERN);
}

function getStaff(users) {
  return users.filter(u => u.role !== ROLES.INTERN);
}
