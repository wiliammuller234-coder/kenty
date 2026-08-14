import { supabase } from '../lib/supabase';

// "Семья" links live in the DB (not localStorage) so marking two people as family
// sticks across devices/reinstalls and can be set up for someone by anyone who
// already shares a link with them — not just toggled locally by each person.
export async function getFamily(myPhone) {
  if (!myPhone) return [];
  const { data, error } = await supabase
    .from('family_links')
    .select('phone_a, phone_b')
    .or(`phone_a.eq.${myPhone},phone_b.eq.${myPhone}`);
  if (error || !data) return [];
  return data.map((row) => (row.phone_a === myPhone ? row.phone_b : row.phone_a));
}

export async function isFamily(myPhone, otherPhone) {
  return (await getFamily(myPhone)).includes(otherPhone);
}

export async function toggleFamily(myPhone, otherPhone) {
  const phoneA = myPhone < otherPhone ? myPhone : otherPhone;
  const phoneB = myPhone < otherPhone ? otherPhone : myPhone;
  const already = await isFamily(myPhone, otherPhone);
  if (already) {
    await supabase.from('family_links').delete().eq('phone_a', phoneA).eq('phone_b', phoneB);
  } else {
    await supabase.from('family_links').insert({ phone_a: phoneA, phone_b: phoneB });
  }
  return getFamily(myPhone);
}
