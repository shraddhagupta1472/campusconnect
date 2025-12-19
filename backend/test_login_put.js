(async function run(){
  try{
    const base = 'http://127.0.0.1:4000/api';
    const r = await fetch(base + '/login', {method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email:'shraddha@example.com', password:'seed'})});
    const j = await r.json();
    console.log('LOGIN', r.status, JSON.stringify(j));
    if (!r.ok) return;
    const token = j.token;
    const put = await fetch(base + '/profile', {method:'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + token}, body: JSON.stringify({name: 'Shraddha (test-run)', bookmarksEnabled: true, disableNotifications: false})});
    console.log('PUT', put.status, await put.text());
    const get = await fetch(base + '/profile', {headers: { Authorization: 'Bearer ' + token}});
    console.log('GET', get.status, JSON.stringify(await get.json()));
  } catch (e) { console.error('TEST ERROR', e); process.exit(1); }
})();