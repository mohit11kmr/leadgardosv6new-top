const html = '<a href="https://wa.me/919876543210">x</a>';
const whatsapps = [...html.matchAll(/(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com)[^\"\'\s<]*|whatsapp:\/\/[^\"\'\s<]*)/gi)].map((m) => m[0]);
console.log('Found:', whatsapps);
for (const link of whatsapps) {
  const digits = link.replace(/\D/g, '');
  console.log('Digits:', digits);
  console.log('Starts with 0:', digits.startsWith('0'));
  console.log('Starts with 9191:', digits.startsWith('9191'));
  console.log('Starts with 91:', digits.startsWith('91'));
  const pattern = /^91[6-9]\d{9}$/;
  console.log('Matches pattern:', pattern.test(digits));
  const issue = digits.startsWith('0') ? 'Leading 0 prefix detected.' : 
    digits.startsWith('9191') ? 'Duplicated +91 country code detected.' : 
    !digits.startsWith('91') ? 'Configured Indian mode expects an international +91 number.' : 
    !pattern.test(digits) ? 'Number is not a valid Indian mobile format.' : '';
  console.log('Issue:', issue || 'NONE');
}
