(async () => {
  try {
    const base = 'http://localhost:4000/api';
    const fetch = globalThis.fetch || (await import('node-fetch')).default;

    const login = async (email, password) => {
      const r = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error('Login failed: ' + JSON.stringify(j));
      return j;
    };

    console.log('1) Logging in as shraddha@example.com');
    const shr = await login('shraddha@example.com', 'seed');
    const token = shr.token;
    console.log('  logged in, user id=', shr.user.id);

    // tiny 1x1 PNG data URL
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

    console.log('2) Uploading data URL as profileImage via PUT /profile');
    let r = await fetch(base + '/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ profileImage: dataUrl }) });
    const putRes = await r.json();
    console.log('  status:', r.status, 'body:', putRes);
    if (!r.ok) throw new Error('PUT /profile failed: ' + JSON.stringify(putRes));

    if (!putRes.user || !putRes.user.profileImage) throw new Error('Unexpected PUT response: missing user.profileImage');
    const returned = putRes.user.profileImage;
    if (!returned.startsWith('data:')) {
      console.warn('  Note: server returned non-data URL (likely multer path) in profileImage:', returned);
    } else {
      console.log('  server returned data URL as expected');
    }

    console.log('3) Checking allowed methods for /profile/avatar (OPTIONS)');
    let rOpt = await fetch(base + '/profile/avatar', { method: 'OPTIONS', headers: { Authorization: 'Bearer ' + token } });
    console.log('  OPTIONS status:', rOpt.status, 'Allow:', rOpt.headers.get('allow'));
    const optText = await rOpt.text();
    if (optText && optText.length) console.log('  OPTIONS body snippet:', optText.slice(0,200));

    console.log('4) Deleting avatar with DELETE /profile/avatar');
    r = await fetch(base + '/profile/avatar', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    const text = await r.text();
    let delRes = null;
    try {
      delRes = JSON.parse(text);
    } catch (e) {
      console.warn('  non-json delete response (first 400 chars):', text.slice(0,400));
      if (!r.ok) throw new Error('DELETE /profile/avatar failed: ' + text);
      // if it was 200 but non-json, we still stop
      throw new Error('DELETE /profile/avatar returned non-JSON response');
    }
    console.log('  status:', r.status, 'body:', delRes);
    if (!r.ok) throw new Error('DELETE /profile/avatar failed: ' + JSON.stringify(delRes));

    if (!delRes.user || !delRes.user.profileImage) throw new Error('Unexpected DELETE response: missing user.profileImage');
    const after = delRes.user.profileImage;
    console.log('  profileImage after delete:', after);

    console.log('\nTEST SUMMARY: Upload -> Delete completed successfully');
    process.exit(0);
  } catch (e) {
    console.error('TEST FAILED:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();