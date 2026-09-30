import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';
import { DatabaseSync } from 'node:sqlite';

const scrypt = promisify(scryptCb);
const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(root, 'data', 'store.json');
const uploadPath = process.env.UPLOAD_DIR || path.join(root, 'uploads');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const databaseMode=process.env.DB_DRIVER||(process.env.NODE_ENV==='production'?'mysql':'sqlite');
if(!['mysql','sqlite'].includes(databaseMode))throw new Error('DB_DRIVER must be mysql or sqlite.');
if(process.env.NODE_ENV==='production'&&databaseMode!=='mysql')throw new Error('Production deployment requires DB_DRIVER=mysql.');
const sqlite=databaseMode==='sqlite'?new DatabaseSync(process.env.SQLITE_PATH||path.join(root,'store.sqlite')):null;
const pool = databaseMode==='mysql'?mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'tech_refresh_store',
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  charset: 'utf8mb4',
  ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined
}):null;
async function dbQuery(sql,params=[]) {
  if(pool)return pool.query(sql,params);
  if(sql.startsWith('SELECT payload'))return [sqlite.prepare('SELECT payload FROM app_state WHERE id = 1').all()];
  if(sql.startsWith('INSERT INTO app_state')){sqlite.prepare('INSERT INTO app_state (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(params[0]);return [{affectedRows:1}];}
  if(sql==='SELECT 1')return [[{1:1}]];
  throw new Error(`Unsupported SQLite query: ${sql}`);
}
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const seedProducts = [
  { name:'ProBook Air 14', categoryId:'computing', sku:'TRS-LT-014', price:68990, mrp:74990, stock:12, status:'published', image:'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85', description:'A bright, capable everyday laptop with a crisp display and all-day battery life.', attributes:{ Processor:'Intel Core i5', Memory:'16 GB', Storage:'512 GB SSD', Warranty:'1 year' }, tags:['featured','new'] },
  { name:'Studio Wireless Headphones', categoryId:'audio-video', sku:'TRS-AU-220', price:8490, mrp:10990, stock:24, status:'published', image:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85', description:'Comfortable over-ear listening with clear calls and a long-lasting battery.', attributes:{ Connectivity:'Bluetooth', Colour:'Graphite', Warranty:'1 year' }, tags:['featured'] },
  { name:'Wi-Fi 6 Mesh Router', categoryId:'networking', sku:'TRS-NT-006', price:12990, mrp:14990, stock:8, status:'published', image:'https://images.unsplash.com/photo-1606904825846-647eb07f5be2?auto=format&fit=crop&w=900&q=85', description:'Reliable dual-band coverage for a connected home or small office.', attributes:{ Standard:'Wi-Fi 6', Bands:'Dual band', Warranty:'2 years' }, tags:['popular'] },
  { name:'USB-C Docking Station', categoryId:'accessories', sku:'TRS-AC-031', price:4990, mrp:5990, stock:31, status:'published', image:'https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=900&q=85', description:'One tidy hub for displays, power, storage and the rest of your desk.', attributes:{ Ports:'8-in-1', Connectivity:'USB-C', Warranty:'1 year' }, tags:['popular'] },
  { name:'Mechanical Keyboard', categoryId:'accessories', sku:'TRS-AC-118', price:5790, mrp:6990, stock:18, status:'published', image:'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=900&q=85', description:'A compact mechanical keyboard tuned for precise work and satisfying typing.', attributes:{ Layout:'75%', Switches:'Tactile', Colour:'Slate' }, tags:['new'] },
  { name:'4K Monitor 27 inch', categoryId:'computing', sku:'TRS-MN-027', price:21990, mrp:25990, stock:5, status:'published', image:'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=85', description:'A detailed 4K panel with an ergonomic stand for focused work.', attributes:{ Resolution:'3840 x 2160', Size:'27 inch', Warranty:'3 years' }, tags:['featured'] }
];

const categorySeed = [
  { id:'computing', name:'Computing', slug:'computing', description:'Laptops, displays and everyday essentials.', attributes:[{name:'Processor',type:'text',required:false,filterable:true},{name:'Memory',type:'text',required:false,filterable:true},{name:'Storage',type:'text',required:false,filterable:true},{name:'Warranty',type:'text',required:false,filterable:false}] },
  { id:'networking', name:'Networking', slug:'networking', description:'Keep every corner connected.', attributes:[{name:'Standard',type:'dropdown',options:['Wi-Fi 5','Wi-Fi 6','Wi-Fi 6E'],required:false,filterable:true},{name:'Bands',type:'text',required:false,filterable:true},{name:'Warranty',type:'text',required:false,filterable:false}] },
  { id:'audio-video', name:'Audio & Video', slug:'audio-video', description:'Sound and picture for work and downtime.', attributes:[{name:'Connectivity',type:'dropdown',options:['Bluetooth','USB-C','Wireless'],required:false,filterable:true},{name:'Colour',type:'text',required:false,filterable:true},{name:'Warranty',type:'text',required:false,filterable:false}] },
  { id:'accessories', name:'Accessories', slug:'accessories', description:'Small upgrades that make a difference.', attributes:[{name:'Connectivity',type:'text',required:false,filterable:true},{name:'Colour',type:'text',required:false,filterable:true},{name:'Warranty',type:'text',required:false,filterable:false}] }
];

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hex] = (stored || '').split(':');
  if (!salt || !hex) return false;
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function slugify(value) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function safeEqual(a,b) { const aa=Buffer.from(a||''); const bb=Buffer.from(b||''); return aa.length===bb.length && timingSafeEqual(aa,bb); }

let writeChain = Promise.resolve();
async function loadStore() {
  if(process.env.NODE_ENV==='production'&&!process.env.ADMIN_PASSWORD)throw new Error('Set ADMIN_PASSWORD before starting in production.');
  if(process.env.ADMIN_PASSWORD==='replace_with_a_long_unique_password')throw new Error('Replace the ADMIN_PASSWORD placeholder in .env before starting.');
  if(sqlite)sqlite.exec('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  let rows;
  try { [rows] = await dbQuery('SELECT payload FROM app_state WHERE id = 1'); }
  catch(error) {
    if(error.code==='ER_NO_SUCH_TABLE')throw new Error('MySQL table app_state is missing. Run database/schema.sql first.');
    throw error;
  }
  if (rows.length) return typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
  if (existsSync(dataPath)) {
    const imported=JSON.parse(await readFile(dataPath,'utf8'));
    imported.payments ||= [];
    await saveStore(imported);
    console.log(`Imported the existing JSON store into ${databaseMode.toUpperCase()}.`);
    return imported;
  }
  const password = process.env.ADMIN_PASSWORD || 'Refresh@123';
  const admin = { id:randomUUID(), name:'Store Administrator', email:(process.env.ADMIN_EMAIL || 'admin@techrefreshsolution.com').toLowerCase(), passwordHash:await hashPassword(password), role:'super_admin', permissions:['*'] };
  const now = new Date().toISOString();
  const store = {
    admins:[admin], customers:[], categories:categorySeed, products:seedProducts.map((p)=>({ ...p, id:randomUUID(), slug:slugify(p.name), createdAt:now, images:[p.image], madeToOrder:false, minMargin:0, seo:{title:p.name,description:p.description} })),
    orders:[], payments:[], coupons:[{id:randomUUID(),code:'WELCOME10',type:'percent',value:10,usageLimit:100,used:0,active:true,minimum:1000}], reviews:[], banners:[{id:randomUUID(),title:'Technology that fits your day',subtitle:'Reliable essentials, selected with care.',image:'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1800&q=90',active:true}], audit:[], settings:{ currency:'INR',taxRate:18,shippingFlat:99,freeShippingAt:2500,lowStockThreshold:5,codEnabled:true,brandName:'Tech Refresh Solution', supportEmail:'hello@techrefreshsolution.com' }, sessions:[]
  };
  await saveStore(store);
  if(process.env.NODE_ENV!=='production'&&!process.env.ADMIN_PASSWORD)console.log(`Local demo admin: ${admin.email} / ${password}`);
  return store;
}
let store = await loadStore();
function saveStore(next = store) {
  writeChain = writeChain.then(()=>dbQuery('INSERT INTO app_state (id, payload) VALUES (1, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)', [JSON.stringify(next)]));
  return writeChain;
}

function paymentConfigured() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET); }
async function createRazorpayOrder(orderId, amount, customer) {
  if (!paymentConfigured()) throw Object.assign(new Error('Online payments are not configured. Add Razorpay test/live keys to the backend .env file.'), {status:503});
  const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{authorization:`Basic ${auth}`,'content-type':'application/json'},body:JSON.stringify({amount:Math.round(amount*100),currency:'INR',receipt:orderId,notes:{store:'Tech Refresh Solution',orderId,customerEmail:customer.email}})});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error?.description||'Payment provider could not create the payment order.'),{status:502});
  return data;
}
async function refundRazorpayPayment(order) {
  if(!paymentConfigured()||!order.paymentId)throw Object.assign(new Error('This online order cannot be refunded automatically. Check the payment record and Razorpay dashboard.'),{status:409});
  const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(order.paymentId)}/refund`,{method:'POST',headers:{authorization:`Basic ${auth}`,'content-type':'application/json'},body:JSON.stringify({amount:Math.round(Number(order.total)*100),notes:{orderId:order.id,reason:'Store order cancelled'}})});
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result.error?.description||'Payment provider could not initiate the refund.'),{status:502});
  if(!['processed','pending'].includes(result.status))throw Object.assign(new Error('Payment provider did not confirm the refund. The order was not cancelled.'),{status:502});
  return result;
}
function paymentSignatureValid(orderId,paymentId,signature) {
  if(!process.env.RAZORPAY_KEY_SECRET||!orderId||!paymentId||!signature)return false;
  const expected=createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected,signature);
}
async function finalizeCapturedPayment(pending,payment) {
  if(pending.status==='paid')return store.orders.find(order=>order.id===pending.id)||null;
  if(pending.status!=='pending'||payment.status!=='captured'||payment.order_id!==pending.providerOrderId||Number(payment.amount)!==Math.round(pending.total*100)||payment.currency!=='INR')return null;
  for(const line of pending.items){const product=store.products.find(x=>x.id===line.productId);if(!product?.madeToOrder){const variant=product?.variants?.find(x=>x.id===line.variantId);if(!product||((variant?variant.stock:product.stock)<line.quantity))return null;}}
  for(const line of pending.items){const product=store.products.find(x=>x.id===line.productId);if(product&&!product.madeToOrder){const variant=product.variants?.find(x=>x.id===line.variantId);if(variant)variant.stock-=line.quantity;product.stock-=line.quantity;}}
  const coupon=store.coupons.find(c=>c.code.toLowerCase()===pending.couponCode.toLowerCase());if(coupon)coupon.used++;
  const order={id:pending.id,customerId:pending.customerId,customerName:pending.customerName,email:pending.email,items:pending.items,address:pending.address,paymentMethod:'gateway',paymentStatus:'paid',paymentProvider:'razorpay',paymentId:payment.id,status:'processing',subtotal:pending.subtotal,discount:pending.discount,shipping:pending.shipping,tax:pending.tax,total:pending.total,createdAt:new Date().toISOString(),history:[{status:'processing',at:new Date().toISOString()}]};
  store.orders.unshift(order);pending.status='paid';pending.paymentId=payment.id;audit({email:pending.email},'online order paid','order',order.id);await saveStore();void notifyOrder(order,'Payment received and order confirmed');return order;
}
async function sendEmail(to,subject,text) {
  if(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM||!to)return;
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[to],subject,text})});
    if(!response.ok)console.error('Transactional email could not be sent:',await response.text());
  }catch(error){console.error('Transactional email error:',error.message);}
}
function notifyOrder(order,subject='Your order is confirmed') {
  const appUrl=(process.env.APP_URL||`http://localhost:${port}`).replace(/\/$/,'');
  const text=`Hello ${order.customerName},\n\n${subject}.\nOrder: ${order.id}\nTotal: INR ${Number(order.total).toFixed(2)}\nStatus: ${order.status}\n\nTrack your order: ${appUrl}/orders\nInvoice: ${appUrl}/invoice/${encodeURIComponent(order.id)}\n\nTech Refresh Solution`;
  return Promise.all([sendEmail(order.email,subject,text),sendEmail(process.env.ADMIN_NOTIFICATION_EMAIL,`New store update: ${order.id}`,text)]);
}
function audit(actor, action, entity, id) {
  store.audit.unshift({ id:randomUUID(), actor:actor?.email || 'system', action, entity, entityId:id || null, at:new Date().toISOString() });
  store.audit = store.audit.slice(0,500);
}
function cookieMap(req) { return Object.fromEntries((req.headers.cookie||'').split(';').map((part)=>part.trim()).filter(Boolean).map((part)=>{const i=part.indexOf('=');return [part.slice(0,i),decodeURIComponent(part.slice(i+1))];})); }
function sessionFor(req) {
  const sid=cookieMap(req).trs_session;
  return store.sessions.find((s)=>s.sid===sid) || null;
}
function publicUser(session) {
  if (!session) return null;
  const list=session.kind==='admin'?store.admins:store.customers;
  const user=list.find((u)=>u.id===session.userId);
  if (!user) return null;
  const {passwordHash,...safe}=user;
  return { ...safe, kind:session.kind };
}
function send(res,status,payload,headers={}) {
  const body=Buffer.from(JSON.stringify(payload));
  res.writeHead(status,{ 'content-type':'application/json; charset=utf-8','content-length':body.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()',...headers });
  res.end(body);
}
function fail(res,status,message) { send(res,status,{error:message}); }
function sessionCookie(sid) { return `trs_session=${encodeURIComponent(sid)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`; }
async function readBody(req, max=6*1024*1024) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size>max) throw Object.assign(new Error('Request body is too large.'),{status:413}); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Request body must be valid JSON.'),{status:400}); }
}
const rateBuckets=new Map();
function allowRateLimit(key,limit,windowMs) {
  const now=Date.now();const bucket=rateBuckets.get(key);
  if(!bucket||bucket.until<=now){rateBuckets.set(key,{count:1,until:now+windowMs});return true;}
  if(bucket.count>=limit)return false;
  bucket.count++;return true;
}
function clientIp(req) { return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',').at(-1).trim(); }
function requiredAdmin(req,res) {
  const session=sessionFor(req); const user=publicUser(session);
  if (!user || session.kind!=='admin') { fail(res,401,'Sign in with an admin account to continue.'); return null; }
  if (req.method!=='GET' && !safeEqual(req.headers['x-csrf-token'],session.csrf)) { fail(res,403,'This session needs refreshing. Reload the page and try again.'); return null; }
  return { session,user };
}
function requiredCustomer(req,res) {
  const session=sessionFor(req); const user=publicUser(session);
  if (!user || session.kind!=='customer') { fail(res,401,'Sign in to continue.'); return null; }
  if (req.method!=='GET' && !safeEqual(req.headers['x-csrf-token'],session.csrf)) { fail(res,403,'This session needs refreshing. Reload the page and try again.'); return null; }
  return { session,user };
}
function productPublic(product) { return product.status==='published' ? product : null; }
function adminBundle(role='super_admin') {
  const bundle={categories:store.categories,products:store.products,orders:store.orders,customers:store.customers.map(({passwordHash,...u})=>u),coupons:store.coupons,banners:store.banners,admins:store.admins.map(({passwordHash,...u})=>u),audit:store.audit.slice(0,100),settings:{...store.settings,onlinePaymentEnabled:paymentConfigured()},reviews:store.reviews};
  if(role==='catalog_manager')return {...bundle,orders:[],customers:[],coupons:[],banners:[],admins:[],audit:[],settings:{lowStockThreshold:store.settings.lowStockThreshold},reviews:[]};
  if(role==='order_manager')return {...bundle,categories:[],products:[],coupons:[],banners:[],admins:[],audit:[],settings:{},reviews:[]};
  return bundle;
}
function slugAvailable(slug,id) { return !store.products.some((p)=>p.slug===slug && p.id!==id); }
function saveVariants(input, existing=[]) {
  if(!Array.isArray(input))return [];
  const existingIds=new Set(existing.map(v=>v.id));
  return input.filter(v=>v.label?.trim()&&v.sku?.trim()).map(v=>({id:existingIds.has(v.id)?v.id:randomUUID(),label:String(v.label).trim().slice(0,120),sku:String(v.sku).trim().slice(0,80),price:Math.max(0,Number(v.price)||0),stock:Math.max(0,Math.floor(Number(v.stock)||0))}));
}
function validateProduct(body, existing) {
  const category=store.categories.find((c)=>c.id===body.categoryId);
  if (!category) return 'Choose a valid category.';
  if (!body.name?.trim() || !body.sku?.trim()) return 'Product name and SKU are required.';
  const status=body.status || existing?.status || 'draft';
  const variants=body.variants ?? existing?.variants ?? [];
  if (status==='published' && !body.price && !existing?.price) return 'A selling price is required before publishing.';
  if (status==='published' && !(body.images?.length || body.image || existing?.images?.length)) return 'Add at least one product image before publishing.';
  if (!Array.isArray(variants)) return 'Variants must be provided as a list.';
  if (variants.length && variants.some(v=>!v.label?.trim()||!v.sku?.trim()||!Number.isFinite(Number(v.price))||Number(v.price)<0||!Number.isFinite(Number(v.stock))||Number(v.stock)<0)) return 'Each variant needs a label, SKU, valid price and stock quantity.';
  if (status==='published' && !(body.madeToOrder || (variants.length?variants.some(v=>Number(v.stock)>0):Number(body.stock ?? existing?.stock)>0))) return 'Add stock or enable made to order before publishing.';
  const attrs=body.attributes || existing?.attributes || {};
  for (const a of category.attributes||[]) if (a.required && !String(attrs[a.name] ?? '').trim()) return `${a.name} is required for ${category.name}.`;
  const price=Number(body.price ?? existing?.price ?? 0), mrp=Number(body.mrp ?? existing?.mrp ?? price);
  if (price<0 || mrp<price) return 'Selling price must be zero or more and MRP cannot be below the selling price.';
  return null;
}
function orderTotals(items,couponCode='') {
  const lines=[];
  for (const line of items||[]) {
    const p=store.products.find((x)=>x.id===line.productId && x.status==='published');
    const qty=Math.max(0,Math.floor(Number(line.quantity)));
    if (!p || qty<1) throw Object.assign(new Error('One of the products is no longer available.'),{status:400});
    const variant=p.variants?.length?p.variants.find(v=>v.id===line.variantId):null;
    if(p.variants?.length&&!variant)throw Object.assign(new Error(`Choose an available option for ${p.name}.`),{status:400});
    const available=variant?Number(variant.stock):Number(p.stock);
    if (!p.madeToOrder && available<qty) throw Object.assign(new Error(`${p.name}${variant?` · ${variant.label}`:''} has only ${available} in stock.`),{status:409});
    lines.push({productId:p.id,variantId:variant?.id||null,variantLabel:variant?.label||'',name:p.name,sku:variant?.sku||p.sku,quantity:qty,unitPrice:variant?Number(variant.price):p.price,image:p.image});
  }
  if (!lines.length) throw Object.assign(new Error('Your cart is empty.'),{status:400});
  const subtotal=lines.reduce((n,l)=>n+l.quantity*l.unitPrice,0);
  let discount=0,coupon=null;
  if (couponCode) {
    coupon=store.coupons.find((c)=>c.code.toLowerCase()===couponCode.toLowerCase() && c.active);
    if (!coupon) throw Object.assign(new Error('That coupon is not active.'),{status:400});
    if (coupon.usageLimit && coupon.used>=coupon.usageLimit) throw Object.assign(new Error('That coupon has reached its usage limit.'),{status:400});
    if (subtotal<Number(coupon.minimum||0)) throw Object.assign(new Error(`Spend ₹${Number(coupon.minimum).toLocaleString('en-IN')} to use this coupon.`),{status:400});
    const eligible=lines.filter((l)=>!coupon.productIds?.length || coupon.productIds.includes(l.productId)).reduce((n,l)=>n+l.quantity*l.unitPrice,0);
    discount=coupon.type==='percent'?Math.round(eligible*coupon.value/100):Math.min(eligible,Number(coupon.value));
  }
  const shipping=subtotal-discount>=Number(store.settings.freeShippingAt)?0:Number(store.settings.shippingFlat);
  const taxable=Math.max(0,subtotal-discount);
  const tax=Math.round(taxable*Number(store.settings.taxRate)/100);
  return {lines,subtotal,discount,shipping,tax,total:taxable+shipping+tax,coupon};
}

