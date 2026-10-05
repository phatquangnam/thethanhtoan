import {supabase} from './supabase';
import {enrichObligation,getMonthSummary,matrixMonth,matrixYear,type Snapshot} from './domain';
import type {Card,UserConfig,ObligationViewItem,User} from './types';
import {parseYearMonth,pad2} from './utils/dateUtils';

async function command(action:string,args:unknown={}) {
 const {data,error}=await supabase.rpc('app_command',{action,args});
 if(error)throw new Error(error.message.includes('Could not find')?'Chưa tạo cơ sở dữ liệu. Hãy chạy tệp 01_TAO_CO_SO_DU_LIEU.sql trong Supabase.':error.message);
 return data;
}
async function snapshot():Promise<Snapshot> {
 const {data,error}=await supabase.rpc('app_snapshot');if(error)throw new Error(error.message);return data as Snapshot;
}
async function userId(){const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw new Error('Vui lòng đăng nhập lại');return data.user.id;}
async function enriched(id:string):Promise<ObligationViewItem>{const db=await snapshot();const uid=await userId();const o=db.obligations.find(o=>o.id===id);if(!o)throw new Error('Không tìm thấy nghĩa vụ');return enrichObligation(db,o,uid);}
function downloadJSON(data:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const api={
 async loadMonthData(month:string){
  await command('prepare',{months:[month]});const db=await snapshot();const uid=await userId();const {year,month:m}=parseYearMonth(month);
  const {data}=await supabase.auth.getUser();
  const user:User={id:uid,username:data.user!.email||'',email:data.user!.email||'',name:'Chủ thẻ',role:'user',createdAt:data.user!.created_at};
  return {summary:getMonthSummary(db,uid,month),obligations:db.obligations.filter(o=>o.month===month).map(o=>enrichObligation(db,o,uid)),matrix:matrixMonth(db,uid,year,m),cards:db.cards,notifications:db.notifications,config:{...db.config,userId:uid,targetEmail:db.config.targetEmail||user.email},user};
 },
 async getMe(){const d=await this.loadMonthData(new Date().toISOString().slice(0,7));return {user:d.user,config:d.config};},
 async getCards(){return (await snapshot()).cards;},
 async createCard(data:Partial<Card>):Promise<Card>{return command('create_card',{data});},
 async updateCard(id:string,data:Partial<Card>&{applyDueDayFromMonth?:string}):Promise<Card>{return command('update_card',{id,data});},
 async deleteCard(id:string){await command('delete_cards',{ids:[id],reason:'Người dùng xác nhận xóa thẻ và dữ liệu liên quan'});return {success:true,deletedCardId:id};},
 async deleteBatchCards(ids:string[]){await command('delete_cards',{ids});return {success:true,count:ids.length,deletedCardIds:ids};},
 async updateObligation(id:string,data:{amount?:number;actualDueDate?:string;notes?:string;reason?:string}){await command('update_obligation',{id,data,reason:data.reason});return enriched(id);},
 async confirmNoExpense(id:string){await command('no_expense',{id});return enriched(id);},
 async batchUpdateObligations(updates:any[],reason?:string):Promise<{success:boolean;updatedCount:number;errors:any[]}>{return command('batch_obligations',{updates,reason});},
 async applyWeekendShift(id:string){await command('weekend',{id});return enriched(id);},
 async recordPayment(data:{obligationId:string;amount:number;paidDate:string;notes?:string;referenceCode?:string;receiptUrl?:string|null;declaredAmount?:number;requestId?:string}){
  const payment=await command('payment',{...data,requestId:data.requestId||crypto.randomUUID()});return {payment,updatedObligation:await enriched(data.obligationId)};
 },
 async cancelPayment(id:string,reason:string){const p=await command('cancel_payment',{id,reason});return {success:true,updatedObligation:await enriched(p.obligationId)};},
 async getMatrixYear(year:number){await command('prepare',{months:Array.from({length:12},(_,i)=>`${year}-${pad2(i+1)}`)});return matrixYear(await snapshot(),await userId(),year);},
 async markNotificationRead(id:string){await command('read_notification',{id});},
 async markAllNotificationsRead(){await command('read_all');},
 async triggerReminderCheck(){return command('check_reminders');},
 async updateSettings(config:Partial<UserConfig>):Promise<UserConfig>{return command('settings',config);},
 async getNotifications(){const notifications=(await snapshot()).notifications;return {notifications,unreadCount:notifications.filter(n=>!n.read).length};},
 async getAuditLogs(){return (await snapshot()).auditLogs;},
 async importBatchCards(cards:any[],replaceExisting=false){return command('import_cards',{cards,replaceExisting});},
 async exportBackup(){const db=await snapshot();downloadJSON({format:'so-thanh-toan-the-v1',exportedAt:new Date().toISOString(),cards:db.cards,obligations:db.obligations,payments:db.payments,config:db.config},`Sao_luu_thanh_toan_the_${new Date().toISOString().slice(0,10)}.json`);},
 async importBackup(data:unknown){return command('restore',data);},
};
