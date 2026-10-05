import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
async function setUser(u=uid){await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[u]);}
async function cmd(action:string,args:any={}){return (await db.query<{r:any}>('select public.app_command($1,$2::jsonb) r',[action,JSON.stringify(args)])).rows[0].r;}
async function snap(){return (await db.query<{r:any}>('select public.app_snapshot() r')).rows[0].r;}
const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date());
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${uid}'),('${other}');`);
 await db.exec(readFileSync('supabase/01_TAO_CO_SO_DU_LIEU.sql','utf8'));
 await setUser();
});
after(async()=>{await db.close();});
test('SQL có thể chạy lại, không xóa dữ liệu',async()=>{await db.exec(readFileSync('supabase/01_TAO_CO_SO_DU_LIEU.sql','utf8'));});
test('thẻ / ngày cuối tháng / tháng theo dõi / không tạo trùng',async()=>{
 const c=await cmd('create_card',{data:{name:'Kiểm tra',bankName:'Ngân hàng thử',defaultDueDay:31,startTrackingMonth:'2026-01'}});
 await cmd('prepare',{months:['2026-02','2028-02',month]});await cmd('prepare',{months:['2026-02']});const d=await snap();
 assert.equal(d.cards.length,1);assert.equal(d.obligations.filter((o:any)=>o.month==='2026-02').length,1);
 assert.equal(d.obligations.find((o:any)=>o.month==='2026-02').actualDueDate,'2026-02-28');
 assert.equal(d.obligations.find((o:any)=>o.month==='2028-02').actualDueDate,'2028-02-29');
 assert.equal(d.obligations.find((o:any)=>o.month===month).dataState,'UNUPDATED');assert.equal(c.userId,uid);
});
test('chưa cập nhật khác không phát sinh; chặn số 0, số lẻ',async()=>{
 const d=await snap(),o=d.obligations.find((o:any)=>o.month==='2026-02');
 await assert.rejects(cmd('update_obligation',{id:o.id,data:{amount:0}}));
 await assert.rejects(cmd('update_obligation',{id:o.id,data:{amount:1.5}}));
 await cmd('no_expense',{id:o.id});assert.equal((await snap()).obligations.find((v:any)=>v.id===o.id).dataState,'NO_EXPENSE');
});
test('thanh toán nhiều lần; chặn vượt; không sửa nghĩa vụ dưới số đã trả; hủy phải có lý do',async()=>{
 const o=(await snap()).obligations.find((o:any)=>o.month===month);
 await cmd('update_obligation',{id:o.id,data:{amount:5000000}});
 const p=await cmd('payment',{obligationId:o.id,amount:2000000,paidDate:today,requestId:'payment-test'});
 await assert.rejects(cmd('payment',{obligationId:o.id,amount:4000000,paidDate:today}));
 await assert.rejects(cmd('update_obligation',{id:o.id,data:{amount:1000000}}));
 await assert.rejects(cmd('no_expense',{id:o.id}));
 await assert.rejects(cmd('cancel_payment',{id:p.id,reason:''}));
 await cmd('payment',{obligationId:o.id,amount:3000000,paidDate:today});
 const retry=await cmd('payment',{obligationId:o.id,amount:2000000,paidDate:today,requestId:'payment-test'});assert.equal(retry.id,p.id);
 await cmd('cancel_payment',{id:p.id,reason:'Ghi nhận nhầm'});
 assert.equal((await snap()).payments.find((v:any)=>v.id===p.id).status,'CANCELLED');
});
test('dời thứ Sáu sang tháng trước vẫn giữ nguyên kỳ',async()=>{
 const c=await cmd('create_card',{data:{name:'Cuối tuần',bankName:'Thử',defaultDueDay:1,autoWeekendShift:true,startTrackingMonth:'2026-01'}});
 await cmd('prepare',{months:['2026-02']});const o=(await snap()).obligations.find((o:any)=>o.cardId===c.id&&o.month==='2026-02');
 assert.equal(o.actualDueDate,'2026-01-30');assert.equal(o.month,'2026-02');
});
test('cập nhật hàng loạt lỗi phải rollback tất cả',async()=>{
 const o=(await snap()).obligations.find((o:any)=>o.month==='2028-02');
 await assert.rejects(cmd('batch_obligations',{updates:[{id:o.id,amount:1000000},{id:'missing',amount:2000000}]}));
 assert.equal((await snap()).obligations.find((v:any)=>v.id===o.id).dataState,'UNUPDATED');
});
test('nhập thay thế có lỗi không làm mất danh mục cũ',async()=>{
 const before=(await snap()).cards.length;
 await assert.rejects(cmd('import_cards',{replaceExisting:true,cards:[{name:'Hợp lệ',bankName:'A',defaultDueDay:10},{name:'Sai',bankName:'B',defaultDueDay:0}]}));
 assert.equal((await snap()).cards.length,before);
});
test('lịch nhắc không trùng trong ngày; giờ nhắc được lưu; không giữ SMTP mật khẩu',async()=>{
 await cmd('settings',{dailyDigestTime:'00:00',smtpPass:'do-not-store',emailEnabled:false});
 const d=(await snap()).obligations.find((o:any)=>o.month==='2028-02');await cmd('update_obligation',{id:d.id,data:{actualDueDate:'2020-01-01'}});
 const first=await cmd('check_reminders'),second=await cmd('check_reminders');assert.ok(first.generatedCount>0);assert.equal(second.generatedCount,0);assert.equal((await snap()).config.smtpPass,undefined);
});
test('nhắc lịch tùy chỉnh và dự đoán từ lịch sử',async()=>{
 const c=await cmd('create_card',{data:{name:'Lịch sử',bankName:'A',defaultDueDay:20,startTrackingMonth:'2020-01'}});
 await cmd('prepare',{months:['2020-01','2020-02','2020-03']});
 for(const o of (await snap()).obligations.filter((o:any)=>o.cardId===c.id&&o.month<'2020-04')){
  await cmd('update_obligation',{id:o.id,data:{amount:100}});
  await db.query(`update app_obligations set data=jsonb_set(data,'{firstDeclaredAt}',to_jsonb((month||'-10T05:00:00Z')::text)) where id=$1`,[o.id]);
 }
 await cmd('prepare',{months:['2020-04']});const o=(await snap()).obligations.find((o:any)=>o.cardId===c.id&&o.month==='2020-04');
 assert.equal(o.updateReminderSource,'MEDIAN_DECLARATION');assert.equal(o.updateReminderDate,'2020-04-09');
 await cmd('update_card',{id:c.id,data:{customUpdateReminderDaysBefore:0}});
 assert.equal((await snap()).obligations.find((v:any)=>v.id===o.id).updateReminderDate,'2020-04-20');
});
test('khôi phục đúng / khôi phục lỗi rollback / revision đổi khi xóa',async()=>{
 const d=await snap(),backup={...d,format:'so-thanh-toan-the-v1'};
 await cmd('restore',backup);assert.equal((await snap()).cards.length,d.cards.length);
 const bad=structuredClone(backup);bad.payments.push({...bad.payments[0],id:'bad-id',amount:999999999});await assert.rejects(cmd('restore',bad));assert.equal((await snap()).payments.length,d.payments.length);
 const revision=(await db.query<{revision:number}>('select revision from app_changes where user_id=$1',[uid])).rows[0].revision;
 await cmd('delete_cards',{ids:[d.cards[0].id]});assert.ok((await db.query<{revision:number}>('select revision from app_changes where user_id=$1',[uid])).rows[0].revision>revision);
});
test('RLS: tài khoản khác / anon không đọc; helper không thể giả user_id; không được sửa bảng trực tiếp',async()=>{
 const d=await snap();assert.ok(d.cards.length>0);await setUser(other);await db.exec('set role authenticated');
 assert.equal((await snap()).cards.length,0);
 await assert.rejects(cmd('delete_cards',{ids:[d.cards[0].id]}));
 await assert.rejects(db.query('select app_check_reminders($1)',[uid]));
 await assert.rejects(db.query('delete from app_cards'));
 await db.exec('reset role');await setUser('');await db.exec('set role anon');await assert.rejects(db.query('select * from app_cards'));await assert.rejects(cmd('prepare'));await db.exec('reset role');await setUser();
});
