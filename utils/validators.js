function validateRequired(value, fieldName) {
  if (value === undefined || value === null) return `${fieldName} is required.`;
  if (typeof value === 'string' && value.trim() === '') return `${fieldName} is required.`;
  return null;
}

function validateEmail(value) {
  if (!value || !value.trim()) return 'Email is required.';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(value.trim())) return 'Please enter a valid email address.';
  return null;
}

function validatePassword(value) {
  if (!value) return 'Password is required.';
  return null;
}

function validateNumber(value, fieldName, min, max) {
  const n = parseFloat(value);
  if (isNaN(n)) return `${fieldName} must be a number.`;
  if (min !== undefined && n < min) return `${fieldName} must be at least ${min}.`;
  if (max !== undefined && n > max) return `${fieldName} must be at most ${max}.`;
  return null;
}

function validateDate(value, fieldName) {
  if (!value) return `${fieldName} is required.`;
  if (isNaN(new Date(value).getTime())) return `${fieldName} is not a valid date.`;
  return null;
}

function validateForm(fields) {
  const errors = [];
  for (const [value, fieldName, ...validators] of fields) {
    const err = validateRequired(value, fieldName);
    if (err) { errors.push(err); continue; }
    for (const vFn of validators) {
      const e = vFn(value);
      if (e) { errors.push(e); break; }
    }
  }
  return errors.length ? errors.join(' ') : null;
}

function validateTaskStatusTransition(current, next) {
  const allowed = {
    assigned: ['acknowledged'],
    acknowledged: ['in_progress'],
    in_progress: ['completed'],
    completed: ['reviewed'],
    reviewed: [],
  };
  const transitions = allowed[current] || [];
  return transitions.includes(next);
}

function validateDailyHours(existingHours, newHours, max) {
  const total = existingHours + newHours;
  if (total > (max || 8)) {
    return `Cannot log ${newHours}h \u2014 total would be ${total}h (max is ${max || 8}h per day).`;
  }
  return null;
}