async function api(req,res,url) {
  const parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const method=req.method;
  if(parts[1]==='account'&&parts[2]==='login'&&method==='POST'&&!allowRateLimit(`login:${clientIp(req)}`,10,15*60*1000))return fail(res,429,'Too many sign-in attempts. Please wait 15 minutes and try again.');
  if(parts[1]==='account'&&parts[2]==='register'&&method==='POST'&&!allowRateLimit(`register:${clientIp(req)}`,5,60*60*1000))return fail(res,429,'Too many account creation attempts. Please try again later.');
  if(parts[1]==='checkout'&&method==='POST'&&!allowRateLimit(`checkout:${clientIp(req)}`,20,60*60*1000))return fail(res,429,'Too many checkout attempts. Please wait and try again.');
  if(parts[1]==='webhooks'&&parts[2]==='razorpay'&&method==='POST'){
    const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)return fail(res,503,'Payment webhook is not configured.');
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)return fail(res,413,'Webhook payload is too large.');chunks.push(chunk);}
    const raw=Buffer.concat(chunks);const expected=createHmac('sha256',secret).update(raw).digest('hex');
    if(!safeEqual(expected,req.headers['x-razorpay-signature']))return fail(res,401,'Invalid payment webhook signature.');
    let event;try{event=JSON.parse(raw.toString('utf8'));}catch{return fail(res,400,'Invalid webhook payload.');}
    if(event.event==='payment.captured'){
      const payment=event.payload?.payment?.entity;const pending=(store.payments||[]).find(item=>item.providerOrderId===payment?.order_id);
      if(pending){const order=await finalizeCapturedPayment(pending,payment);if(!order)console.error('Captured payment could not be matched to available inventory:',payment?.id);}
    }
    return send(res,200,{received:true});
  }
  if (parts[1]==='session' && method==='GET') {
    let session=sessionFor(req);
    const headers={};
    if (!session) { session={sid:randomBytes(32).toString('hex'),csrf:randomBytes(24).toString('hex'),kind:'anonymous',userId:null}; store.sessions.push(session); headers['set-cookie']=sessionCookie(session.sid); await saveStore(); }
    return send(res,200,{csrf:session.csrf,user:publicUser(session),brand:store.settings.brandName},headers);
  }
  if (parts[1]==='store' && method==='GET') return send(res,200,{categories:store.categories.filter(c=>c.active!==false),products:store.products.map(productPublic).filter(Boolean),banners:store.banners.filter(b=>b.active),reviews:store.reviews.filter(r=>r.status==='approved'),settings:{currency:store.settings.currency,shippingFlat:store.settings.shippingFlat,freeShippingAt:store.settings.freeShippingAt,taxRate:store.settings.taxRate,codEnabled:store.settings.codEnabled,onlinePaymentEnabled:paymentConfigured()},coupons:store.coupons.filter(c=>c.active).map(({code,minimum,type,value})=>({code,minimum,type,value}))});
  if (parts[1]==='account' && parts[2]==='register' && method==='POST') {
    const b=await readBody(req); const email=String(b.email||'').trim().toLowerCase();
    if (!b.name?.trim() || !/^\S+@\S+\.\S+$/.test(email) || String(b.password||'').length<8) return fail(res,400,'Enter your name, a valid email and a password of at least 8 characters.');
    if (store.customers.some(u=>u.email===email)) return fail(res,409,'An account already exists for this email.');
    const user={id:randomUUID(),name:b.name.trim(),email,phone:String(b.phone||''),passwordHash:await hashPassword(String(b.password)),addresses:[],createdAt:new Date().toISOString()}; store.customers.push(user);
    const session={sid:randomBytes(32).toString('hex'),csrf:randomBytes(24).toString('hex'),kind:'customer',userId:user.id}; store.sessions.push(session); audit(user,'customer registered','customer',user.id); await saveStore();
    return send(res,201,{user:publicUser(session),csrf:session.csrf},{'set-cookie':sessionCookie(session.sid)});
  }
  if (parts[1]==='account' && parts[2]==='login' && method==='POST') {
    const b=await readBody(req), email=String(b.email||'').toLowerCase();
    const admin=store.admins.find(u=>u.email===email); const customer=store.customers.find(u=>u.email===email); const user=admin||customer;
    if (!user || !(await verifyPassword(String(b.password||''),user.passwordHash))) return fail(res,401,'Email or password is incorrect.');
    const session={sid:randomBytes(32).toString('hex'),csrf:randomBytes(24).toString('hex'),kind:admin?'admin':'customer',userId:user.id}; store.sessions=store.sessions.filter(s=>s.userId!==user.id); store.sessions.push(session); await saveStore();
    return send(res,200,{user:publicUser(session),csrf:session.csrf},{'set-cookie':sessionCookie(session.sid)});
  }
  if (parts[1]==='account' && parts[2]==='logout' && method==='POST') {
    const session=sessionFor(req); if (session && !safeEqual(req.headers['x-csrf-token'],session.csrf)) return fail(res,403,'This session needs refreshing.');
    store.sessions=store.sessions.filter(s=>s!==session); await saveStore(); return send(res,200,{ok:true},{'set-cookie':'trs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }
  if (parts[1]==='account' && parts[2]==='orders' && method==='GET') {
    const auth=requiredCustomer(req,res); if (!auth) return;
    return send(res,200,{orders:store.orders.filter(o=>o.customerId===auth.user.id)});
  }
  if (parts[1]==='account' && parts[2]==='profile' && method==='PATCH') {
    const auth=requiredCustomer(req,res);if(!auth)return;const b=await readBody(req);
    if(!safeEqual(req.headers['x-csrf-token'],auth.session.csrf))return fail(res,403,'This session needs refreshing.');
    const customer=store.customers.find(c=>c.id===auth.user.id);if(b.name!==undefined)customer.name=String(b.name).trim().slice(0,120);if(b.phone!==undefined)customer.phone=String(b.phone).trim().slice(0,40);
    if(Array.isArray(b.addresses))customer.addresses=b.addresses.slice(0,10).map(a=>({name:String(a.name||'').slice(0,120),phone:String(a.phone||'').slice(0,40),line1:String(a.line1||'').slice(0,200),line2:String(a.line2||'').slice(0,200),city:String(a.city||'').slice(0,100),state:String(a.state||'').slice(0,100),postalCode:String(a.postalCode||'').slice(0,16)}));
    audit(customer,'profile updated','customer',customer.id);await saveStore();return send(res,200,{user:publicUser(auth.session)});
  }
  if(parts[1]==='reviews'&&method==='POST'){
    const auth=requiredCustomer(req,res);if(!auth)return;const b=await readBody(req);if(!safeEqual(req.headers['x-csrf-token'],auth.session.csrf))return fail(res,403,'This session needs refreshing.');
    const order=store.orders.find(o=>o.customerId===auth.user.id&&o.items.some(i=>i.productId===b.productId));if(!order)return fail(res,403,'Reviews are available after purchasing the product.');
    if(store.reviews.some(r=>r.customerId===auth.user.id&&r.productId===b.productId))return fail(res,409,'You have already reviewed this product.');
    const rating=Math.floor(Number(b.rating));if(rating<1||rating>5||String(b.comment||'').trim().length<8)return fail(res,400,'Add a rating and a review of at least 8 characters.');
    const review={id:randomUUID(),productId:b.productId,customerId:auth.user.id,customerName:auth.user.name,rating,comment:String(b.comment).trim().slice(0,2000),status:'pending',createdAt:new Date().toISOString()};store.reviews.unshift(review);audit(auth.user,'review submitted','review',review.id);await saveStore();return send(res,201,{review,message:'Your review was sent to the store for approval.'});
  }
  if (parts[1]==='checkout' && method==='POST') {
    const auth=requiredCustomer(req,res); if(!auth)return;
    const b=await readBody(req); const totals=orderTotals(b.items,b.couponCode);
    if (!safeEqual(req.headers['x-csrf-token'],auth.session.csrf)) return fail(res,403,'This session needs refreshing.');
    if (!b.address?.name || !b.address?.line1 || !b.address?.city || !b.address?.postalCode || !b.address?.phone) return fail(res,400,'Complete the delivery address before placing your order.');
    if (b.paymentMethod==='cod' && !store.settings.codEnabled) return fail(res,400,'Cash on delivery is not available.');
    if (!['cod','gateway'].includes(b.paymentMethod)) return fail(res,400,'Choose a valid payment method.');
    if (b.paymentMethod==='gateway') {
      if(!paymentConfigured())return fail(res,503,'Online payments are not configured. Add Razorpay keys in backend/.env.');
      const id=`TRS-${Date.now().toString(36).toUpperCase()}`;
      const gatewayOrder=await createRazorpayOrder(id,totals.total,auth.user);
      const pending={id,provider:'razorpay',providerOrderId:gatewayOrder.id,customerId:auth.user.id,customerName:auth.user.name,email:auth.user.email,items:totals.lines,address:b.address,couponCode:b.couponCode||'',subtotal:totals.subtotal,discount:totals.discount,shipping:totals.shipping,tax:totals.tax,total:totals.total,createdAt:new Date().toISOString(),status:'pending'};
      store.payments||=[];store.payments.push(pending);await saveStore();
      return send(res,201,{payment:{configured:true,provider:'razorpay',keyId:process.env.RAZORPAY_KEY_ID,orderId:gatewayOrder.id,amount:gatewayOrder.amount,currency:gatewayOrder.currency,receipt:id,prefill:{name:auth.user.name,email:auth.user.email,contact:auth.user.phone||b.address.phone},brandName:store.settings.brandName}});
    }
    for(const line of totals.lines){const p=store.products.find(x=>x.id===line.productId);if(!p.madeToOrder){const variant=p.variants?.find(v=>v.id===line.variantId);if(variant)variant.stock-=line.quantity;p.stock-=line.quantity;}}
    if(totals.coupon)totals.coupon.used++;
    const order={id:`TRS-${Date.now().toString(36).toUpperCase()}`,customerId:auth.user.id,customerName:auth.user.name,email:auth.user.email,items:totals.lines,address:b.address,paymentMethod:b.paymentMethod,paymentStatus:'pay_on_delivery',status:'processing',subtotal:totals.subtotal,discount:totals.discount,shipping:totals.shipping,tax:totals.tax,total:totals.total,createdAt:new Date().toISOString(),history:[{status:'processing',at:new Date().toISOString()}]};
    store.orders.unshift(order); audit(auth.user,'order created','order',order.id); await saveStore();void notifyOrder(order);
    return send(res,201,{order,payment:{configured:false,message:b.paymentMethod==='gateway'?'Payment gateway credentials are required to complete online payment.':'Your order is confirmed. Pay on delivery.'}});
  }
  if(parts[1]==='payment'&&parts[2]==='verify'&&method==='POST'){
    const auth=requiredCustomer(req,res);if(!auth)return;
    const b=await readBody(req);if(!safeEqual(req.headers['x-csrf-token'],auth.session.csrf))return fail(res,403,'This session needs refreshing.');
    const pending=(store.payments||[]).find(p=>p.providerOrderId===b.razorpay_order_id&&p.customerId===auth.user.id);
    if(!pending)return fail(res,404,'Payment session not found or already completed.');
    if(!paymentSignatureValid(b.razorpay_order_id,b.razorpay_payment_id,b.razorpay_signature))return fail(res,400,'Payment signature could not be verified. Contact support before retrying.');
    if(pending.status==='paid'){const order=store.orders.find(item=>item.id===pending.id);if(order)return send(res,200,{order,payment:{configured:true,message:'Payment verified and order confirmed.'}});}
    if(pending.status!=='pending')return fail(res,409,'This payment session is no longer active. Contact support if your account was charged.');
    const authHeader=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const check=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(b.razorpay_payment_id)}`,{headers:{authorization:`Basic ${authHeader}`}});
    const payment=await check.json();
    if(!check.ok||payment.order_id!==pending.providerOrderId||payment.status!=='captured')return fail(res,409,'Payment is not captured yet. Please contact support or try again.');
    const order=await finalizeCapturedPayment(pending,payment);
    if(!order)return fail(res,409,'Payment was captured but inventory could not be confirmed. Contact store support for assistance.');
    return send(res,200,{order,payment:{configured:true,message:'Payment verified and order confirmed.'}});
  }
  if (parts[1]==='admin') {
    const auth=requiredAdmin(req,res); if(!auth)return;
    if(parts.length===2 && method==='GET') return send(res,200,{...adminBundle(auth.user.role),user:auth.user,csrf:auth.session.csrf});
    const restricted={catalog_manager:['categories','products','upload'],order_manager:['orders','customers']};
    if(auth.user.role!=='super_admin'&&auth.user.role!=='admin'&&!restricted[auth.user.role]?.includes(parts[2]))return fail(res,403,'Your staff role does not have access to this section.');
    if(parts[2]==='upload' && method==='POST') {
      const b=await readBody(req,8*1024*1024); const match=String(b.data||'').match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/);
      if(!match)return fail(res,400,'Choose a PNG, JPEG or WebP image.');
      const buffer=Buffer.from(match[2],'base64'); if(buffer.length>5*1024*1024)return fail(res,413,'Images must be 5 MB or smaller.');
      await mkdir(uploadPath,{recursive:true}); const ext=match[1]==='image/jpeg'?'.jpg':match[1]==='image/png'?'.png':'.webp'; const name=`${randomUUID()}${ext}`; await writeFile(path.join(uploadPath,name),buffer); return send(res,201,{url:`/uploads/${name}`});
    }
    if(parts[2]==='settings' && method==='PATCH') { const b=await readBody(req); for(const key of ['taxRate','shippingFlat','freeShippingAt','lowStockThreshold']) if(b[key]!==undefined)store.settings[key]=Math.max(0,Number(b[key])); for(const key of ['codEnabled'])if(b[key]!==undefined)store.settings[key]=Boolean(b[key]); for(const key of ['brandName','supportEmail'])if(b[key]!==undefined)store.settings[key]=String(b[key]).slice(0,120); audit(auth.user,'settings updated','settings'); await saveStore(); return send(res,200,{settings:store.settings}); }
    if(parts[2]==='staff' && method==='POST') { const b=await readBody(req); const email=String(b.email||'').toLowerCase(); if(!b.name?.trim()||!/^\S+@\S+\.\S+$/.test(email)||String(b.password||'').length<8)return fail(res,400,'Provide a name, valid email and password of at least 8 characters.');if(store.admins.some(u=>u.email===email))return fail(res,409,'This staff email already exists.');const user={id:randomUUID(),name:b.name,email,passwordHash:await hashPassword(b.password),role:b.role==='catalog_manager'?'catalog_manager':'order_manager',permissions:b.role==='catalog_manager'?['categories','products','inventory']:['orders','customers']};store.admins.push(user);audit(auth.user,'staff account created','admin',user.id);await saveStore();return send(res,201,{user:{id:user.id,name:user.name,email:user.email,role:user.role}}); }
    if(parts[2]==='orders' && parts[3] && method==='PATCH') { const b=await readBody(req); const order=store.orders.find(o=>o.id===parts[3]); if(!order)return fail(res,404,'Order not found.'); const allowed=['processing','shipped','delivered','cancelled','returned'];if(!allowed.includes(b.status))return fail(res,400,'Choose a valid order status.');if(b.status==='cancelled' && order.status!=='cancelled'){if(order.paymentStatus==='paid'){const refund=await refundRazorpayPayment(order);order.refundId=refund.id;order.refundStatus=refund.status;order.paymentStatus=refund.status==='processed'?'refunded':'refund_pending';}for(const l of order.items){const p=store.products.find(x=>x.id===l.productId);if(p&&!p.madeToOrder){p.stock+=l.quantity;const v=p.variants?.find(x=>x.id===l.variantId);if(v)v.stock+=l.quantity;}}}if(order.status==='cancelled'&&b.status!=='cancelled'){for(const l of order.items){const p=store.products.find(x=>x.id===l.productId);const v=p?.variants?.find(x=>x.id===l.variantId);if(p&&!p.madeToOrder&&(v?v.stock:p.stock)<l.quantity)return fail(res,409,`${p.name}${v?` · ${v.label}`:''} no longer has enough stock to reopen this order.`);}for(const l of order.items){const p=store.products.find(x=>x.id===l.productId);if(p&&!p.madeToOrder){p.stock-=l.quantity;const v=p.variants?.find(x=>x.id===l.variantId);if(v)v.stock-=l.quantity;}}}order.status=b.status;order.history.push({status:b.status,at:new Date().toISOString()});audit(auth.user,'order status changed','order',order.id);await saveStore();void notifyOrder(order,`Order ${order.id} is now ${order.status}`);return send(res,200,{order}); }
    if(parts[2]==='reviews' && parts[3] && method==='PATCH') {const b=await readBody(req);const review=store.reviews.find(r=>r.id===parts[3]);if(!review)return fail(res,404,'Review not found.');if(!['approved','rejected'].includes(b.status))return fail(res,400,'Choose approved or rejected.');review.status=b.status;audit(auth.user,`review ${b.status}`,'review',review.id);await saveStore();return send(res,200,{review});}
    if(parts[2]==='products' && parts[3] && method==='DELETE') {const i=store.products.findIndex(p=>p.id===parts[3]);if(i<0)return fail(res,404,'Product not found.');store.products.splice(i,1);audit(auth.user,'product deleted','product',parts[3]);await saveStore();return send(res,200,{ok:true});}
    if(parts[2]==='categories' && parts[3] && method==='DELETE') {if(store.products.some(p=>p.categoryId===parts[3]))return fail(res,409,'Move or remove this category’s products before deactivating it.');const c=store.categories.find(x=>x.id===parts[3]);if(!c)return fail(res,404,'Category not found.');c.active=false;audit(auth.user,'category deactivated','category',c.id);await saveStore();return send(res,200,{ok:true});}
    if(['categories','products','coupons','banners'].includes(parts[2]) && method==='POST') {
      const b=await readBody(req); const id=randomUUID(); let item;
      if(parts[2]==='categories'){if(!b.name?.trim())return fail(res,400,'Category name is required.');item={id,name:b.name.trim(),slug:slugify(b.name),description:String(b.description||''),active:true,parentId:b.parentId||null,attributes:Array.isArray(b.attributes)?b.attributes.map(a=>({name:String(a.name||'').slice(0,80),type:['text','number','dropdown','multiselect','checkbox','date','image'].includes(a.type)?a.type:'text',options:Array.isArray(a.options)?a.options:[],required:Boolean(a.required),filterable:Boolean(a.filterable)})).filter(a=>a.name):[]};store.categories.push(item);}
      if(parts[2]==='products'){const error=validateProduct(b);if(error)return fail(res,400,error);const slug=slugify(b.slug||b.name);if(!slugAvailable(slug))return fail(res,409,'A product already uses this URL slug.');const variants=saveVariants(b.variants);item={...b,id,slug,variants,price:variants.length?Math.min(...variants.map(v=>v.price)):Number(b.price),mrp:Number(b.mrp||b.price),stock:variants.length?variants.reduce((n,v)=>n+v.stock,0):Math.max(0,Number(b.stock||0)),status:b.status||'draft',images:b.images?.length?b.images:[b.image],image:b.images?.[0]||b.image||'',attributes:b.attributes||{},tags:b.tags||[],createdAt:new Date().toISOString(),madeToOrder:Boolean(b.madeToOrder),seo:{title:String(b.seo?.title||b.name),description:String(b.seo?.description||b.description||'')}};store.products.push(item);}
      if(parts[2]==='coupons'){const code=String(b.code||'').trim().toUpperCase();if(!code||store.coupons.some(c=>c.code===code))return fail(res,409,'Enter a unique coupon code.');item={id,code,type:b.type==='flat'?'flat':'percent',value:Number(b.value||0),minimum:Number(b.minimum||0),usageLimit:Number(b.usageLimit||0),used:0,active:true};store.coupons.push(item);}
      if(parts[2]==='banners'){if(!b.title?.trim())return fail(res,400,'Banner title is required.');item={id,title:b.title,subtitle:b.subtitle||'',image:b.image||'',active:true};store.banners.push(item);}
      audit(auth.user,`${parts[2]} created`,parts[2],item.id);await saveStore();return send(res,201,{item});
    }
    if(['categories','products','coupons','banners'].includes(parts[2]) && parts[3] && method==='PATCH') {
      const b=await readBody(req);const collection=store[parts[2]];const item=collection.find(x=>x.id===parts[3]);if(!item)return fail(res,404,'Record not found.');
      if(parts[2]==='products'){const error=validateProduct({...item,...b});if(error)return fail(res,400,error);const oldVariants=item.variants||[];Object.assign(item,b);item.variants=saveVariants(b.variants??oldVariants,oldVariants);item.slug=slugify(b.slug||b.name||item.name);item.price=item.variants.length?Math.min(...item.variants.map(v=>v.price)):Number(item.price);item.mrp=Number(item.mrp);item.stock=item.variants.length?item.variants.reduce((n,v)=>n+v.stock,0):Number(item.stock);item.image=item.images?.[0]||item.image;}
      else if(parts[2]==='categories'){Object.assign(item,b);if(b.name)item.slug=slugify(b.name);}
      else Object.assign(item,b);
      audit(auth.user,`${parts[2]} updated`,parts[2],item.id);await saveStore();return send(res,200,{item});
    }
    return fail(res,404,'Admin endpoint not found.');
  }
  return fail(res,404,'API route not found.');
}

const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/healthz'){
      try{await dbQuery('SELECT 1');res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});return res.end('ok');}
      catch{res.writeHead(503,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});return res.end('database unavailable');}
    }
    if(url.pathname.startsWith('/api/')) return await api(req,res,url);
    if(url.pathname.startsWith('/uploads/')) {
      const name=path.basename(decodeURIComponent(url.pathname.slice('/uploads/'.length)));
      if(!name || name!==url.pathname.slice('/uploads/'.length)) return fail(res,404,'Not found.');
      const file=path.join(uploadPath,name);try{const buffer=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream','cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff','x-frame-options':'DENY'});return res.end(buffer);}catch{return fail(res,404,'Image not found.');}
    }
    const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const file=path.resolve(root,'public',`.${requested}`);
    if(!file.startsWith(path.resolve(root,'public')+path.sep))return fail(res,403,'Not found.');
    try{const buffer=await readFile(file);const ext=path.extname(file);res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':['.html','.js','.css'].includes(ext)?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()'});res.end(buffer);}catch{const buffer=await readFile(path.join(root,'public','index.html'));res.writeHead(200,{'content-type':mime['.html'],'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY'});res.end(buffer);}
  } catch(error) { console.error(error); if(!res.headersSent)fail(res,error.status||500,error.status?error.message:'Something went wrong. Please try again.'); }
});
server.listen(port,host,()=>console.log(`Tech Refresh Solution is running at http://localhost:${port}`));
