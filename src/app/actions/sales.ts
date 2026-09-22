"use server";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { getFinanceSettings } from "@/lib/admin/runtime-settings";
import type { PaymentMethod } from "@/lib/finance/types";

export async function refundSale(input:{saleId:string;amount:number;paymentMethod:PaymentMethod;note?:string}){
  try{
    const {supabase}=await requireAdminUser();
    const settings=await getFinanceSettings();
    const amount=Math.round(Number(input.amount)*100)/100;
    if(!input.saleId||!Number.isFinite(amount)||amount<=0)return{error:"Enter a valid refund amount."};
    if(!settings.enabledPaymentMethods.includes(input.paymentMethod))return{error:"This refund method is disabled."};
    const {data,error}=await supabase.rpc("refund_pos_sale",{p_sale_id:input.saleId,p_amount:amount,p_method:input.paymentMethod,p_note:input.note?.trim()??""});
    if(error||!data)return{error:error?.message??"Refund could not be recorded."};
    ["/admin/finance","/admin/finance/sales","/admin/finance/register","/admin/appointments","/admin"].forEach((path) => revalidatePath(path));
    return{error:null,refundId:String(data)};
  }catch(error){console.error("SALE REFUND ERROR",error);return{error:"Refund could not be recorded."};}
}
