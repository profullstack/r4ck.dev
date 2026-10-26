import { createProfileStore } from '@profullstack/profile';
import { sql } from '@r4ck/db';

/**
 * The shared Profullstack profile (@profullstack/profile): email, names, company
 * domain, job title and LinkedIn, in the user_profiles table keyed by users.id
 * (migration 0002). Private to the account; never shown to anyone else.
 */
export const profiles = createProfileStore(sql);

/** The session user as the package's handlers want it: `{ id, email }` or null. */
export const profileUser = (c) => {
  const user = c.get('user');
  return user ? { id: user.id, email: user.email } : null;
};
