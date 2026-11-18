// Kho dữ liệu dùng chung cho trang them-cot.html (Cloudflare Pages Functions + KV).
// Gắn KV namespace với tên biến TIENICH trong: Pages > lich-gdx > Settings > Bindings.
// Chế độ công khai: đặt biến môi trường PUBLIC_EDIT=1 thì ai mở link cũng xem và sửa được (không cần đăng nhập).
// Chế độ có đăng nhập (Cloudflare Access): người sửa là các email trong EDITORS (cách nhau dấu phẩy) và email mặc định dưới đây.
const DEFAULT_EDITORS = ['khanhtoan.hubt@gmail.com', 'lecuong3621@gmail.com'];
const KEYS = ['ds', 'cb', 'moc'];            // ds: danh sách tổ; cb: cán bộ theo xã; moc: mốc đầu tháng BC sai sót
const MAX_BYTES = 4 * 1024 * 1024;
// Trang công cụ đặt ở kho công khai (GitHub Pages) gọi sang đây nên cần cho phép các nguồn này.
const ALLOW_ORIGINS = ['https://toannhcs.github.io'];

let CORS = {};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', ...CORS } });

async function onRequest({ request, env }) {
  const origin = request.headers.get('Origin');
  const sameHost = !!origin && new URL(origin).host === new URL(request.url).host;
  const allowed = !origin || sameHost || ALLOW_ORIGINS.includes(origin);
  CORS = origin && allowed ? { 'access-control-allow-origin': origin, 'vary': 'Origin' } : {};
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: allowed ? 204 : 403, headers: { ...CORS, 'access-control-allow-methods': 'GET, PUT, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
  }
  const kv = env.TIENICH;
  if (!kv) return json({ error: 'Chưa gắn KV TIENICH' }, 503);
  const email = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').trim().toLowerCase();
  const editors = DEFAULT_EDITORS.concat(String(env.EDITORS || '').split(','))
    .map(s => s.trim().toLowerCase()).filter(Boolean);
  const canEdit = String(env.PUBLIC_EDIT || '') === '1' || (!!email && editors.includes(email));

  if (request.method === 'GET') {
    const [ds, cb, moc, meta] = await Promise.all([kv.get('ds', 'json'), kv.get('cb', 'json'), kv.get('moc', 'json'), kv.get('meta', 'json')]);
    return json({ ds, cb, moc, meta: meta || {}, canEdit, email });
  }
  if (request.method === 'PUT' || request.method === 'POST') {
    if (!canEdit) return json({ error: 'Bạn không có quyền sửa' }, 403);
    if (!allowed) return json({ error: 'Nguồn không hợp lệ' }, 403);     // chỉ nhận ghi từ trang của mình
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Dữ liệu không hợp lệ' }, 400); }
    const key = body && body.key;
    if (!KEYS.includes(key)) return json({ error: 'Khóa không hợp lệ' }, 400);
    const meta = (await kv.get('meta', 'json')) || {};
    meta[key] = { by: email, at: new Date().toISOString() };
    const old = await kv.get(key);
    if (old) await kv.put(key + '_prev', old);              // giữ bản liền trước để khôi phục khi có người sửa nhầm
    if (body.value === null) await kv.delete(key);
    else {
      const s = JSON.stringify(body.value);
      if (s.length > MAX_BYTES) return json({ error: 'Dữ liệu quá lớn' }, 413);
      await kv.put(key, s);
    }
    await kv.put('meta', JSON.stringify(meta));
    return json({ ok: true, meta });
  }
  return json({ error: 'Phương thức không hỗ trợ' }, 405);
}

export default { fetch: (request, env) => onRequest({ request, env }) };
