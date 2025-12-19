(async function run(){
  try {
    const base = 'http://127.0.0.1:4000/api';
    console.log('Testing GET /api/users');
    const r = await fetch(base + '/users');
    const j = await r.json();
    console.log('/users', r.status, Array.isArray(j) ? `count=${j.length}` : JSON.stringify(j));
    if (Array.isArray(j) && j.length) {
      const id = j[0].id;
      console.log('Testing GET /api/users/:id for', id);
      const r2 = await fetch(base + '/users/' + id);
      console.log('/users/:id', r2.status, JSON.stringify(await r2.json()));
    } else {
      console.log('No users returned by /api/users');
    }
  } catch (e) { console.error('TEST ERROR', e); process.exit(1); }
})();