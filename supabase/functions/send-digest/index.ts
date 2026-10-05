// Tùy chọn. Chỉ triển khai sau khi cấu hình Resend và lịch gọi phía máy chủ.
import {createClient} from 'npm:@supabase/supabase-js@2.57.0';
Deno.serve(async(req:Request)=>{
 const expected=Deno.env.get('CRON_SECRET');
 if(!expected || req.headers.get('Authorization')!==`Bearer ${expected}`)return new Response('Unauthorized',{status:401});
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const resend=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('EMAIL_FROM');
 if(!resend||!from)return new Response('Missing RESEND_API_KEY / EMAIL_FROM',{status:503});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data,error}=await db.from('app_notifications').select('id,user_id,data').eq('data->>channel','EMAIL').eq('data->>status','PENDING').order('id').limit(20);
 if(error)return new Response('Cannot read queue',{status:500});
 let sent=0,failed=0;
 for(const item of data||[]){
  const {data:settings,error:configError}=await db.from('app_settings').select('data').eq('user_id',item.user_id).single();
  if(configError||!settings?.data?.emailEnabled||!settings?.data?.targetEmail)continue;
  // Không gửi bản tin cũ còn treo; lấy nội dung mới từ các nghĩa vụ hiện tại.
  if(new Date(item.data.sentAt).getTime()<Date.now()-86400000){
   await db.from('app_notifications').update({data:{...item.data,status:'FAILED',deliveryError:'Bản tin cũ quá 24 giờ, không gửi'}}).eq('id',item.id);continue;
  }
  const {data:snapshot,error:snapshotError}=await db.from('app_obligations').select('id,data').eq('user_id',item.user_id);
  const {data:payments,error:paymentsError}=await db.from('app_payments').select('obligation_id,data').eq('user_id',item.user_id).eq('data->>status','VALID');
  if(snapshotError||paymentsError)continue;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const hasOpen=(snapshot||[]).some(o=>{
    if(o.data.dataState==='UNUPDATED')return o.data.updateReminderDate<=today;
    const total=(payments||[]).filter(p=>p.obligation_id===o.id).reduce((s,p)=>s+p.data.amount,0);
    return o.data.dataState==='DECLARED'&&o.data.amount>total;
  });
  if(!hasOpen){await db.from('app_notifications').update({data:{...item.data,status:'FAILED',deliveryError:'Đã giải quyết các nghĩa vụ; không gửi bản tin cũ'}}).eq('id',item.id);continue;}
  try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${resend}`,'Content-Type':'application/json','Idempotency-Key':`card-digest-${item.id}`},body:JSON.stringify({from,to:[settings.data.targetEmail],subject:item.data.title,text:'Anh có các khoản cần kiểm tra hoặc dữ liệu chưa cập nhật. Vui lòng mở Sổ thanh toán thẻ để xem tình trạng mới nhất.\n\n'+(Deno.env.get('APP_URL')||'')})});
   if(response.ok){const update=await db.from('app_notifications').update({data:{...item.data,status:'SUCCESS',deliveredAt:new Date().toISOString()}}).eq('id',item.id);if(update.error)throw update.error;sent++;}
   else if(response.status===429||response.status>=500){failed++;} // Giữ PENDING để thử lại với cùng khóa idempotency.
   else{await db.from('app_notifications').update({data:{...item.data,status:'FAILED',deliveryError:`Nhà cung cấp trả HTTP ${response.status}`}}).eq('id',item.id);failed++;}
  }catch{failed++;}
 }
 return Response.json({sent,failed});
});
